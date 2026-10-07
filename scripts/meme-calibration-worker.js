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

// Re-evaluates a radar alert at the brief's specific horizon
// (1h) and success threshold (50%), independent of the primary
// HORIZON_HOURS evaluation. Reads the snapshot store fresh on
// every call so the bucket summary reflects the full current
// window, not just the alerts freshly evaluated this run.
async function evaluateBrief1h(alert, snapshotStore) {
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
    { horizonHours: 1, successReturnPct: 50 },
  );
}

// Buckets calibration outcomes by the alert's smartEntryScore.
// Every denominator excludes invalid evaluations - a sample
// that never reached the horizon is not a failure, it is
// missing data. The two are never conflated.
// Generalized: takes entries shaped { evaluation, [scoreField] }
// and the name of the field to bucket on. Callers pass a
// per-population entry list so the gems and radar distributions
// never mix. buckets are read left to right; the last bucket is
// inclusive of its upper bound so score 100 lands in 90-100.
function bucketByScore(entries, scoreField) {
  if (typeof scoreField !== "string" || !scoreField) {
    throw new Error("bucketByScore: scoreField is required");
  }
  const buckets = [
    { label: "<60",    min: -Infinity, max: 60 },
    { label: "60-69",  min: 60,        max: 70 },
    { label: "70-79",  min: 70,        max: 80 },
    { label: "80-89",  min: 80,        max: 90 },
    { label: "90-100", min: 90,        max: 101 },
  ];
  const out = {};
  for (const b of buckets) {
    const inBucket = entries.filter(
      (e) =>
        Number.isFinite(e[scoreField]) &&
        e[scoreField] >= b.min &&
        e[scoreField] < b.max,
    );
    const valid = inBucket.filter(
      (e) => e.evaluation && e.evaluation.valid === true,
    );
    const durable = valid.filter((e) => e.evaluation.durable === true);
    const avgReturn = valid.length
      ? valid.reduce(
          (s, e) => s + (Number(e.evaluation.horizonReturnPct) || 0),
          0,
        ) / valid.length
      : null;
    out[b.label] = {
      samples: valid.length,
      skipped: inBucket.length - valid.length,
      durableRate: valid.length ? durable.length / valid.length : null,
      averageHorizonReturnPct: avgReturn,
    };
  }
  return out;
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
  const briefEvaluations = [];
  const gemsEvaluations = [];

  try {
    for (const alert of alerts) {
      const identity = alert?.assessment?.identity;
      if (!identity) {
        skipped.push({ reason: "malformed-alert" });
        continue;
      }
      const observedAtMs = alert.assessment.observedAtMs;

      // Radar alerts carry a smartEntryScore in rawData. If present,
      // compute the 1h bucket evaluation here, fresh, every run. The
      // 24h evaluation below is cached; the 1h one is not, so the
      // bucket summary reflects the full current window.
      {
        const score =
          alert.assessment &&
          alert.assessment.rawData &&
          alert.assessment.rawData.smartEntryScore;
        if (Number.isFinite(score)) {
          try {
            const brief = await evaluateBrief1h(alert, snapshotStore);
            briefEvaluations.push({
              evaluation: brief,
              smartEntryScore: score,
            });
          } catch (e) {
            briefEvaluations.push({
              evaluation: null,
              smartEntryScore: score,
            });
          }
        }
      }

      // Gems alerts carry an opportunityScore on the assessment
      // itself, not on rawData. Collected in the same loop as
      // the radar alerts so both populations share the 1h
      // outcome evaluation. The two arrays are kept separate;
      // bucketByScore is called twice at the end with different
      // score fields. Gems and radar distributions never mix.
      {
        const opp =
          alert.assessment &&
          Number.isFinite(alert.assessment.opportunityScore)
            ? alert.assessment.opportunityScore
            : null;
        if (opp !== null) {
          try {
            const brief = await evaluateBrief1h(alert, snapshotStore);
            gemsEvaluations.push({
              evaluation: brief,
              opportunityScore: opp,
            });
          } catch (e) {
            gemsEvaluations.push({
              evaluation: null,
              opportunityScore: opp,
            });
          }
        }
      }

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
      smartMoneyBuckets1h: bucketByScore(briefEvaluations, "smartEntryScore"),
      gemsBuckets1h: bucketByScore(gemsEvaluations, "opportunityScore"),
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
  evaluateBrief1h,
  bucketByScore,
};
