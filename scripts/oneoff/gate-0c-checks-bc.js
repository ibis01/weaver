#!/usr/bin/env node
"use strict";

/**
 * gate-0c-checks-bc.js
 *
 * Robustness checks for the Gate 0c permutation result.
 *
 * Check B — null preserves the hour-of-day of each actual buy.
 *           Rules out intra-day-price-bias explanation.
 * Check C — null resamples from every priced day, not just active days.
 *           Broadens the null to "random PEPE trading day."
 *
 * Uses the newest local pepe-*.json (must be non-empty — free tier only
 * serves last 365 days).
 *
 * Read-only. Writes: data/experiments/gate-0c-checks-bc-{date}.json
 */

const fs = require("node:fs");
const path = require("node:path");

const PEPE   = "0x6982508145454ce325ddbe47a25d4ec3d2311933";
const PAIR   = "0xa43fe16908251ee70ef74718545e4fe6c5ccec9f";
const QUOTES = new Set([
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  "0xdac17f958d2ee523a2206206994597c13d831ec7",
  "0x6b175474e89094c44da98b954eedeac495271d0f",
  "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
]);
const HORIZON_MS = 14 * 86400000;
const PERMUTATIONS = 10000;
const SEED = 20261018;

function log(m) { process.stderr.write(m + "\n"); }
function lower(s) { return (s || "").toLowerCase(); }
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function loadPrices() {
  const dir = "data/prices";
  // Pick newest NON-EMPTY pepe-*.json
  const files = fs.readdirSync(dir).filter((f) => f.startsWith("pepe-") && f.endsWith(".json"));
  for (const f of files.sort((a, b) => fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs)) {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const arr = (raw.prices || []).map(([ts, p]) => ({ ts, p })).sort((a, b) => a.ts - b.ts);
    if (arr.length > 0) {
      log("using prices: " + f + "  (" + arr.length + " points)");
      return { file: f, prices: arr };
    }
  }
  throw new Error("no non-empty pepe-*.json file in data/prices");
}

function priceAt(prices, ts) {
  let lo = 0, hi = prices.length - 1, best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (prices[mid].ts <= ts) { best = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  if (best === -1) return null;
  if (Math.abs(ts - prices[best].ts) > 2 * 86400000) return null;
  return prices[best].p;
}

function loadBuys(prices) {
  const dir = "data/trade-history";
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const buys = [];
  for (const f of files) {
    const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const wallet = lower(d.address);
    const byTx = new Map();
    for (const r of d.rows || []) {
      const tx = lower(r.hash);
      if (!byTx.has(tx)) byTx.set(tx, []);
      byTx.get(tx).push(r);
    }
    for (const [txHash, txRows] of byTx) {
      const pepInflow = txRows.find((r) => lower(r.to) === wallet && lower(r.contractAddress) === PEPE);
      if (!pepInflow) continue;
      const fromPair = lower(pepInflow.from) === PAIR;
      const withQuote = txRows.some((r) => lower(r.from) === wallet && QUOTES.has(lower(r.contractAddress)));
      if (!fromPair && !withQuote) continue;
      const ts = Number(pepInflow.timeStamp) * 1000;
      const p0 = priceAt(prices, ts);
      const p14 = priceAt(prices, ts + HORIZON_MS);
      if (p0 === null || p14 === null) continue;
      buys.push({ wallet, txHash, ts, fwd: (p14 - p0) / p0 });
    }
  }
  return buys;
}

function runPermutation(prices, buys, opts) {
  const { mode } = opts; // "hourMatch" | "wideNull"
  const rng = mulberry32(SEED);
  const N = buys.length;
  const observedMean = buys.reduce((s, b) => s + b.fwd, 0) / N;

  // Precompute null-candidate dates
  let dayPool;
  if (mode === "hourMatch") {
    // Active days (days any of these wallets bought)
    const s = new Set();
    for (const b of buys) s.add(Math.floor(b.ts / 86400000));
    dayPool = [...s].sort();
  } else {
    // Every day in price file
    const s = new Set();
    for (const p of prices) s.add(Math.floor(p.ts / 86400000));
    dayPool = [...s].sort();
  }

  const nullMeans = [];
  for (let it = 0; it < PERMUTATIONS; it++) {
    let sum = 0, valid = 0;
    for (let i = 0; i < N; i++) {
      const day = dayPool[Math.floor(rng() * dayPool.length)];
      let ts;
      if (mode === "hourMatch") {
        // Same hour-of-day as the actual buy, different calendar day
        const hourMs = buys[i].ts % 86400000;
        ts = day * 86400000 + hourMs;
      } else {
        // Wide null: midday of random priced day
        ts = day * 86400000 + 43200000;
      }
      const p0 = priceAt(prices, ts);
      const p14 = priceAt(prices, ts + HORIZON_MS);
      if (p0 === null || p14 === null) continue;
      sum += (p14 - p0) / p0;
      valid++;
    }
    if (valid === N) nullMeans.push(sum / N);
  }
  nullMeans.sort((a, b) => a - b);
  const p = nullMeans.filter((x) => x >= observedMean).length / nullMeans.length;
  return {
    mode,
    dayPoolSize: dayPool.length,
    validPerms: nullMeans.length,
    observedMean,
    nullP50: nullMeans[Math.floor(nullMeans.length / 2)],
    nullP95: nullMeans[Math.floor(nullMeans.length * 0.95)],
    pValue: p,
  };
}

function main() {
  const { file, prices } = loadPrices();
  const buys = loadBuys(prices);
  log("priced buys: " + buys.length);
  if (buys.length < 20) { console.error("too few priced buys"); process.exit(2); }

  const mean = buys.reduce((s, b) => s + b.fwd, 0) / buys.length;
  log("observed mean: " + (mean * 100).toFixed(2) + "%");
  log("");

  log("running Check B (null preserves hour-of-day) ...");
  const B = runPermutation(prices, buys, { mode: "hourMatch" });
  log("  p = " + B.pValue.toFixed(4) + "  null p95 = " + (B.nullP95 * 100).toFixed(2) + "%");

  log("running Check C (wide null — any priced day) ...");
  const C = runPermutation(prices, buys, { mode: "wideNull" });
  log("  p = " + C.pValue.toFixed(4) + "  null p95 = " + (C.nullP95 * 100).toFixed(2) + "%");

  const out = {
    version: "gate-0c-checks-bc-v1",
    generatedAt: new Date().toISOString(),
    pricesFile: file,
    pricePointCount: prices.length,
    pricedBuys: buys.length,
    distinctWallets: new Set(buys.map((b) => b.wallet)).size,
    dateRange: [
      new Date(Math.min(...buys.map((b) => b.ts))).toISOString().slice(0, 10),
      new Date(Math.max(...buys.map((b) => b.ts))).toISOString().slice(0, 10),
    ],
    observedMean: mean,
    checkB: B,
    checkC: C,
    interpretation: {
      survivedB: B.pValue < 0.05 && mean > 0,
      survivedC: C.pValue < 0.05 && mean > 0,
      note: "Both checks must hold for the finding to be robust. If B holds but C fails, the wallets beat their own random active days but not random PEPE days — suggests intra-day timing matters more than date selection.",
    },
  };

  fs.mkdirSync("data/experiments", { recursive: true });
  const outPath = "data/experiments/gate-0c-checks-bc-" + new Date().toISOString().slice(0, 10) + ".json";
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

  log("");
  log("=== RESULTS ===");
  log("  B (hour-matched null): p=" + B.pValue.toFixed(4) + "  " + (out.interpretation.survivedB ? "SURVIVED" : "FAILED"));
  log("  C (wide null):         p=" + C.pValue.toFixed(4) + "  " + (out.interpretation.survivedC ? "SURVIVED" : "FAILED"));
  log("");
  log("written: " + outPath);

  console.log(JSON.stringify({
    pricesFile: file,
    pricedBuys: buys.length,
    distinctWallets: out.distinctWallets,
    dateRange: out.dateRange,
    observedMean: Number((mean * 100).toFixed(2)),
    checkB: { pValue: Number(B.pValue.toFixed(4)), nullP95: Number((B.nullP95 * 100).toFixed(2)), survived: out.interpretation.survivedB },
    checkC: { pValue: Number(C.pValue.toFixed(4)), nullP95: Number((C.nullP95 * 100).toFixed(2)), survived: out.interpretation.survivedC },
  }, null, 2));
}

main();
