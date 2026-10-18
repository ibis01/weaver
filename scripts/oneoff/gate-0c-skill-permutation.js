#!/usr/bin/env node
"use strict";

/**
 * gate-0c-skill-permutation.js
 *
 * Gate 0c — Retrospective wallet timing-skill test via permutation.
 *
 * For each qualifying PEPE purchase by each of the 49 v2 buyers,
 * compute the 14-day forward return. Aggregate at the population
 * level. Build a null distribution by resampling entry dates from
 * the pooled active-date set (all days on which any of the 49
 * wallets bought). One-sided permutation p-value.
 *
 * No control population. No per-wallet floor. No window selection.
 * The null spans five years of PEPE history with real return variance.
 *
 * Read-only.
 *
 * Requires:
 *   data/trade-history/*.json
 *   data/prices/pepe-365d.json  (or newest pepe-*.json)
 *
 * Writes: data/experiments/gate-0c-skill-permutation-{date}.json
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const PEPE       = "0x6982508145454ce325ddbe47a25d4ec3d2311933";
const PAIR       = "0xa43fe16908251ee70ef74718545e4fe6c5ccec9f";
const QUOTES     = new Set([
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // WETH
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC
  "0xdac17f958d2ee523a2206206994597c13d831ec7", // USDT
  "0x6b175474e89094c44da98b954eedeac495271d0f", // DAI
  "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", // WBTC
]);
const HORIZON_DAYS = 14;
const HORIZON_MS   = HORIZON_DAYS * 86400000;
const PERMUTATIONS = 10000;
const SEED         = 20261018;

function log(m) { process.stderr.write(m + "\n"); }
function lower(s) { return (s || "").toLowerCase(); }

// Deterministic RNG so runs are reproducible
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
  if (!files.length) throw new Error("no pepe-*.json in data/prices");
  const newest = files
    .map((f) => ({ f, m: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m)[0].f;
  log("prices: " + newest);
  const raw = JSON.parse(fs.readFileSync(path.join(dir, newest), "utf8"));
  const arr = (raw.prices || []).map(([ts, p]) => ({ ts, p })).sort((a, b) => a.ts - b.ts);
  return arr;
}

function priceAt(prices, ts) {
  let lo = 0, hi = prices.length - 1, best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (prices[mid].ts <= ts) { best = mid; lo = mid + 1; }
    else { hi = mid - 1; }
  }
  if (best === -1) return null;
  if (Math.abs(ts - prices[best].ts) > 2 * 86400000) return null;
  return prices[best].p;
}

// Identify buys from trade-history rows.
// A buy: (a) wallet has PEPE inflow, AND
//        (b) either PEPE inflow came directly from the pair,
//            or wallet has a QUOTES outflow in the same tx
function extractBuys() {
  const dir = "data/trade-history";
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  log("wallets: " + files.length);

  const buys = [];
  let totalRows = 0;
  let pepInflows = 0;
  let fromPair = 0;
  let withQuote = 0;

  for (const f of files) {
    const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const wallet = lower(d.address);
    const rows = d.rows || [];
    totalRows += rows.length;

    // Group by tx hash
    const byTx = new Map();
    for (const r of rows) {
      const txHash = lower(r.hash);
      if (!byTx.has(txHash)) byTx.set(txHash, []);
      byTx.get(txHash).push(r);
    }

    for (const [txHash, txRows] of byTx) {
      const pepInflow = txRows.find(
        (r) => lower(r.to) === wallet &&
               lower(r.contractAddress) === PEPE
      );
      if (!pepInflow) continue;
      pepInflows++;

      const pepFrom = lower(pepInflow.from);
      const isFromPair = pepFrom === PAIR;
      if (isFromPair) fromPair++;

      const hasQuoteOut = txRows.some(
        (r) => lower(r.from) === wallet &&
               QUOTES.has(lower(r.contractAddress))
      );
      if (hasQuoteOut) withQuote++;

      if (!isFromPair && !hasQuoteOut) continue;

      const ts = Number(pepInflow.timeStamp) * 1000;
      if (!Number.isFinite(ts) || ts <= 0) continue;

      buys.push({
        wallet,
        txHash,
        ts,
        pepAmount: pepInflow.value,
        via: isFromPair ? "fromPair" : "withQuote",
      });
    }
  }

  log("rows: " + totalRows + "  pepInflows: " + pepInflows +
      "  fromPair: " + fromPair + "  withQuote: " + withQuote +
      "  buys: " + buys.length);
  return buys;
}

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function main() {
  const prices = loadPrices();
  log("price points: " + prices.length);

  const buys = extractBuys();

  // Compute forward returns
  const priced = [];
  let dropped = 0;
  for (const b of buys) {
    const p0 = priceAt(prices, b.ts);
    const p14 = priceAt(prices, b.ts + HORIZON_MS);
    if (p0 === null || p14 === null) { dropped++; continue; }
    b.fwd = (p14 - p0) / p0;
    priced.push(b);
  }
  log("priced buys: " + priced.length + "  dropped (no price): " + dropped);

  if (priced.length < 20) {
    console.error("FATAL: only " + priced.length + " priced buys — insufficient for permutation test");
    process.exit(2);
  }

  // Observed statistics
  const rets = priced.map((b) => b.fwd).sort((a, b) => a - b);
  const observed = {
    n: rets.length,
    mean: rets.reduce((a, b) => a + b, 0) / rets.length,
    median: quantile(rets, 0.5),
    fracPositive: rets.filter((r) => r > 0).length / rets.length,
    fracOver20: rets.filter((r) => r >= 0.20).length / rets.length,
    fracUnder20: rets.filter((r) => r <= -0.20).length / rets.length,
  };

  // Active date pool: all calendar days (UTC) on which any priced buy occurred.
  // For the null, we resample from this pool.
  const activeDays = [];
  const seen = new Set();
  for (const b of priced) {
    const day = Math.floor(b.ts / 86400000);
    if (!seen.has(day)) { seen.add(day); activeDays.push(day); }
  }
  activeDays.sort();
  log("active days in pool: " + activeDays.length);

  // Precompute forward return for every active day (so permutation is fast)
  const dayReturns = new Map();
  for (const day of activeDays) {
    const ts = day * 86400000 + 43200000; // midday UTC to avoid boundary
    const p0 = priceAt(prices, ts);
    const p14 = priceAt(prices, ts + HORIZON_MS);
    if (p0 !== null && p14 !== null) dayReturns.set(day, (p14 - p0) / p0);
  }
  const usableDays = [...dayReturns.keys()];
  log("usable days for null: " + usableDays.length);
  if (usableDays.length < 50) {
    console.error("FATAL: only " + usableDays.length + " usable days for null resampling");
    process.exit(2);
  }

  // Permutation
  const rng = mulberry32(SEED);
  const nullMeans = [];
  const nullFracPos = [];
  const N = priced.length;

  for (let it = 0; it < PERMUTATIONS; it++) {
    let sum = 0, pos = 0;
    for (let i = 0; i < N; i++) {
      const day = usableDays[Math.floor(rng() * usableDays.length)];
      const r = dayReturns.get(day);
      sum += r;
      if (r > 0) pos++;
    }
    nullMeans.push(sum / N);
    nullFracPos.push(pos / N);
  }

  nullMeans.sort((a, b) => a - b);
  nullFracPos.sort((a, b) => a - b);

  // One-sided p-values: fraction of null >= observed
  const pMean = nullMeans.filter((x) => x >= observed.mean).length / PERMUTATIONS;
  const pFracPos = nullFracPos.filter((x) => x >= observed.fracPositive).length / PERMUTATIONS;

  const out = {
    version: "gate-0c-skill-permutation-v1",
    generatedAt: new Date().toISOString(),
    seed: SEED,
    horizonDays: HORIZON_DAYS,
    permutations: PERMUTATIONS,
    buyDefinition: "PEPE inflow where (a) inflow from pair OR (b) wallet has QUOTES outflow in same tx",
    pricesFile: fs.readdirSync("data/prices").filter((f) => f.startsWith("pepe-"))[0],
    sample: {
      wallets: 49,
      totalRows: null, // filled by extractBuys log
      pepInflows: null,
      fromPair: null,
      withQuote: null,
      pricedBuys: priced.length,
      droppedNoPrice: dropped,
      distinctWallets: new Set(priced.map((b) => b.wallet)).size,
      activeDays: usableDays.length,
      dateRange: [
        new Date(Math.min(...priced.map((b) => b.ts))).toISOString().slice(0, 10),
        new Date(Math.max(...priced.map((b) => b.ts))).toISOString().slice(0, 10),
      ],
    },
    observed,
    null: {
      meanP50: quantile(nullMeans, 0.5),
      meanP95: quantile(nullMeans, 0.95),
      meanP99: quantile(nullMeans, 0.99),
      fracPosP50: quantile(nullFracPos, 0.5),
      fracPosP95: quantile(nullFracPos, 0.95),
    },
    pValues: {
      primary_mean: pMean,
      secondary_fracPositive: pFracPos,
    },
    verdict: (() => {
      if (pMean < 0.01 && observed.mean > 0) return "STRONG_EVIDENCE_POSITIVE_SKILL";
      if (pMean < 0.05 && observed.mean > 0) return "EVIDENCE_POSITIVE_SKILL";
      if (pMean < 0.05 && observed.mean < 0) return "EVIDENCE_NEGATIVE_SKILL";
      if (pMean > 0.95) return "EVIDENCE_WORSE_THAN_RANDOM";
      return "INCONCLUSIVE";
    })(),
    caveats: [
      "Permutation null resamples entry dates from the pool of days on which these 49 wallets collectively bought. This preserves market regime structure.",
      "Buy definition excludes transfers and airdrops; includes direct pair swaps and aggregator swaps with visible quote outflow.",
      "Overlapping 14-day windows mean individual buys are not independent; the permutation test accounts for this by resampling whole entry dates.",
      "One primary test (mean forward return). Secondary statistics reported; not gated.",
      "This tests population-level timing. It does not prove the classifier identifies skill prospectively, only that its retrospective selections differ from random.",
    ],
  };

  fs.mkdirSync("data/experiments", { recursive: true });
  const outPath = "data/experiments/gate-0c-skill-permutation-" + new Date().toISOString().slice(0, 10) + ".json";
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

  log("");
  log("=== Gate 0c — skill permutation test ===");
  log("  priced buys: " + priced.length + "  wallets: " + out.sample.distinctWallets);
  log("  date range: " + out.sample.dateRange.join(" to "));
  log("  active days: " + out.sample.activeDays);
  log("");
  log("  observed mean fwd 14d: " + (observed.mean * 100).toFixed(2) + "%");
  log("  observed median fwd 14d: " + (observed.median * 100).toFixed(2) + "%");
  log("  frac positive: " + (observed.fracPositive * 100).toFixed(1) + "%");
  log("  frac over +20%: " + (observed.fracOver20 * 100).toFixed(1) + "%");
  log("");
  log("  null mean p50: " + (out.null.meanP50 * 100).toFixed(2) + "%");
  log("  null mean p95: " + (out.null.meanP95 * 100).toFixed(2) + "%");
  log("");
  log("  p-value (mean >= null): " + pMean.toFixed(4));
  log("  p-value (fracPos >= null): " + pFracPos.toFixed(4));
  log("");
  log("  VERDICT: " + out.verdict);
  log("");
  log("written: " + outPath);

  console.log(JSON.stringify({
    pricedBuys: priced.length,
    distinctWallets: out.sample.distinctWallets,
    observedMean: Number((observed.mean * 100).toFixed(2)),
    observedMedian: Number((observed.median * 100).toFixed(2)),
    observedFracPositive: Number((observed.fracPositive * 100).toFixed(1)),
    observedFracOver20: Number((observed.fracOver20 * 100).toFixed(1)),
    pValueMean: Number(pMean.toFixed(4)),
    pValueFracPositive: Number(pFracPos.toFixed(4)),
    verdict: out.verdict,
  }, null, 2));
}

main();
