#!/usr/bin/env node
"use strict";

/**
 * gate-0b1-data-integrity-audit.js
 *
 * Gate 0b.1 — Data integrity audit. Read-only.
 *
 * Uses only files already on disk. Does not fetch anything.
 * The output feeds Gate 0b.2 (descriptive) and identifies which
 * wallets are eligible for 0b.3 (historical event study).
 *
 * Writes: data/experiments/gate-0b1-audit-{date}.json
 */

const fs = require("node:fs");

// Known infrastructure addresses. Additions must be documented with
// evidence in the audit output. Each entry: { address, label, source }
const KNOWN_INFRA = [
  { address: "0x28c6c06298d514db089934071355e5743bf21d60",
    label: "Binance hot wallet",
    source: "public Etherscan label; presence in control-2 documented in gate-0b-v1-design-falsified-2026-10-17.md" },
  { address: "0x51c72848c68a965f66fa7a88855f9f7784502a7f",
    label: "Uniswap Universal Router / aggregator",
    source: "identified in 2026-10-15 buyer-attribution run" },
  { address: "0x111111125421ca6dc452d289314280a0f8842a65",
    label: "1inch v6 router",
    source: "identified in 2026-10-15 buyer-attribution run" },
  { address: "0x9008d19f58aabd9ed0d60971565aa8510560ab41",
    label: "CoW Protocol settlement",
    source: "identified in 2026-10-15 buyer-attribution run" },
];

function log(m) { process.stderr.write(m + "\n"); }
function lower(s) { return (s || "").toLowerCase(); }

function loadJson(path) {
  if (!fs.existsSync(path)) return null;
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function tier(n) {
  if (n === 0) return "zero";
  if (n <= 2) return "1-2";
  if (n <= 9) return "3-9";
  if (n <= 50) return "10-50";
  if (n <= 200) return "51-200";
  return "infrastructure-suspect";
}

function main() {
  log("=== Gate 0b.1 — Data integrity audit ===");

  const treatmentPop = loadJson("data/pepe-buyer-list/v2.json");
  const controlPop = loadJson("data/wallet-pool-control-2-v1.json");
  const treatmentAvail = loadJson("data/experiments/availability-treatment-2026-10-17.json");
  const controlAvail = loadJson("data/experiments/availability-control-2026-10-17.json");

  if (!treatmentPop || !controlPop) {
    console.error("FATAL: population files missing");
    process.exit(1);
  }
  if (!treatmentAvail || !controlAvail) {
    console.error("FATAL: availability files missing — run check-eval-window-availability.js for both pools first");
    process.exit(1);
  }

  const tMonths = treatmentAvail.months || [];
  const cMonths = controlAvail.months || [];
  const commonMonths = tMonths.filter((m) => cMonths.includes(m));

  if (commonMonths.length === 0) {
    console.error("FATAL: treatment and control availability files have no overlapping months");
    console.error("  treatment months: " + JSON.stringify(tMonths));
    console.error("  control months:   " + JSON.stringify(cMonths));
    process.exit(1);
  }

  // The two availability pulls may have been run with different
  // --months-back values. Comparisons use the intersection. Per-pool
  // extended views (e.g. treatment's full 12 months) are reported
  // separately as informational only.
  const months = commonMonths;

  const infraMap = new Map(KNOWN_INFRA.map((x) => [lower(x.address), x]));

  // Price data availability check — do we have local PEPE prices for
  // the eval months + 14 days forward?
  const priceDir = "data/prices";
  const priceDirExists = fs.existsSync(priceDir);
  const priceFiles = priceDirExists
    ? fs.readdirSync(priceDir).filter((f) => f.startsWith("pepe-"))
    : [];

  // Per-wallet classification
  function classify(pool, availability) {
    const wallets = availability[pool] || {};
    const rows = [];
    for (const [addr, buckets] of Object.entries(wallets)) {
      if (buckets._error) {
        rows.push({
          address: addr,
          status: "provider-error",
          error: buckets._error,
          eligible: false,
          reason: "provider error during availability pull",
        });
        continue;
      }
      const totalBuys = months.reduce((s, m) => s + ((buckets[m] && buckets[m].anyIn) || 0), 0);
      const fromPairBuys = months.reduce((s, m) => s + ((buckets[m] && buckets[m].fromPair) || 0), 0);
      const monthsWithActivity = months.filter((m) => buckets[m] && buckets[m].anyIn > 0).length;

      const infra = infraMap.get(lower(addr));
      const tierLabel = tier(totalBuys);

      let status, eligible, reason;
      if (infra) {
        status = "infrastructure";
        eligible = false;
        reason = infra.label + " (" + infra.source + ")";
      } else if (tierLabel === "infrastructure-suspect") {
        status = "infrastructure-suspect";
        eligible = false;
        reason = totalBuys + " buys over " + months.length + " months (avg " + Math.round(totalBuys / months.length) + "/mo) — exceeds individual-trading threshold";
      } else if (tierLabel === "zero") {
        status = "zero-activity";
        eligible = false;
        reason = "0 buys in any month — not a tradeable observation";
      } else {
        status = "eligible";
        eligible = true;
        reason = "activity tier: " + tierLabel;
      }

      rows.push({
        address: addr,
        status,
        eligible,
        reason,
        months,
        totalBuys,
        fromPairBuys,
        monthsWithActivity,
        perMonth: Object.fromEntries(months.map((m) => [m, {
          anyIn: (buckets[m] && buckets[m].anyIn) || 0,
          fromPair: (buckets[m] && buckets[m].fromPair) || 0,
        }])),
      });
    }
    return rows;
  }

  const treatmentRows = classify("treatment", treatmentAvail);
  const controlRows = classify("control", controlAvail);

  // Summaries
  function summarise(rows) {
    const byStatus = {};
    for (const r of rows) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    const eligible = rows.filter((r) => r.eligible);
    const tiers = {};
    for (const r of eligible) {
      const t = tier(r.totalBuys);
      tiers[t] = (tiers[t] || 0) + 1;
    }
    return {
      total: rows.length,
      byStatus,
      eligible: eligible.length,
      eligibleTiers: tiers,
    };
  }

  const treatmentSummary = summarise(treatmentRows);
  const controlSummary = summarise(controlRows);

  // Overlap check — must be zero
  const treatmentSet = new Set(treatmentRows.map((r) => lower(r.address)));
  const controlSet = new Set(controlRows.map((r) => lower(r.address)));
  const overlap = [...treatmentSet].filter((a) => controlSet.has(a));

  // Price coverage gap check
  const priceCoverage = {
    priceDirExists,
    cachedPEPEFiles: priceFiles.length,
    monthsNeedingPrices: months,
    forwardExtensionDays: 14,
    assessment: priceFiles.length > 0
      ? "local PEPE price cache exists; must verify it covers " + months[0] + " through " + months[months.length-1] + " + 14 days"
      : "no local PEPE price cache — a CoinGecko pull is required before Gate 0b.3",
  };

  // Extended view — informational only. If the treatment pull was run
  // with a wider --months-back than the control pull, the extra months
  // are useful for judging whether longer windows rescue the sample
  // floor, but they cannot be used in a comparative test.
  function extendedView(poolName, availability) {
    const pooledMonths = availability.months || [];
    const wallets = availability[poolName] || {};
    const totals = [];
    let errored = 0;
    for (const buckets of Object.values(wallets)) {
      if (buckets._error) { errored++; continue; }
      let sum = 0;
      for (const m of pooledMonths) {
        if (buckets[m] && buckets[m].anyIn) sum += buckets[m].anyIn;
      }
      totals.push(sum);
    }
    totals.sort((a, b) => a - b);
    const n = totals.length;
    if (n === 0) return null;
    const median = totals[Math.floor(n / 2)];
    const sum = totals.reduce((a, b) => a + b, 0);
    return {
      pool: poolName,
      monthsCovered: pooledMonths.length,
      monthRange: [pooledMonths[0], pooledMonths[pooledMonths.length - 1]],
      walletCount: n,
      erroredWallets: errored,
      totalBuys: sum,
      medianBuysPerWallet: median,
      walletsWithZeroBuys: totals.filter((x) => x === 0).length,
      walletsWithAtLeast10Buys: totals.filter((x) => x >= 10).length,
    };
  }

  const extendedTreatment = extendedView("treatment", treatmentAvail);
  const extendedControl = extendedView("control", controlAvail);

  // Price-cache blocker — Gate 0b.3 cannot run without PEPE prices
  const priceBlocker = !priceDirExists || priceFiles.length === 0
    ? "BLOCKER: no local PEPE price cache. A CoinGecko PEPE pull is required before any forward-return analysis."
    : "local price cache exists; verify coverage from " + months[0] + " through " + months[months.length - 1] + " + 14 days";

  // Eligibility summary for Gate 0b.3 (historical event study)
  const gate3Eligibility = {
    treatment: treatmentSummary.eligible,
    control: controlSummary.eligible,
    gate3_possible: treatmentSummary.eligible >= 20 && controlSummary.eligible >= 20,
    note: "Gate 0b.3 requires enough eligible wallets to reconstruct an event-level dataset with bounded dependence. If either pool < 20, escalate rather than proceed.",
  };

  const out = {
    version: "gate-0b1-audit-v1",
    generatedAt: new Date().toISOString(),
    months,
    knownInfra: KNOWN_INFRA,
    treatment: {
      summary: treatmentSummary,
      rows: treatmentRows,
    },
    control: {
      summary: controlSummary,
      rows: controlRows,
    },
    overlap,
    overlapPass: overlap.length === 0,
    priceCoverage,
    priceBlocker,
    extendedView: {
      treatment: extendedTreatment,
      control: extendedControl,
      note: "Each pool's own months. NOT for comparison — comparison uses 'months' above (the intersection). Useful only for judging whether extending the availability window raises per-wallet counts.",
    },
    gate3Eligibility,
    exclusions: {
      treatment: treatmentRows.filter((r) => !r.eligible).map((r) => ({ address: r.address, reason: r.reason })),
      control: controlRows.filter((r) => !r.eligible).map((r) => ({ address: r.address, reason: r.reason })),
    },
  };

  fs.mkdirSync("data/experiments", { recursive: true });
  const outPath = "data/experiments/gate-0b1-audit-" + new Date().toISOString().slice(0, 10) + ".json";
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

  // Console summary
  log("");
  log("=== treatment ===");
  log("  total: " + treatmentSummary.total);
  for (const [s, n] of Object.entries(treatmentSummary.byStatus)) log("    " + s + ": " + n);
  log("  eligible: " + treatmentSummary.eligible + "  tiers: " + JSON.stringify(treatmentSummary.eligibleTiers));

  log("");
  log("=== control ===");
  log("  total: " + controlSummary.total);
  for (const [s, n] of Object.entries(controlSummary.byStatus)) log("    " + s + ": " + n);
  log("  eligible: " + controlSummary.eligible + "  tiers: " + JSON.stringify(controlSummary.eligibleTiers));

  log("");
  log("=== extended view (informational, not comparative) ===");
  for (const ev of [extendedTreatment, extendedControl]) {
    if (!ev) { log("  " + "one pool has no availability data"); continue; }
    log("  " + ev.pool + ": " + ev.walletCount + " wallets over " + ev.monthsCovered + " months");
    log("    total buys: " + ev.totalBuys + "  median/wallet: " + ev.medianBuysPerWallet);
    log("    >=10-buy wallets: " + ev.walletsWithAtLeast10Buys + "  zero-buy wallets: " + ev.walletsWithZeroBuys);
  }

  log("");
  log("=== integrity ===");
  log("  overlap (must be 0): " + overlap.length);
  log("  price cache: " + priceCoverage.assessment);
  if (priceBlocker.startsWith("BLOCKER")) log("  " + priceBlocker);
  log("  Gate 0b.3 possible: " + gate3Eligibility.gate3_possible);

  log("");
  log("written: " + outPath);

  console.log(JSON.stringify({
    treatment: treatmentSummary,
    control: controlSummary,
    overlap: overlap.length,
    priceCoverage: priceCoverage.assessment,
    gate3_possible: gate3Eligibility.gate3_possible,
    outputPath: outPath,
  }, null, 2));
}

main();
