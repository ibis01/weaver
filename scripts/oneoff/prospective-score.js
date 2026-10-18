#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const HORIZON_MS = 14 * 86400000;
const EARLY_THRESHOLD = 0.20;

function log(m) { process.stderr.write(m + "\n"); }

function loadPrices() {
  const dir = "data/prices";
  const files = fs.readdirSync(dir).filter((f) => f.startsWith("pepe-") && f.endsWith(".json"));
  for (const f of files.sort((a, b) => fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs)) {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const arr = (raw.prices || []).map(([ts, p]) => ({ ts, p })).sort((a, b) => a.ts - b.ts);
    if (arr.length > 0) return { file: f, prices: arr };
  }
  throw new Error("no non-empty pepe-*.json");
}

function priceAt(prices, ts) {
  let lo = 0, hi = prices.length - 1, best = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (prices[m].ts <= ts) { best = m; lo = m + 1; } else { hi = m - 1; }
  }
  if (best === -1) return null;
  if (Math.abs(ts - prices[best].ts) > 2 * 86400000) return null;
  return prices[best].p;
}

function main() {
  const buysPath = "data/prospective/buys.jsonl";
  const outPath = "data/prospective/outcomes.jsonl";
  if (!fs.existsSync(buysPath)) { log("no buys yet"); return; }

  const buys = fs.readFileSync(buysPath, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  log("buys: " + buys.length);

  const existing = new Set();
  if (fs.existsSync(outPath)) {
    for (const l of fs.readFileSync(outPath, "utf8").split("\n").filter(Boolean)) {
      try { existing.add(JSON.parse(l).txHash); } catch {}
    }
  }
  log("already scored: " + existing.size);

  const { prices } = loadPrices();
  const now = Date.now();
  let newScores = 0, unresolved = 0, notYet = 0;

  const outFh = fs.openSync(outPath, "a");
  for (const b of buys) {
    if (existing.has(b.txHash)) continue;
    if (b.timestamp + HORIZON_MS > now) { notYet++; continue; }
    const p0 = priceAt(prices, b.timestamp);
    const p14 = priceAt(prices, b.timestamp + HORIZON_MS);
    if (p0 === null || p14 === null) {
      fs.writeSync(outFh, JSON.stringify({ txHash: b.txHash, status: "unresolved" }) + "\n");
      unresolved++;
      continue;
    }
    const fwd = (p14 - p0) / p0;
    const early = fwd >= EARLY_THRESHOLD ? 1 : 0;
    fs.writeSync(outFh, JSON.stringify({
      txHash: b.txHash, wallet: b.wallet, timestamp: b.timestamp,
      fwdReturn: fwd, early, status: "resolved",
      scoredAt: new Date().toISOString(),
    }) + "\n");
    newScores++;
  }
  fs.closeSync(outFh);

  log("scored: " + newScores + "  unresolved: " + unresolved + "  not-yet-window: " + notYet);

  if (existing.size + newScores + unresolved > 0) {
    const all = fs.readFileSync(outPath, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const resolved = all.filter((r) => r.status === "resolved");
    if (resolved.length) {
      const early = resolved.filter((r) => r.early === 1).length;
      const meanFwd = resolved.reduce((s, r) => s + r.fwdReturn, 0) / resolved.length;
      log("");
      log("=== running totals ===");
      log("  resolved: " + resolved.length);
      log("  early fraction: " + (early / resolved.length * 100).toFixed(1) + "%");
      log("  mean forward return: " + (meanFwd * 100).toFixed(2) + "%");
    }
  }
}

main();
