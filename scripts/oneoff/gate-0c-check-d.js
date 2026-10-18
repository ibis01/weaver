#!/usr/bin/env node
"use strict";
/**
 * Check D — month-matched null. For each priced buy, resample
 * entry dates only from the same calendar month. If the wallets
 * beat random days within their own chosen months, skill is
 * independent of month selection. If not, the earlier result is
 * driven by the months the population was selected on (August 2026).
 */

const fs = require("node:fs");
const path = require("node:path");

const PEPE = "0x6982508145454ce325ddbe47a25d4ec3d2311933";
const PAIR = "0xa43fe16908251ee70ef74718545e4fe6c5ccec9f";
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
  const files = fs.readdirSync(dir).filter((f) => f.startsWith("pepe-") && f.endsWith(".json"));
  for (const f of files.sort((a, b) => fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs)) {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const arr = (raw.prices || []).map(([ts, p]) => ({ ts, p })).sort((a, b) => a.ts - b.ts);
    if (arr.length > 0) { log("prices: " + f + " (" + arr.length + ")"); return { file: f, prices: arr }; }
  }
  throw new Error("no non-empty pepe file");
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

function loadBuys(prices) {
  const dir = "data/trade-history";
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const buys = [];
  for (const f of files) {
    const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const w = lower(d.address);
    const byTx = new Map();
    for (const r of d.rows || []) {
      const tx = lower(r.hash);
      if (!byTx.has(tx)) byTx.set(tx, []);
      byTx.get(tx).push(r);
    }
    for (const [txHash, rows] of byTx) {
      const inflow = rows.find((r) => lower(r.to) === w && lower(r.contractAddress) === PEPE);
      if (!inflow) continue;
      const fromPair = lower(inflow.from) === PAIR;
      const withQuote = rows.some((r) => lower(r.from) === w && QUOTES.has(lower(r.contractAddress)));
      if (!fromPair && !withQuote) continue;
      const ts = Number(inflow.timeStamp) * 1000;
      const p0 = priceAt(prices, ts);
      const p14 = priceAt(prices, ts + HORIZON_MS);
      if (p0 === null || p14 === null) continue;
      buys.push({ wallet: w, ts, fwd: (p14 - p0) / p0 });
    }
  }
  return buys;
}

function monthKey(ts) {
  const d = new Date(ts);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

function main() {
  const { file, prices } = loadPrices();
  const buys = loadBuys(prices);
  if (buys.length < 20) { console.error("too few buys"); process.exit(2); }

  const N = buys.length;
  const observedMean = buys.reduce((s, b) => s + b.fwd, 0) / N;

  // Group actual buys by month and compute per-month mean
  const byMonth = new Map();
  for (const b of buys) {
    const m = monthKey(b.ts);
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m).push(b.fwd);
  }

  // Per-month forward-return distribution from prices
  const monthForwardRets = new Map();
  for (const p of prices) {
    const m = monthKey(p.ts);
    const p14 = priceAt(prices, p.ts + HORIZON_MS);
    if (p14 === null) continue;
    if (!monthForwardRets.has(m)) monthForwardRets.set(m, []);
    monthForwardRets.get(m).push((p14 - p.p) / p.p);
  }

  // Month-matched permutation
  const rng = mulberry32(SEED);
  const buyMonths = buys.map((b) => monthKey(b.ts));
  const nullMeans = [];
  let dropped = 0;
  for (let it = 0; it < PERMUTATIONS; it++) {
    let sum = 0, valid = 0;
    for (let i = 0; i < N; i++) {
      const pool = monthForwardRets.get(buyMonths[i]);
      if (!pool || pool.length === 0) continue;
      sum += pool[Math.floor(rng() * pool.length)];
      valid++;
    }
    if (valid === N) nullMeans.push(sum / N);
    else dropped++;
  }
  nullMeans.sort((a, b) => a - b);
  const p = nullMeans.filter((x) => x >= observedMean).length / nullMeans.length;

  log("");
  log("=== Check D — month-matched null ===");
  log("  observed mean: " + (observedMean * 100).toFixed(2) + "%");
  log("  null p50: " + (nullMeans[Math.floor(nullMeans.length / 2)] * 100).toFixed(2) + "%");
  log("  null p95: " + (nullMeans[Math.floor(nullMeans.length * 0.95)] * 100).toFixed(2) + "%");
  log("  p-value: " + p.toFixed(4));
  log("  valid permutations: " + nullMeans.length + " / " + PERMUTATIONS);
  log("");
  log("=== per-month breakdown (observed buys vs month baseline) ===");
  log("  month        n_buys  observed_mean  month_baseline_mean  delta");
  const sortedMonths = [...byMonth.keys()].sort();
  for (const m of sortedMonths) {
    const rets = byMonth.get(m);
    const obsM = rets.reduce((a, b) => a + b, 0) / rets.length;
    const baseRets = monthForwardRets.get(m) || [];
    const baseM = baseRets.length ? baseRets.reduce((a, b) => a + b, 0) / baseRets.length : null;
    const y = Math.floor(m / 12), mo = (m % 12) + 1;
    log("  " + y + "-" + String(mo).padStart(2, "0") + "  " + String(rets.length).padStart(6) +
        "  " + ((obsM * 100).toFixed(2) + "%").padStart(13) +
        "  " + ((baseM !== null ? (baseM * 100).toFixed(2) + "%" : "n/a").padStart(19)) +
        "  " + ((baseM !== null ? ((obsM - baseM) * 100).toFixed(2) + "%" : "n/a").padStart(8)));
  }

  const out = {
    version: "gate-0c-check-d-v1",
    generatedAt: new Date().toISOString(),
    pricesFile: file,
    pricedBuys: N,
    observedMean,
    nullP50: nullMeans[Math.floor(nullMeans.length / 2)],
    nullP95: nullMeans[Math.floor(nullMeans.length * 0.95)],
    pValue: p,
    validPermutations: nullMeans.length,
    droppedPermutations: dropped,
    perMonth: sortedMonths.map((m) => {
      const rets = byMonth.get(m);
      const baseRets = monthForwardRets.get(m) || [];
      return {
        month: Math.floor(m / 12) + "-" + String((m % 12) + 1).padStart(2, "0"),
        nBuys: rets.length,
        observedMean: rets.reduce((a, b) => a + b, 0) / rets.length,
        baselineMean: baseRets.length ? baseRets.reduce((a, b) => a + b, 0) / baseRets.length : null,
      };
    }),
    verdict: p < 0.05 && observedMean > 0 ? "SKILL_ROBUST_TO_MONTH" : "EFFECT_MONTH_DRIVEN",
  };

  fs.mkdirSync("data/experiments", { recursive: true });
  const outPath = "data/experiments/gate-0c-check-d-" + new Date().toISOString().slice(0, 10) + ".json";
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

  log("");
  log("  VERDICT: " + out.verdict);
  log("  written: " + outPath);
}

main();
