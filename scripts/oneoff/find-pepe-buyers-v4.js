#!/usr/bin/env node
"use strict";
const fs = require("node:fs");

const PEPE = "0x6982508145454ce325ddbe47a25d4ec3d2311933";
const PAIR = "0xa43fe16908251ee70ef74718545e4fe6c5ccec9f";
const API  = "https://api.blockscout.com/1/api";
const KEY  = process.env.BLOCKSCOUT_API_KEY || "";
const SWAP_TOPIC = "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822";
const HEADERS = { accept: "application/json", "user-agent": "weaver-find-pepe-buyers/4.0" };

function log(m) { process.stderr.write(m + "\n"); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function authUrl(url) {
  if (!KEY) return url;
  return url + (url.includes("?") ? "&" : "?") + "apikey=" + encodeURIComponent(KEY);
}
function formatUnits(raw, decimals) {
  let v; try { v = BigInt(String(raw)); } catch { return null; }
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  const frac = String(v % base).padStart(decimals, "0").replace(/0+$/, "");
  return whole + (frac ? "." + frac : "");
}

async function fetchJson(url, tries) {
  if (tries === undefined) tries = 5;
  for (let i = 0; i < tries; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    try {
      const res = await fetch(authUrl(url), { headers: HEADERS, signal: ctrl.signal });
      clearTimeout(timer);
      if (res.status === 429) {
        if (i + 1 < tries) { const w = 3000 * Math.pow(2, i); log("    429 sleep " + w + "ms"); await sleep(w); continue; }
      }
      if (res.status === 402) { log("    402 out of credits"); return null; }
      if (!res.ok) { log("    HTTP " + res.status); return null; }
      return await res.json();
    } catch (e) {
      clearTimeout(timer);
      if (i + 1 === tries) { log("    err: " + e.message); return null; }
      await sleep(3000 * Math.pow(2, i));
    }
  }
  return null;
}

async function exactBlockAt(date) {
  const ts = Math.floor(Date.parse(date + "T00:00:00Z") / 1000);
  const d = await fetchJson(API + "?module=block&action=getblocknobytime&timestamp=" + ts + "&closest=before");
  const n = Number(d && d.result && d.result.blockNumber);
  return Number.isSafeInteger(n) ? n : null;
}

async function fetchSwapLogs(startBlock, endBlock, chunkSize) {
  const all = [];
  let cursor = startBlock;
  let chunk = 0;
  while (cursor <= endBlock) {
    const chunkEnd = Math.min(cursor + chunkSize - 1, endBlock);
    chunk++;
    log("  chunk " + chunk + ": blocks " + cursor + ".." + chunkEnd);
    const q = "?module=logs&action=getLogs"
      + "&fromBlock=" + cursor
      + "&toBlock=" + chunkEnd
      + "&address=" + PAIR
      + "&topic0=" + SWAP_TOPIC;
    const d = await fetchJson(API + q);
    if (!d || d.status !== "1") {
      log("    chunk failed: " + JSON.stringify(d).slice(0, 150));
      cursor = chunkEnd + 1;
      await sleep(500);
      continue;
    }
    const logs = d.result || [];
    log("    -> " + logs.length + " events");
    if (logs.length >= 1000) {
      // Half the chunk size and retry this range
      log("    truncation hit, splitting chunk");
      const mid = Math.floor((cursor + chunkEnd) / 2);
      const sub1 = await fetchJson(API + "?module=logs&action=getLogs&fromBlock=" + cursor + "&toBlock=" + mid + "&address=" + PAIR + "&topic0=" + SWAP_TOPIC);
      const sub2 = await fetchJson(API + "?module=logs&action=getLogs&fromBlock=" + (mid+1) + "&toBlock=" + chunkEnd + "&address=" + PAIR + "&topic0=" + SWAP_TOPIC);
      if (sub1 && sub1.status === "1") all.push(...(sub1.result || []));
      if (sub2 && sub2.status === "1") all.push(...(sub2.result || []));
      log("    split yielded " + ((sub1?.result?.length||0) + (sub2?.result?.length||0)) + " events");
    } else {
      all.push(...logs);
    }
    cursor = chunkEnd + 1;
    await sleep(300);
  }
  return all;
}

async function main() {
  function arg(name, fb) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fb; }
  const windowStart = arg("--window-start", "2026-08-12");
  const windowEnd   = arg("--window-end",   "2026-08-19");
  const minPepe     = BigInt(arg("--min-pepe", "1000000000"));
  const chunkSize   = Number(arg("--chunk-size", "5000"));
  const output      = arg("--output", "pepe-buyers-final-v4.json");

  log("=== find-pepe-buyers-v4 (chunked Swap events) ===");

  const startBlock = await exactBlockAt(windowStart);
  await sleep(300);
  const endBlock = await exactBlockAt(windowEnd);
  if (startBlock === null || endBlock === null) { log("block lookup failed"); process.exit(1); }
  log("blocks: " + startBlock + " .. " + endBlock + " (span " + (endBlock - startBlock) + ")");

  const logs = await fetchSwapLogs(startBlock, endBlock, chunkSize);
  log("total swap events collected: " + logs.length);

  const buyers = new Map();
  for (const ev of logs) {
    const topics = ev.topics || [];
    if (topics.length < 3) continue;
    const to = "0x" + topics[2].slice(26).toLowerCase();
    const data = ev.data || "0x";
    if (data.length < 2 + 64 * 4) continue;
    const amount0Out = BigInt("0x" + data.slice(130, 194));
    const pepeOut = amount0Out;
    if (pepeOut <= 0n) continue;
    const prev = buyers.get(to) || 0n;
    buyers.set(to, prev + pepeOut);
  }

  const candidates = [];
  buyers.forEach((raw, addr) => {
    if (raw >= minPepe) candidates.push({
      address: addr,
      amountRaw: raw.toString(),
      amountFormatted: formatUnits(raw.toString(), 18),
    });
  });
  candidates.sort((a, b) => BigInt(b.amountRaw) > BigInt(a.amountRaw) ? 1 : -1);

  log("unique buyers: " + buyers.size);
  log("candidates >= " + minPepe + ": " + candidates.length);

  const out = {
    version: "pepe-buyers-final-v4",
    ranAt: new Date().toISOString(),
    method: "chunked Swap event extraction with truncation splitting",
    pair: PAIR,
    token: PEPE,
    swapTopic: SWAP_TOPIC,
    window: { start: windowStart, end: windowEnd, startBlock, endBlock },
    minPepe: minPepe.toString(),
    swapEventCount: logs.length,
    uniqueBuyers: buyers.size,
    candidateCount: candidates.length,
    candidates: candidates.slice(0, 500),
  };
  fs.writeFileSync(output, JSON.stringify(out, null, 2));
  log("written: " + output);
  console.log(JSON.stringify({
    candidateCount: candidates.length,
    swapEventCount: logs.length,
    uniqueBuyers: buyers.size,
    top10: candidates.slice(0, 10),
  }, null, 2));
}
main().catch(e => { console.error(e.stack || e); process.exit(1); });
