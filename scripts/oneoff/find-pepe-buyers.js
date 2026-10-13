#!/usr/bin/env node
"use strict";
const fs = require("node:fs");

const PEPE = "0x6982508145454ce325ddbe47a25d4ec3d2311933";
const PAIR = "0xa43fe16908251ee70ef74718545e4fe6c5ccec9f";
const API = "https://eth.blockscout.com/api";
const HEADERS = {
  accept: "application/json",
  "user-agent": "weaver-find-pepe-buyers/1.0",
};

function log(m) { process.stderr.write(m + "\n"); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function lower(v) { return String(v || "").toLowerCase(); }
function dayStart(day) { return Date.parse(day + "T00:00:00.000Z"); }

function formatUnits(raw, decimals) {
  let v;
  try { v = BigInt(String(raw)); } catch { return null; }
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  const frac = String(v % base).padStart(decimals, "0").replace(/0+$/, "");
  return whole + (frac ? "." + frac : "");
}

async function fetchJson(url, tries) {
  if (tries === undefined) tries = 4;
  for (let i = 0; i < tries; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    try {
      const res = await fetch(url, { headers: HEADERS, signal: ctrl.signal });
      clearTimeout(timer);
      if (res.status === 429 || res.status >= 500) {
        if (i + 1 < tries) { await sleep(5000 * Math.pow(2, i)); continue; }
      }
      if (!res.ok) { log("HTTP " + res.status); return null; }
      return await res.json();
    } catch (e) {
      clearTimeout(timer);
      if (i + 1 === tries) { log("err: " + e.message); return null; }
      await sleep(5000 * Math.pow(2, i));
    }
  }
  return null;
}

async function exactBlockAt(date) {
  const ts = Math.floor(dayStart(date) / 1000);
  const url = API + "?module=block&action=getblocknobytime&timestamp=" + ts + "&closest=before";
  const d = await fetchJson(url);
  const n = Number(d && d.result && d.result.blockNumber);
  return Number.isSafeInteger(n) ? n : null;
}

async function main() {
  function arg(name, fb) {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : fb;
  }
  const windowStart = arg("--window-start", "2026-08-12");
  const windowEnd = arg("--window-end", "2026-08-19");
  const minPepe = BigInt(arg("--min-pepe", "1000000000"));
  const outputPath = arg("--output", "pepe-buyers-candidates.json");

  log("=== find-pepe-buyers ===");
  log("window: " + windowStart + " .. " + windowEnd);

  const startBlock = await exactBlockAt(windowStart);
  const endBlock = await exactBlockAt(windowEnd);
  if (startBlock === null || endBlock === null) {
    log("block lookup failed"); process.exit(1);
  }
  log("blocks: " + startBlock + " .. " + endBlock);

  const pairLower = PAIR.toLowerCase();
  const pepeLower = PEPE.toLowerCase();
  const buyers = new Map();
  let page = 1;
  let totalRows = 0;

  while (page < 200) {
    const url = API + "?module=account&action=tokentx"
      + "&address=" + PAIR
      + "&startblock=" + startBlock
      + "&endblock=" + endBlock
      + "&sort=asc&page=" + page + "&offset=1000";
    const d = await fetchJson(url);
    if (!d || d.status !== "1") {
      log("page " + page + ": " + (d && d.message));
      break;
    }
    const rows = d.result || [];
    if (!rows.length) break;
    totalRows += rows.length;

    for (const r of rows) {
      if (lower(r.contractAddress) !== pepeLower) continue;
      if (lower(r.from) !== pairLower) continue;
      const to = lower(r.to);
      if (!to) continue;
      let raw;
      try { raw = BigInt(String(r.value)); } catch { continue; }
      const prev = buyers.get(to) || 0n;
      buyers.set(to, prev + raw);
    }
    log("page " + page + " rows=" + rows.length + " buyers=" + buyers.size);
    if (rows.length < 1000) break;
    page += 1;
    await sleep(1000);
  }

  log("scanned " + totalRows + " rows; " + buyers.size + " unique buyers");

  const candidates = [];
  buyers.forEach((raw, addr) => {
    if (raw >= minPepe) {
      candidates.push({
        address: addr,
        amountRaw: raw.toString(),
        amountFormatted: formatUnits(raw.toString(), 18),
      });
    }
  });
  candidates.sort((a, b) => BigInt(b.amountRaw) > BigInt(a.amountRaw) ? 1 : -1);

  log(candidates.length + " candidates >= " + minPepe);

  const out = {
    version: "pepe-buyers-candidates-v2",
    ranAt: new Date().toISOString(),
    method: "structural DEX-buy extraction via tokentx, block-bounded",
    pair: PAIR,
    token: PEPE,
    window: { start: windowStart, end: windowEnd, startBlock, endBlock },
    minPepe: minPepe.toString(),
    totalRows,
    candidateCount: candidates.length,
    candidates: candidates.slice(0, 200),
  };
  fs.writeFileSync(outputPath, JSON.stringify(out, null, 2));
  log("written: " + outputPath);
  console.log(JSON.stringify({ candidateCount: candidates.length, top10: candidates.slice(0, 10) }, null, 2));
}

main().catch(e => { console.error(e.stack || e); process.exit(1); });
