#!/usr/bin/env node
// scripts/oneoff/fetch-pepe-prices.js
//
// Refreshes the PEPE/USD daily price history used by the Gate 0d
// prospective scorer (prospective-score.js reads data/prices/pepe-*.json).
//
// WHY THIS EXISTS
// The original data/prices/pepe-usd-daily-365d.json was a manual
// CoinGecko fetch taken 2026-10-19T04:35Z. Its series ends at the Gate 0d
// freeze moment (2026-10-18T01:31Z). Every prospective buy happens AFTER
// the freeze, so priceAt(buy.timestamp) always exceeded the scorer's
// 2-day tolerance and every due outcome was recorded `unresolved`
// (see docs/audits/gate-0d-reconciliation-2026-11-08.md). This script
// makes the weekly refresh a first-class step in gate-0d-collect.yml so
// outcomes can actually resolve.
//
// SOURCE: CoinGecko public market_chart (same provider as the original
// snapshot). Research-pipeline use only — not part of the app's vendor
// stack. Optional key: set COINGECKO_API_KEY (sent as x-cg-demo-api-key).
//
// WRITES (only after full validation; atomic tmp+rename, never partial):
//   data/prices/pepe-365d.json           — compact {prices:[[ts,p]...]}
//   data/prices/pepe-usd-daily-365d.json — metadata + prices (original schema)
//
// Exit 0 on success; exit 1 with a diagnostic on failure. The weekly
// workflow runs this with continue-on-error so collection is never blocked.

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const CG_URL =
  "https://api.coingecko.com/api/v3/coins/pepe/market_chart" +
  "?vs_currency=usd&days=365";
const MIN_POINTS = 300; // 365 daily points minus a few tolerated gaps
const PRICES_DIR = path.join(__dirname, "..", "..", "data", "prices");

function log(m) { process.stderr.write(m + "\n"); }

async function fetchSeries() {
  const headers = { accept: "application/json" };
  if (process.env.COINGECKO_API_KEY) {
    headers["x-cg-demo-api-key"] = process.env.COINGECKO_API_KEY;
  }
  let lastErr = null;
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(CG_URL, { headers });
      if (res.status === 429 && i + 1 < 4) {
        const wait = 5000 * Math.pow(2, i);
        log("429 rate-limited; backing off " + wait + "ms");
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) throw new Error("CoinGecko HTTP " + res.status);
      const d = await res.json();
      if (!Array.isArray(d.prices) || d.prices.length === 0) {
        throw new Error("CoinGecko payload has no prices array");
      }
      return d.prices
        .map(([ts, p]) => [Number(ts), Number(p)])
        .filter(([ts, p]) => Number.isFinite(ts) && Number.isFinite(p) && p > 0)
        .sort((a, b) => a[0] - b[0]);
    } catch (e) {
      lastErr = e;
      if (i + 1 < 4) await new Promise((r) => setTimeout(r, 3000 * Math.pow(2, i)));
    }
  }
  throw lastErr || new Error("CoinGecko fetch failed");
}

function validate(series) {
  if (series.length < MIN_POINTS) {
    throw new Error(
      "series too short: " + series.length + " points (min " + MIN_POINTS + ")"
    );
  }
  const first = series[0][0];
  const last = series[series.length - 1][0];
  const spanDays = (last - first) / 86400000;
  if (spanDays < 300) {
    throw new Error("series span too short: " + spanDays.toFixed(1) + " days");
  }
  return { first, last, spanDays };
}

function day(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

function main() {
  fetchSeries()
    .then((series) => {
      const { first, last, spanDays } = validate(series);
      const fetchedAt = new Date().toISOString();

      fs.mkdirSync(PRICES_DIR, { recursive: true });
      const compact = { prices: series };
      const detailed = {
        source: "coingecko",
        coin: "pepe",
        vs_currency: "usd",
        days: 365,
        granularity: "daily",
        n_points: series.length,
        first_day: day(first),
        last_day: day(last),
        fetched_at_utc: fetchedAt,
        prices: series,
      };

      // Atomic writes: never leave a truncated file behind for the scorer.
      const compactPath = path.join(PRICES_DIR, "pepe-365d.json");
      const detailedPath = path.join(PRICES_DIR, "pepe-usd-daily-365d.json");
      const tmpCompact = compactPath + ".tmp";
      const tmpDetailed = detailedPath + ".tmp";
      fs.writeFileSync(tmpCompact, JSON.stringify(compact) + "\n");
      fs.writeFileSync(tmpDetailed, JSON.stringify(detailed, null, 1) + "\n");
      fs.renameSync(tmpCompact, compactPath);
      fs.renameSync(tmpDetailed, detailedPath);

      log(
        "pepe prices refreshed: " +
          series.length +
          " points, " +
          day(first) +
          " -> " +
          day(last) +
          " (" +
          spanDays.toFixed(0) +
          " days), fetched_at " +
          fetchedAt
      );
    })
    .catch((e) => {
      log("FATAL: price refresh failed: " + e.message);
      log("Existing data/prices files left untouched; scoring will mark");
      log("insufficient-coverage outcomes unresolved (retry next run).");
      process.exit(1);
    });
}

main();
