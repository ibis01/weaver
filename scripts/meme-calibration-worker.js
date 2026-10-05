#!/usr/bin/env node
// Meme alert calibration job.
//
// Pipeline:
//   Worker KV (alerts) ──HTTP──> this job ──Redis──> snapshots
//                                   │
//                                   └──> evaluate() ──> Redis (results + summary)
//
// Runs on an interval. Each run:
//   1. Fetches alerts whose observedAtMs is inside the [horizon,
//      maxAge] window — old enough to evaluate at the 24h horizon,
//      recent enough to be worth evaluating.
//   2. For each un-evaluated alert, reads token snapshots from
//      Redis and calls W.memeCalibration.evaluate().
//   3. Writes per-alert results and an aggregate summary to Redis.
//
// Idempotent: a result already present for (chain, address,
// observedAtMs) is not re-evaluated.
//
// Set WEAVER_WORKER_BASE to override the Worker URL.

const { createMemeSnapshotStore } = require("../server/meme-snapshot-store");
const {
  createMemeCalibrationStore,
} = require("../server/meme-calibration-store");

// ── Browser-global shim for the calibration module ──────
global.W = global.W || {};
global.window = global.window || {};
global.window.W = global.W;
require("../js/intelligence/meme-calibration.js");

const WORKER_BASE =
  process.env.WEAVER_WORKER_BASE ||
  "https://weaver-proxy.ibis01-weaver.workers.dev";
const HORIZON_HOURS = Number(process.env.MEME_CALIBRATION_HORIZON_HOURS) || 24;
const MAX_AGE_HOURS =
  Number(process.env.MEME_CALIBRATION_MAX_AGE_HOURS) || 7 * 24;
const FETCH_TIMEOUT_MS = 15_000;

async function fetchAlerts({ since, until }) {
  const url = `${WORKER_BASE}/meme/alerts?since=${since}&until=${until}&limit=1000`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Worker returned HTTP ${res.status}`);
    const body = await res.json();
    return Array.isArray(body.alerts) ? body.alerts : [];
  } finally {
    clearTimeout(timer);
  }
}

function alertToCalibrationInput(alert) {
  return {
    observedAt:
      alert.market?.observedAt ||
      new Date(alert.assessment.observedAtMs).toISOString(),
    priceUsd: alert.market?.priceUsd ?? null,
    liquidityUsd: alert.market?.liquidityUsd ?? null,
  };
}

function snapshotToCalibrationRow(s) {
  return {
    observedAt: s.observedAt,
    priceUsd: s.priceUsd,
    liquidityUsd: s.liquidityUsd,
    canSell: s.canSell ?? null,
  };
}

async function evaluateOne(alert, snapshotStore) {
  const identity = alert?.assessment?.identity;
  if (!identity?.chain || !identity?.tokenAddress) return null;

  const rawSnapshots = await snapshotStore.list(
    identity.chain,
    identity.tokenAddress,
    { limit: 500 },
  );
  const rows = rawSnapshots.map(snapshotToCalibrationRow);

  return global.W.memeCalibration.evaluate(
    alertToCalibrationInput(alert),
    rows,
    { horizonHours: HORIZON_HOURS },
  );
}

function bucketSkipReasons(skipped) {
  const counts = {};
  for (const s of skipped) {
    const key = s.reason || "unknown";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

async function runOnce() {
  const now = Date.now();
  const since = now - MAX_AGE_HOURS * 3600 * 1000;
  const until = now - HORIZON_HOURS * 3600 * 1000;

  const alerts = await fetchAlerts({ since, until });

  const snapshotStore = createMemeSnapshotStore();
  const calibrationStore = createMemeCalibrationStore();

  const evaluations = [];
  const newlyEvaluated = [];
  const skipped = [];

  try {
    for (const alert of alerts) {
      const identity = alert?.assessment?.identity;
      if (!identity) {
        skipped.push({ reason: "malformed-alert" });
        continue;
      }
      const observedAtMs = alert.assessment.observedAtMs;

      try {
        const existing = await calibrationStore.readResult(
          identity.chain,
          identity.tokenAddress,
          observedAtMs,
        );
        if (existing) {
          evaluations.push(existing.evaluation);
          continue;
        }

        const evaluation = await evaluateOne(alert, snapshotStore);
        if (!evaluation) {
          skipped.push({
            chain: identity.chain,
            address: identity.tokenAddress,
            reason: "malformed-evaluation",
          });
          continue;
        }

        await calibrationStore.writeResult(alert, evaluation);
        evaluations.push(evaluation);
        newlyEvaluated.push({
          chain: identity.chain,
          address: identity.tokenAddress,
          observedAtMs,
          valid: evaluation.valid,
          outcome: evaluation.outcome || null,
        });

        if (!evaluation.valid) {
          skipped.push({
            chain: identity.chain,
            address: identity.tokenAddress,
            reason: evaluation.reason || "invalid-evaluation",
          });
        }
      } catch (e) {
        skipped.push({
          chain: identity.chain,
          address: identity.tokenAddress,
          reason: e.message,
        });
      }
    }

    const summary = global.W.memeCalibration.summarize(evaluations);
    const enriched = {
      ...summary,
      alerts_fetched: alerts.length,
      alerts_newly_evaluated: newlyEvaluated.length,
      alerts_skipped: skipped.length,
      skip_reasons: bucketSkipReasons(skipped),
      window: {
        since,
        until,
        horizonHours: HORIZON_HOURS,
        maxAgeHours: MAX_AGE_HOURS,
      },
    };

    await calibrationStore.writeSummary(enriched);
    return enriched;
  } finally {
    try {
      await snapshotStore.close();
    } catch {}
    try {
      await calibrationStore.close();
    } catch {}
  }
}

async function main() {
  if (process.argv.includes("--once")) {
    const summary = await runOnce();
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const intervalMs = Math.max(
    60_000,
    Number(process.env.MEME_CALIBRATION_INTERVAL_MS) || 60 * 60_000,
  );

  const run = async () => {
    try {
      const summary = await runOnce();
      console.log(
        JSON.stringify({
          at: new Date().toISOString(),
          evaluated: summary.evaluated,
          newly: summary.alerts_newly_evaluated,
          skipped: summary.alerts_skipped,
          durableRate: summary.durableRate,
        }),
      );
    } catch (e) {
      console.error(
        JSON.stringify({ error: e.message, at: new Date().toISOString() }),
      );
    }
  };

  await run();
  setInterval(run, intervalMs);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
}

module.exports = {
  runOnce,
  fetchAlerts,
  evaluateOne,
  bucketSkipReasons,
  alertToCalibrationInput,
  snapshotToCalibrationRow,
};
