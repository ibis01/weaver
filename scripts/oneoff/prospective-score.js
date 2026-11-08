#!/usr/bin/env node
"use strict";

// Gate 0d prospective scorer — reads data/prospective/buys.jsonl, appends
// to data/prospective/outcomes.jsonl (append-only attempt ledger).
//
// SEMANTICS (fixed 2026-11-08, see docs/audits/gate-0d-reconciliation-2026-11-08.md)
// - outcomes.jsonl is an ATTEMPT LEDGER. The canonical outcome for a txHash
//   is its LATEST row (latest-wins). Consumers must not count raw rows.
// - `resolved` is terminal: a txHash with any resolved row is never re-scored.
// - `unresolved` is RETRY-ELIGIBLE: the tx is re-attempted on every run until
//   prices cover its horizon. Previously an unresolved row was terminal, so a
//   buy scored while prices were stale stayed unresolved forever — the root
//   cause of the frozen Phase 4 outcome pool.
// - Each buy txHash is attempted at most once per run, so a duplicated buy
//   row can no longer produce duplicate outcome rows.
// - Unresolved rows carry attemptedAt for the audit trail.

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

// Pure scoring core. Returns the NEW ledger rows to append plus stats.
// priceAtFn maps a timestamp (ms) to a price or null when uncovered.
function scoreBuys(buys, priorOutcomes, priceAtFn, now, horizonMs = HORIZON_MS) {
  const resolved = new Set();
  for (const r of priorOutcomes) {
    if (r && r.txHash && r.status === "resolved") resolved.add(r.txHash);
  }
  // Unresolved prior rows are deliberately NOT in `resolved`: they are
  // retry-eligible. Resolved is the only terminal state.

  const rows = [];
  const attempted = new Set();
  let skippedResolved = 0, notYet = 0, unresolved = 0, resolvedNow = 0;

  for (const b of buys) {
    if (!b || !b.txHash) continue;
    if (resolved.has(b.txHash)) { skippedResolved++; continue; }
    if (attempted.has(b.txHash)) continue; // duplicated buy row in the same run
    attempted.add(b.txHash);
    if (b.timestamp + horizonMs > now) { notYet++; continue; }
    const p0 = priceAtFn(b.timestamp);
    const p14 = priceAtFn(b.timestamp + horizonMs);
    if (p0 === null || p14 === null) {
      rows.push({
        txHash: b.txHash,
        status: "unresolved",
        attemptedAt: new Date(now).toISOString(),
      });
      unresolved++;
      continue;
    }
    const fwd = (p14 - p0) / p0;
    rows.push({
      txHash: b.txHash, wallet: b.wallet, timestamp: b.timestamp,
      fwdReturn: fwd, early: fwd >= EARLY_THRESHOLD ? 1 : 0,
      status: "resolved", scoredAt: new Date(now).toISOString(),
    });
    resolvedNow++;
  }

  return {
    rows,
    stats: { attempted: attempted.size, skippedResolved, notYet, unresolved, resolvedNow },
  };
}

// Canonical outcome per txHash = latest row in the ledger.
function canonicalOutcomes(allRows) {
  const byTx = new Map();
  for (const r of allRows) {
    if (r && r.txHash) byTx.set(r.txHash, r);
  }
  return byTx;
}

function summarize(allRows) {
  const canon = canonicalOutcomes(allRows);
  const resolved = [...canon.values()].filter((r) => r.status === "resolved");
  const unresolved = [...canon.values()].filter((r) => r.status !== "resolved");
  const out = { total: canon.size, resolved: resolved.length, unresolved: unresolved.length };
  if (resolved.length) {
    out.earlyFraction =
      resolved.filter((r) => r.early === 1).length / resolved.length;
    out.meanFwdReturn = resolved.reduce((s, r) => s + r.fwdReturn, 0) / resolved.length;
  }
  return out;
}

function readJsonl(p) {
  if (!fs.existsSync(p)) return [];
  return fs
    .readFileSync(p, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

function main() {
  const buysPath = "data/prospective/buys.jsonl";
  const outPath = "data/prospective/outcomes.jsonl";
  if (!fs.existsSync(buysPath)) { log("no buys yet"); return; }

  const buys = readJsonl(buysPath);
  log("buys: " + buys.length);

  const prior = readJsonl(outPath);
  log("prior outcome rows: " + prior.length);

  const { prices, file } = loadPrices();
  const seriesEnd = prices[prices.length - 1].ts;
  log("price series: " + file + " (" + prices.length + " pts, ends " + new Date(seriesEnd).toISOString() + ")");

  const { rows, stats } = scoreBuys(buys, prior, (ts) => priceAt(prices, ts), Date.now());

  const outFh = fs.openSync(outPath, "a");
  for (const r of rows) fs.writeSync(outFh, JSON.stringify(r) + "\n");
  fs.closeSync(outFh);

  log(
    "attempted: " + stats.attempted +
    "  scored: " + stats.resolvedNow +
    "  unresolved: " + stats.unresolved +
    "  not-yet-window: " + stats.notYet +
    "  already-resolved: " + stats.skippedResolved
  );

  if (stats.unresolved > 0) {
    log("");
    log("WARNING: " + stats.unresolved + " outcome(s) unresolved — price coverage");
    log("missing at some buy/buy+14d timestamps (2-day tolerance).");
    log("Series ends " + new Date(seriesEnd).toISOString() + ".");
    log("Refresh: node scripts/oneoff/fetch-pepe-prices.js, then re-run.");
    log("Unresolved rows are retry-eligible; the next run re-attempts them.");
  }

  const all = readJsonl(outPath);
  const s = summarize(all);
  log("");
  log("=== canonical totals (latest row per txHash) ===");
  log("  txs: " + s.total + "  resolved: " + s.resolved + "  unresolved: " + s.unresolved);
  if (s.resolved) {
    log("  early fraction: " + (s.earlyFraction * 100).toFixed(1) + "%");
    log("  mean forward return: " + (s.meanFwdReturn * 100).toFixed(2) + "%");
  }
}

module.exports = { scoreBuys, canonicalOutcomes, summarize, priceAt, HORIZON_MS, EARLY_THRESHOLD };
if (require.main === module) main();
