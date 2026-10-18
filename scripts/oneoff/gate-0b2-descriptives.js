#!/usr/bin/env node
"use strict";

/**
 * gate-0b2-descriptives.js
 *
 * Gate 0b.2 — Descriptive analysis. Read-only.
 *
 * For every eligible buy in the treatment population, compute the
 * forward 14-day return from the local PEPE price cache. Report
 * distribution statistics. No hypothesis test, no control comparison.
 *
 * The purpose is to answer: "what do forward returns of these buys
 * actually look like?" before designing any test. If the distribution
 * is centered near zero with wide tails, the classifier is not
 * finding anything distinguishable from random entry. If it's
 * centered meaningfully above zero, there's a signal worth testing.
 *
 * Requires:
 *   data/prices/pepe-*.json  (CoinGecko hourly range pull)
 *   data/experiments/availability-treatment-*.json
 *
 * Writes: data/experiments/gate-0b2-descriptives-{date}.json
 */

const fs = require("node:fs");
const path = require("node:path");

const PEPE = "0x6982508145454ce325ddbe47a25d4ec3d2311933";
const HORIZON_HOURS = 24 * 14;
const HORIZON_MS = HORIZON_HOURS * 3600 * 1000;

function log(m) { process.stderr.write(m + "\n"); }
function lower(s) { return (s || "").toLowerCase(); }

function loadPrices() {
  const dir = "data/prices";
  if (!fs.existsSync(dir)) throw new Error("data/prices does not exist");
  const files = fs.readdirSync(dir).filter((f) => f.startsWith("pepe-") && f.endsWith(".json"));
  if (files.length === 0) throw new Error("no pepe-*.json files in data/prices");
  const newest = files
    .map((f) => ({ f, m: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m)[0].f;
  log("loading prices from " + newest);
  const raw = JSON.parse(fs.readFileSync(path.join(dir, newest), "utf8"));
  const prices = (raw.prices || []).map(([ts, p]) => ({ ts, p }));
  prices.sort((a, b) => a.ts - b.ts);
  return prices;
}

function priceAt(prices, ts) {
  // Binary search for closest price at or before ts. Return null if
  // the nearest price is more than 2 hours away (gap in series).
  let lo = 0, hi = prices.length - 1, best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (prices[mid].ts <= ts) { best = mid; lo = mid + 1; }
    else { hi = mid - 1; }
  }
  if (best === -1) return null;
  const gapHours = Math.abs(ts - prices[best].ts) / 3600000;
  if (gapHours > 2) return null;
  return prices[best].p;
}

function pct(a, b) { return ((b - a) / a) * 100; }

function quantile(sorted, q) {
  if (sorted.length === 0) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

async function main() {
  const prices = loadPrices();
  log("price points: " + prices.length);
  if (prices.length === 0) {
    log("!! price file has 0 points — the CoinGecko fetch produced an empty");
    log("!! or error response. Re-fetch with the daily endpoint (90d).");
    log("!! See: data/prices/*.json content.");
    process.exit(2);
  }
  log("price range: " +
    new Date(prices[0].ts).toISOString().slice(0, 10) + " to " +
    new Date(prices[prices.length - 1].ts).toISOString().slice(0, 10));

  const availDir = "data/experiments";
  const availFile = fs.readdirSync(availDir)
    .filter((f) => f.startsWith("availability-treatment-") && f.endsWith(".json"))
    .sort()
    .pop();
  if (!availFile) throw new Error("no availability-treatment-*.json");
  const avail = JSON.parse(fs.readFileSync(path.join(availDir, availFile), "utf8"));
  log("using availability: " + availFile);

  // For each treatment wallet, we need the wallet's actual buy timestamps.
  // The availability file has per-month counts, not timestamps. We need
  // to fetch them from Blockscout via wallet-history, OR use whatever is
  // cached. This is the one place where data isn't on disk.
  //
  // For Gate 0b.2, if no wallet trade history is cached, we report the
  // blocker rather than fetch.
  const tradeCacheDir = "data/trade-history";
  if (!fs.existsSync(tradeCacheDir)) {
    log("");
    log("!! No cached trade history in " + tradeCacheDir);
    log("!! Gate 0b.2 requires per-wallet buy timestamps to compute");
    log("!! forward returns. These are not available locally.");
    log("!!");
    log("!! Next action: pull wallet PEPE trade history via Blockscout");
    log("!! for the 49 treatment wallets. That's ~49 calls, ~1-2 hours.");
    log("!!");
    log("!! Once cached, re-run this script.");
    process.exit(2);
  }

  // If trade cache exists, load per-wallet trades
  const tradeFiles = fs.readdirSync(tradeCacheDir).filter((f) => f.endsWith(".json"));
  log("trade-history files: " + tradeFiles.length);

  const buys = [];
  for (const f of tradeFiles) {
    const wallet = f.replace(/\.json$/, "").toLowerCase();
    const d = JSON.parse(fs.readFileSync(path.join(tradeCacheDir, f), "utf8"));
    const trades = d.trades || d.rows || [];
    for (const t of trades) {
      if (lower(t.to) !== wallet) continue; // only inflows
      const ts = Number(t.timeStamp || t.ts) * 1000;
      if (!Number.isFinite(ts)) continue;
      const p0 = priceAt(prices, ts);
      const p1 = priceAt(prices, ts + HORIZON_MS);
      if (p0 === null || p1 === null) continue;
      buys.push({
        wallet,
        ts,
        date: new Date(ts).toISOString().slice(0, 10),
        p0, p1,
        ret14: pct(p0, p1),
      });
    }
  }

  if (buys.length === 0) {
    log("no buys with prices — cannot compute descriptives");
    process.exit(2);
  }

  const rets = buys.map((b) => b.ret14).sort((a, b) => a - b);
  const n = rets.length;
  const mean = rets.reduce((a, b) => a + b, 0) / n;
  const positive = rets.filter((r) => r > 0).length;
  const over20 = rets.filter((r) => r >= 20).length;
  const under20 = rets.filter((r) => r <= -20).length;

  // Wallet-level aggregates
  const perWallet = new Map();
  for (const b of buys) {
    if (!perWallet.has(b.wallet)) perWallet.set(b.wallet, []);
    perWallet.get(b.wallet).push(b.ret14);
  }
  const walletMeans = [...perWallet.values()].map((arr) => arr.reduce((a, b) => a + b, 0) / arr.length).sort((a, b) => a - b);

  // Day concentration
  const perDay = new Map();
  for (const b of buys) {
    perDay.set(b.date, (perDay.get(b.date) || 0) + 1);
  }
  const daysSorted = [...perDay.entries()].sort((a, b) => b[1] - a[1]);
  const topDay = daysSorted[0];

  const out = {
    version: "gate-0b2-descriptives-v1",
    generatedAt: new Date().toISOString(),
    pricesFile: fs.readdirSync("data/prices").filter((f) => f.startsWith("pepe-"))[0],
    availabilityFile: availFile,
    horizonHours: HORIZON_HOURS,
    buyCount: n,
    walletCount: perWallet.size,
    distribution: {
      min: rets[0],
      p05: quantile(rets, 0.05),
      p25: quantile(rets, 0.25),
      median: quantile(rets, 0.50),
      p75: quantile(rets, 0.75),
      p95: quantile(rets, 0.95),
      max: rets[n - 1],
      mean: mean,
    },
    rates: {
      positivePct: (positive / n * 100),
      over20Pct: (over20 / n * 100),
      under20Pct: (under20 / n * 100),
    },
    walletMeans: {
      count: walletMeans.length,
      min: walletMeans[0],
      median: quantile(walletMeans, 0.5),
      max: walletMeans[walletMeans.length - 1],
      p25: quantile(walletMeans, 0.25),
      p75: quantile(walletMeans, 0.75),
    },
    concentration: {
      distinctDays: perDay.size,
      topDay: topDay ? { date: topDay[0], count: topDay[1] } : null,
      topDayPctOfBuys: topDay ? (topDay[1] / n * 100) : 0,
    },
    caveats: [
      "Descriptive only. No hypothesis test, no control comparison.",
      "Treatment-only forward-return distribution does not establish skill.",
      "Overlapping 14-day windows mean observations are not independent.",
      "For inference, cluster-bootstrap (wallet-clustered + day-blocked) is required per the research report.",
    ],
  };

  fs.mkdirSync("data/experiments", { recursive: true });
  const outPath = "data/experiments/gate-0b2-descriptives-" + new Date().toISOString().slice(0, 10) + ".json";
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

  log("");
  log("=== Gate 0b.2 descriptives ===");
  log("  buys: " + n + "  wallets: " + perWallet.size);
  log("  median 14d return: " + out.distribution.median.toFixed(2) + "%");
  log("  mean 14d return: " + out.distribution.mean.toFixed(2) + "%");
  log("  IQR: [" + out.distribution.p25.toFixed(2) + "%, " + out.distribution.p75.toFixed(2) + "%]");
  log("  positive: " + out.rates.positivePct.toFixed(1) + "%  over20%: " + out.rates.over20Pct.toFixed(1) + "%");
  log("  wallet mean of means: median " + out.walletMeans.median.toFixed(2) + "%");
  log("  distinct days: " + out.concentration.distinctDays + "  top day: " +
      (topDay ? topDay[0] + " (" + topDay[1] + " buys, " + out.concentration.topDayPctOfBuys.toFixed(1) + "%)" : "n/a"));
  log("");
  log("written: " + outPath);
}

main().catch((e) => { console.error(e.stack || e); process.exit(1); });
