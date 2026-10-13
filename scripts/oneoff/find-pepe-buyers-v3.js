#!/usr/bin/env node
"use strict";
const fs = require("node:fs");

const PEPE = "0x6982508145454ce325ddbe47a25d4ec3d2311933";
const PAIR = "0xa43fe16908251ee70ef74718545e4fe6c5ccec9f";
const API  = "https://api.blockscout.com/1/api";
const KEY  = process.env.BLOCKSCOUT_API_KEY || "";

// Canonical Uniswap V2 Swap event topic hash.
const SWAP_TOPIC = "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822";

const HEADERS = { accept: "application/json", "user-agent": "weaver-find-pepe-buyers/3.0" };

function log(m) { process.stderr.write(m + "\n"); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function lower(v) { return String(v || "").toLowerCase(); }

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
      const rps = res.headers.get("x-ratelimit-remaining");
      if (rps !== null) process.stderr.write("  [rps:" + rps + "]");
      if (res.status === 429) {
        if (i + 1 < tries) { const w = 3000 * Math.pow(2, i); log(" 429 sleep " + w + "ms"); await sleep(w); continue; }
      }
      if (res.status === 402) { log(" 402 out of credits"); return null; }
      if (!res.ok) { log(" HTTP " + res.status); return null; }
      return await res.json();
    } catch (e) {
      clearTimeout(timer);
      if (i + 1 === tries) { log(" err: " + e.message); return null; }
      await sleep(3000 * Math.pow(2, i));
    }
  }
  return null;
}

async function exactBlockAt(date) {
  const ts = Math.floor(Date.parse(date + "T00:00:00Z") / 1000);
  const d = await fetchJson(
    "https://api.blockscout.com/1/api?module=block&action=getblocknobytime&timestamp=" + ts + "&closest=before"
  );
  const n = Number(d && d.result && d.result.blockNumber);
  return Number.isSafeInteger(n) ? n : null;
}

async function main() {
  function arg(name, fb) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fb; }
  const windowStart = arg("--window-start", "2026-08-12");
  const windowEnd   = arg("--window-end",   "2026-08-19");
  const minPepe     = BigInt(arg("--min-pepe", "1000000000"));
  const output      = arg("--output", "pepe-buyers-final.json");

  log("=== find-pepe-buyers-v3 (Swap event) ===");

  const startBlock = await exactBlockAt(windowStart);
  await sleep(300);
  const endBlock = await exactBlockAt(windowEnd);
  if (startBlock === null || endBlock === null) { log("block lookup failed"); process.exit(1); }
  log("blocks: " + startBlock + " .. " + endBlock);

  // One call: all Swap events on the pair in the range.
  const q = "?module=logs&action=getLogs"
    + "&fromBlock=" + startBlock
    + "&toBlock=" + endBlock
    + "&address=" + PAIR
    + "&topic0=" + SWAP_TOPIC;

  const d = await fetchJson("https://api.blockscout.com/1/api" + q);
  if (!d || d.status !== "1") { log("getLogs failed: " + JSON.stringify(d).slice(0,200)); process.exit(1); }
  const logs = d.result || [];
  log("swap events: " + logs.length);

  const buyers = new Map();
  for (const ev of logs) {
    const topics = ev.topics || [];
    if (topics.length < 3) continue;
    // topic[2] is the indexed `to` address (last 40 hex chars).
    const to = "0x" + topics[2].slice(26).toLowerCase();
    // value fields are non-indexed in the data payload.
    // For a PEPE/WETH pair, PEPE out = amount0Out or amount1Out.
    // Determine which token is PEPE by checking token0/token1 of the pair.
    // We accumulate the total PEPE received by `to` in this swap.
    const data = ev.data || "0x";
    if (data.length < 2 + 64 * 4) continue;
    const amount0In  = BigInt("0x" + data.slice(2, 66));
    const amount1In  = BigInt("0x" + data.slice(66, 130));
    const amount0Out = BigInt("0x" + data.slice(130, 194));
    const amount1Out = BigInt("0x" + data.slice(194, 258));
    // PEPE is token0 on this pair (established earlier).
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
    version: "pepe-buyers-final",
    ranAt: new Date().toISOString(),
    method: "Swap event extraction: wallets that received PEPE from the Uniswap V2 PEPE/WETH pair via the pair's own Swap event",
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
    top10: candidates.slice(0, 10),
  }, null, 2));
}
main().catch(e => { console.error(e.stack || e); process.exit(1); });
