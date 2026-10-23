// js/intelligence/evaluation/predictive-validator.js
//
// Phase 4 — Fixed-Horizon Evaluation (Commit 1b)
//
// WARNING: This module evaluates a 24-hour fixed holding period.
// It is no longer a "current price snapshot" comparison.
// It relies entirely on the Worker's D1 snapshot database.
// If a snapshot does not exist at exactly alert_time + 24h (±15m),
// the alert is marked UNRESOLVED, not silently dropped.
//
// ALIGNMENT WITH docs/phase-4/pre-registration.md:
//   - Issue A: net return uses the pre-registered formula
//   - Issue B: identity is one alert = one observation, keyed by
//     observedAtMs + chain + normalized address (matches the KV key;
//     two alerts at the same millisecond for the same token collapse
//     by design because the Worker's KV key does. Documented in
//     pre-registration interpretation note.)
//   - Issue C: coverage is evaluated / total_alerts_recorded
//   - Issue D: Mann-Whitney U test + bootstrap CI on the two cohorts,
//     gated on the pre-registered minimum sample (10 per cohort).

window.W = window.W || {};

W.predictiveValidator = (() => {
  "use strict";

  const MODULE_VERSION = "predictive-validator-v8-d1-prereg-stats";
  const WORKER_BASE = "https://weaver-proxy.ibis01-weaver.workers.dev";
  const HORIZON_MS = 24 * 60 * 60 * 1000;

  // Pre-registration §Statistical test + §Sample size
  const MIN_OBSERVATIONS_PER_COHORT = 10;
  const BOOTSTRAP_RESAMPLES = 10000;
  const SIGNIFICANCE_ALPHA = 0.05;

  function costForLiquidity(liquidityUsd) {
    const l = Number(liquidityUsd) || 0;
    if (l >= 1_000_000) return 0.005;
    if (l >= 100_000) return 0.015;
    if (l >= 30_000) return 0.03;
    if (l > 0) return 0.1;
    return null;
  }

  function normalizeAddress(chain, addr) {
    if (typeof addr !== "string" || !addr) return null;
    if (typeof chain !== "string" || !chain) return null;
    return chain === "solana" ? addr : addr.toLowerCase();
  }

  // ── Cohort marker ──
  // Persisted records from the cohort-fix bundle carry
  // `assessment.cohort: "control" | "treatment"`. Pre-fix records have
  // no cohort and are excluded from the statistical comparison but are
  // still counted in total_alerts_recorded / eligible_for_evaluation.
  function extractCohort(alert) {
    const c =
      alert && alert.assessment && typeof alert.assessment.cohort === "string"
        ? alert.assessment.cohort
        : null;
    if (c === "control" || c === "treatment") return c;
    return "unknown";
  }

  // ── Mann-Whitney U (two-sided, normal approximation with tie correction) ──
  function mannWhitneyU(groupA, groupB) {
    if (!Array.isArray(groupA) || !Array.isArray(groupB)) return null;
    const nA = groupA.length;
    const nB = groupB.length;
    if (nA < 1 || nB < 1) return null;

    const combined = [];
    for (const v of groupA) combined.push({ value: v, group: "A" });
    for (const v of groupB) combined.push({ value: v, group: "B" });
    combined.sort((x, y) => x.value - y.value);

    // Assign ranks (1-based), average ties.
    let i = 0;
    while (i < combined.length) {
      let j = i;
      while (j < combined.length && combined[j].value === combined[i].value) {
        j++;
      }
      const avgRank = (i + 1 + j) / 2;
      for (let k = i; k < j; k++) combined[k].rank = avgRank;
      i = j;
    }

    let RA = 0;
    let RB = 0;
    for (const c of combined) {
      if (c.group === "A") RA += c.rank;
      else RB += c.rank;
    }

    const U_A = RA - (nA * (nA + 1)) / 2;
    const U_B = RB - (nB * (nB + 1)) / 2;
    const U = Math.min(U_A, U_B);

    const meanU = (nA * nB) / 2;

    // Tie correction for the variance
    let tieSum = 0;
    i = 0;
    while (i < combined.length) {
      let j = i;
      while (j < combined.length && combined[j].value === combined[i].value) {
        j++;
      }
      const t = j - i;
      if (t > 1) tieSum += t * t * t - t;
      i = j;
    }
    const N = nA + nB;
    const varU = ((nA * nB) / 12) * (N + 1 - tieSum / (N * (N - 1)));
    const sdU = Math.sqrt(varU);

    if (!Number.isFinite(sdU) || sdU === 0) {
      return {
        U,
        U_A,
        U_B,
        z: 0,
        p: 1,
        nA,
        nB,
        method: "all_values_identical",
        note: "Variance is zero — U test is not informative.",
      };
    }

    // Continuity correction on the two-sided z
    const z = (U - meanU + 0.5) / sdU;
    const p = 2 * (1 - normalCDF(Math.abs(z)));

    return {
      U,
      U_A,
      U_B,
      z,
      p,
      nA,
      nB,
      method: "normal_approximation_with_tie_correction",
    };
  }

  // Abramowitz & Stegun 7.1.26 — adequate for two-sided p at alpha=0.05
  function normalCDF(z) {
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989422804 * Math.exp((-z * z) / 2);
    const poly =
      t *
      (0.31938153 +
        t *
          (-0.356563782 +
            t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    const cdf = 1 - d * poly;
    return z >= 0 ? cdf : 1 - cdf;
  }

  // ── Bootstrap CI for the median ──
  function bootstrapMedianCI(
    values,
    resamples = BOOTSTRAP_RESAMPLES,
    alpha = SIGNIFICANCE_ALPHA,
  ) {
    if (!Array.isArray(values) || values.length < 2) return null;
    const n = values.length;
    const medians = new Array(resamples);
    for (let r = 0; r < resamples; r++) {
      const sample = new Array(n);
      for (let i = 0; i < n; i++) {
        sample[i] = values[Math.floor(Math.random() * n)];
      }
      sample.sort((a, b) => a - b);
      const mid = Math.floor(n / 2);
      medians[r] = n % 2 ? sample[mid] : (sample[mid - 1] + sample[mid]) / 2;
    }
    medians.sort((a, b) => a - b);
    const lowerIdx = Math.floor((alpha / 2) * resamples);
    const upperIdx = Math.min(
      resamples - 1,
      Math.floor((1 - alpha / 2) * resamples) - 1,
    );
    return {
      lower: medians[lowerIdx],
      upper: medians[upperIdx],
      confidence: 1 - alpha,
      resamples,
    };
  }

  // ── Cohort comparison (gated on MIN_OBSERVATIONS_PER_COHORT) ──
  function computeCohortComparison(results) {
    const control = results
      .filter((r) => r.cohort === "control")
      .map((r) => parseFloat(r.netReturnPct));
    const treatment = results
      .filter((r) => r.cohort === "treatment")
      .map((r) => parseFloat(r.netReturnPct));

    const insufficient =
      control.length < MIN_OBSERVATIONS_PER_COHORT ||
      treatment.length < MIN_OBSERVATIONS_PER_COHORT;

    if (insufficient) {
      return {
        status: "insufficient_sample",
        min_required: MIN_OBSERVATIONS_PER_COHORT,
        control_n: control.length,
        treatment_n: treatment.length,
        note:
          "Pre-registration §Sample size requires at least " +
          MIN_OBSERVATIONS_PER_COHORT +
          " observations per cohort before the statistical comparison is " +
          "computed. Do not draw conclusions from smaller samples.",
      };
    }

    const test = mannWhitneyU(control, treatment);
    const controlCI = bootstrapMedianCI(control);
    const treatmentCI = bootstrapMedianCI(treatment);

    return {
      status: "computed",
      alpha: SIGNIFICANCE_ALPHA,
      control_n: control.length,
      treatment_n: treatment.length,
      control_median: median(control),
      treatment_median: median(treatment),
      control_median_ci: controlCI,
      treatment_median_ci: treatmentCI,
      mann_whitney: test,
      significant: test ? test.p < SIGNIFICANCE_ALPHA : false,
    };
  }

  function median(arr) {
    if (!arr.length) return null;
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  async function evaluateHistoricalAlerts() {
    console.log("[Validator] Fetching historical alerts from Worker...");

    try {
      const res = await fetch(`${WORKER_BASE}/meme/alerts?limit=100`);
      if (!res.ok) throw new Error(`Worker returned ${res.status}`);

      const data = await res.json();
      const rawAlerts = data.alerts || [];
      if (!rawAlerts.length) return null;

      const accounting = {
        total_alerts_recorded: rawAlerts.length,
        dropped_invalid_address: 0,
        dropped_no_entry_price: 0,
        dropped_duplicate: 0,
        eligible_for_evaluation: 0,
        evaluated: 0,
        unresolved_no_snapshot: 0,
        unresolved_unknown_liquidity: 0,
        unresolved_implausible_gain: 0,
        // Cohort provenance on the persisted record
        evaluated_with_cohort: 0,
        evaluated_unknown_cohort: 0,
        excluded_by_rules: null,
      };

      const uniqueMap = new Map();
      for (const alert of rawAlerts) {
        const chain = alert.assessment?.identity?.chain;
        const addr = alert.assessment?.identity?.tokenAddress;
        const entry = alert.market?.priceUsd;
        const observedAtMs = alert.assessment?.observedAtMs;

        if (!chain || !addr || !observedAtMs) {
          accounting.dropped_invalid_address++;
          continue;
        }
        if (!entry || entry <= 0) {
          accounting.dropped_no_entry_price++;
          continue;
        }

        const normalized = normalizeAddress(chain, addr);
        const alertId = `${observedAtMs}:${chain}:${normalized}`;
        if (uniqueMap.has(alertId)) {
          accounting.dropped_duplicate++;
          continue;
        }
        uniqueMap.set(alertId, {
          alert,
          chain,
          tokenAddress: addr,
          entryPrice: entry,
          observedAtMs,
          cohort: extractCohort(alert),
        });
      }
      accounting.eligible_for_evaluation =
        accounting.total_alerts_recorded -
        accounting.dropped_invalid_address -
        accounting.dropped_no_entry_price -
        accounting.dropped_duplicate;

      const uniqueAlerts = [...uniqueMap.values()];
      const results = [];
      const unresolvedSamples = [];

      for (const item of uniqueAlerts) {
        const targetTime = item.observedAtMs + HORIZON_MS;
        const queryUrl = `${WORKER_BASE}/snapshot/query?chain=${encodeURIComponent(item.chain)}&address=${encodeURIComponent(item.tokenAddress)}&at=${targetTime}`;

        let snapshot = null;
        try {
          const snapRes = await fetch(queryUrl);
          if (snapRes.ok) {
            const snapData = await snapRes.json();
            if (snapData.ok && snapData.snapshot) {
              snapshot = snapData.snapshot;
            }
          }
        } catch (e) {
          console.warn(
            `[Validator] D1 query failed for ${item.tokenAddress}:`,
            e.message,
          );
        }

        if (!snapshot) {
          accounting.unresolved_no_snapshot++;
          unresolvedSamples.push({
            symbol: item.alert.symbol || "?",
            chain: item.chain,
            reason: "no-snapshot-near-timestamp",
          });
          continue;
        }

        const currentPrice = snapshot.price_usd;
        const liquidityUsd = snapshot.liquidity_usd;
        const rawReturnPct =
          ((currentPrice - item.entryPrice) / item.entryPrice) * 100;

        if (rawReturnPct > 1000) {
          accounting.unresolved_implausible_gain++;
          unresolvedSamples.push({
            symbol: item.alert.symbol || "?",
            chain: item.chain,
            reason: "implausible-gain-suspected-data-error",
          });
          continue;
        }

        const costFrac = costForLiquidity(liquidityUsd);
        if (costFrac === null) {
          accounting.unresolved_unknown_liquidity++;
          unresolvedSamples.push({
            symbol: item.alert.symbol || "?",
            chain: item.chain,
            reason: "unknown-liquidity",
          });
          continue;
        }

        const netReturnPct =
          ((1 + rawReturnPct / 100) * (1 - costFrac) - 1) * 100;

        accounting.evaluated++;
        if (item.cohort === "unknown") accounting.evaluated_unknown_cohort++;
        else accounting.evaluated_with_cohort++;

        results.push({
          symbol: item.alert.symbol || "Unknown",
          chain: item.chain,
          cohort: item.cohort,
          entryPrice: item.entryPrice,
          currentPrice,
          rawReturnPct: rawReturnPct.toFixed(2),
          costPct: (costFrac * 100).toFixed(1),
          netReturnPct: netReturnPct.toFixed(2),
          liquidityUsd,
          isWin: netReturnPct > 0,
          isRug: rawReturnPct <= -95,
        });
      }

      if (accounting.evaluated === 0) {
        return { accounting, metrics: null, trades: [], unresolvedSamples };
      }

      // ── Aggregate ──
      const nets = results
        .map((r) => parseFloat(r.netReturnPct))
        .sort((a, b) => a - b);
      const medianNet = median(nets);
      const wins = results.filter((r) => r.isWin).length;
      const rugs = results.filter((r) => r.isRug).length;
      const mean = nets.reduce((s, v) => s + v, 0) / nets.length;

      const coverageRate =
        accounting.total_alerts_recorded > 0
          ? (
              (accounting.evaluated / accounting.total_alerts_recorded) *
              100
            ).toFixed(1) + "%"
          : "0.0%";

      // ── Issue D: cohort comparison (gated on sample size) ──
      const cohortComparison = computeCohortComparison(results);

      const report = {
        version: MODULE_VERSION,
        evaluatedAt: new Date().toISOString(),
        accounting,
        metrics: {
          coverageRate,
          winRate: ((wins / accounting.evaluated) * 100).toFixed(1) + "%",
          medianNetReturn: medianNet.toFixed(2) + "%",
          meanNetReturn: mean.toFixed(2) + "%",
          rugCount: rugs,
          rugRate: ((rugs / accounting.evaluated) * 100).toFixed(1) + "%",
          cohort_comparison: cohortComparison,
        },
        baseline: {
          description:
            "Median net return across all evaluated tokens in this batch. " +
            "Not a true random-population baseline.",
          medianNetReturn: medianNet.toFixed(2) + "%",
        },
        unresolvedSamples: unresolvedSamples.slice(0, 20),
        trades: results.sort(
          (a, b) => parseFloat(b.netReturnPct) - parseFloat(a.netReturnPct),
        ),
        _limitations: {
          horizon:
            "Fixed 24-hour holding period. Entry is the alert price. " +
            "Exit is the D1 snapshot price at alert_time + 24h (±15m).",
          notPredictive:
            "Fixed-horizon performance alone is not predictive ability. " +
            "The pre-registered statistical comparison (Mann-Whitney U + " +
            "bootstrap CI) is now implemented but requires " +
            MIN_OBSERVATIONS_PER_COHORT +
            " observations per cohort. Below that threshold, status is " +
            "insufficient_sample.",
          dataErrorsExcluded:
            "Gains >1000% are excluded as suspected data errors. Extreme " +
            "losses (down to -100%) are KEPT and counted as real outcomes.",
          costModel:
            "Cost is per-trade, tiered by liquidity: 0.5% (>$1M), 1.5% " +
            "($100k-$1M), 3% ($30k-$100k), 10% (<$30k). Applied via the " +
            "pre-registered multiplicative formula.",
          coverage:
            "Coverage = evaluated / total_alerts_recorded. Alerts without " +
            "a D1 snapshot at alert_time + 24h (±15m) are counted as " +
            "unresolved and reported separately.",
          cohort_provenance:
            "Alerts persisted by the cohort-fix bundle carry " +
            "assessment.cohort = 'control' | 'treatment'. Pre-fix records " +
            "have no cohort and are counted under " +
            "accounting.evaluated_unknown_cohort but excluded from the " +
            "statistical comparison.",
        },
      };

      console.log(
        `[Validator] FIXED 24H HORIZON | coverage=${report.metrics.coverageRate} | ` +
          `winRate=${report.metrics.winRate} | ` +
          `medianNet=${report.metrics.medianNetReturn} | ` +
          `cohort=${cohortComparison.status} | ` +
          `evaluated=${accounting.evaluated}/${accounting.total_alerts_recorded}`,
      );

      return report;
    } catch (e) {
      console.error("[Validator] Failed:", e.message);
      return null;
    }
  }

  function renderReport(container, report) {
    if (!report || !report.accounting) {
      container.innerHTML =
        "<p class='muted'>No valid data to evaluate yet.</p>";
      return;
    }

    const a = report.accounting;
    const m = report.metrics;

    if (!m) {
      container.innerHTML = `
        <div class="card">
          <h3>📊 Fixed 24h Horizon Evaluation</h3>
          <div class="alert info mt">
            No tokens could be evaluated yet. The D1 snapshot database requires at least 24 hours of history.
          </div>
          <p class="muted small mt">
            Total Alerts Recorded: ${a.total_alerts_recorded} |
            Eligible for Evaluation: ${a.eligible_for_evaluation} |
            Evaluated: ${a.evaluated} |
            Unresolved (No Snapshot): ${a.unresolved_no_snapshot}
          </p>
        </div>
      `;
      return;
    }

    // ...existing trades table rendering preserved...

    const rows = report.trades
      .map(
        (t) => `
      <tr>
        <td><b>${t.symbol}</b> (${t.chain})</td>
        <td>${t.cohort}</td>
        <td>$${t.entryPrice.toPrecision(4)}</td>
        <td>$${t.currentPrice.toPrecision(4)}</td>
        <td class="${t.isWin ? "text-up" : "text-down"}">${t.rawReturnPct}%</td>
        <td>${t.costPct}%</td>
        <td class="${t.isWin ? "text-up" : "text-down"}"><b>${t.netReturnPct}%</b></td>
        ${t.isRug ? '<td><span class="tag sell">RUG</span></td>' : "<td></td>"}
      </tr>
    `,
      )
      .join("");

    const cc = report.metrics.cohort_comparison;
    const statsBlock =
      cc.status === "insufficient_sample"
        ? `<div class="alert info mt"><b>Statistical comparison: not yet computable.</b>
           Requires ${cc.min_required} observations per cohort; currently
           control=${cc.control_n}, treatment=${cc.treatment_n}.
           ${cc.note}</div>`
        : `<div class="mt">
             <b>Statistical comparison (Mann-Whitney U)</b><br>
             control n=${cc.control_n}, median=${cc.control_median.toFixed(2)}%
             (95% CI ${cc.control_median_ci.lower.toFixed(2)}% to ${cc.control_median_ci.upper.toFixed(2)}%)<br>
             treatment n=${cc.treatment_n}, median=${cc.treatment_median.toFixed(2)}%
             (95% CI ${cc.treatment_median_ci.lower.toFixed(2)}% to ${cc.treatment_median_ci.upper.toFixed(2)}%)<br>
             U=${cc.mann_whitney.U.toFixed(1)} (z=${cc.mann_whitney.z.toFixed(3)}, p=${cc.mann_whitney.p.toFixed(4)} two-sided)<br>
             Significance at α=${cc.alpha}: ${cc.significant ? "✅ significant" : "❌ not significant"}
           </div>`;

    container.innerHTML = `
      <div class="card">
        <h3>📊 Fixed 24h Horizon Evaluation</h3>
        <div class="grid-2 mt">
          <div class="card stat"><div class="stat-label">Win Rate</div><div class="stat-big">${m.winRate}</div></div>
          <div class="card stat"><div class="stat-label">Median Net Return</div><div class="stat-big">${m.medianNetReturn}</div></div>
          <div class="card stat"><div class="stat-label">Mean Net Return</div><div class="stat-big">${m.meanNetReturn}</div></div>
          <div class="card stat"><div class="stat-label">Rug Rate</div><div class="stat-big text-down">${m.rugRate}</div></div>
        </div>
        <p class="muted small mt">
          Coverage: <b>${m.coverageRate}</b>
          (Evaluated ${a.evaluated} of ${a.total_alerts_recorded} recorded alerts;
          eligible ${a.eligible_for_evaluation}).
          Unresolved: no-snapshot=${a.unresolved_no_snapshot},
          unknown-liquidity=${a.unresolved_unknown_liquidity},
          implausible-gain=${a.unresolved_implausible_gain}.
          Cohort: ${a.evaluated_with_cohort} with cohort,
          ${a.evaluated_unknown_cohort} unknown (pre-fix).
        </p>
        ${statsBlock}
        <div class="table-wrap mt">
          <table>
            <thead>
              <tr><th>Token</th><th>Cohort</th><th>Entry</th><th>24h</th><th>Raw</th><th>Cost</th><th>Net</th><th></th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  return Object.freeze({
    evaluateHistoricalAlerts,
    renderReport,
    version: MODULE_VERSION,
  });
})();

console.log(
  "[PredictiveValidator] Module loaded — v8-d1 pre-registered evaluator with Mann-Whitney U + bootstrap CI.",
);
