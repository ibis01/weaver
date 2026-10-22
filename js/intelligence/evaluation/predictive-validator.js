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
//     netReturnPct = ((exit × (1 - costFrac)) / entry - 1) × 100.
//   - Issue B: identity is one alert = one observation, keyed by
//     observedAtMs + chain + normalized address. Solana addresses
//     are case-sensitive; EVM addresses are lowercased.
//   - Issue C: coverage is evaluated / total_alerts_recorded, with
//     an explicit six-count accounting block. No silent drops.
//
// NOT YET IMPLEMENTED (separate commit, audit Issue D):
//   - Mann-Whitney U test and bootstrap confidence interval, as
//     specified in the pre-registration's §Statistical test.

window.W = window.W || {};

W.predictiveValidator = (() => {
  "use strict";

  const MODULE_VERSION = "predictive-validator-v7-d1-prereg";
  const WORKER_BASE = "https://weaver-proxy.ibis01-weaver.workers.dev";
  const HORIZON_MS = 24 * 60 * 60 * 1000;

  // Liquidity-tiered cost model. Returns cost as a fraction (0.005..0.10)
  // or null when liquidity is unknown. The fraction is used directly in
  // the pre-registered net-return formula; the display value multiplies
  // by 100 to show a percentage.
  function costForLiquidity(liquidityUsd) {
    const l = Number(liquidityUsd) || 0;
    if (l >= 1_000_000) return 0.005;
    if (l >= 100_000) return 0.015;
    if (l >= 30_000) return 0.03;
    if (l > 0) return 0.1;
    return null;
  }

  // Chain-aware address normalization. Solana addresses are case-sensitive
  // base58; EVM addresses are hex and case-insensitive. Lowercasing a Solana
  // address can collide distinct accounts, so we must not do it.
  function normalizeAddress(chain, addr) {
    if (typeof addr !== "string" || !addr) return null;
    if (typeof chain !== "string" || !chain) return null;
    return chain === "solana" ? addr : addr.toLowerCase();
  }

  async function evaluateHistoricalAlerts() {
    console.log("[Validator] Fetching historical alerts from Worker...");

    try {
      const res = await fetch(`${WORKER_BASE}/meme/alerts?limit=100`);
      if (!res.ok) throw new Error(`Worker returned ${res.status}`);

      const data = await res.json();
      const rawAlerts = data.alerts || [];
      if (!rawAlerts.length) return null;

      // ── Explicit accounting — no silent drops (Issue C) ──
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
        // Pre-registered exclusion (danger verdict) is NOT computable on
        // historical alerts because persistMemeAlert does not forward
        // gem.risk.verdict into the payload. Recorded as null to
        // distinguish "not computable" from "zero excluded."
        excluded_by_rules: null,
      };

      // ── Alert identity (Issue B): one alert = one observation ──
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

        // Data-error guard: >1000% between two reads is not a real outcome.
        // Extreme losses are KEPT — they are real.
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

        // Pre-registered formula (audit Issue A):
        //   netReturnPct = ((exit × (1 - costFrac)) / entry - 1) × 100
        // Since exit/entry = 1 + rawReturnPct/100, this is exactly:
        //   ((1 + rawReturnPct/100) × (1 - costFrac) - 1) × 100
        const netReturnPct =
          ((1 + rawReturnPct / 100) * (1 - costFrac) - 1) * 100;

        accounting.evaluated++;

        results.push({
          symbol: item.alert.symbol || "Unknown",
          chain: item.chain,
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
        console.log(
          `[Validator] 0 tokens evaluated. Unresolved: ${accounting.unresolved_no_snapshot} no-snapshot.`,
        );
        return { accounting, metrics: null, trades: [], unresolvedSamples };
      }

      // ── Aggregate ──
      const nets = results
        .map((r) => parseFloat(r.netReturnPct))
        .sort((a, b) => a - b);
      const mid = Math.floor(nets.length / 2);
      const median =
        nets.length % 2 ? nets[mid] : (nets[mid - 1] + nets[mid]) / 2;
      const wins = results.filter((r) => r.isWin).length;
      const rugs = results.filter((r) => r.isRug).length;
      const mean = nets.reduce((s, v) => s + v, 0) / nets.length;

      const baseline = median;
      // Coverage denominator is the recorded alert population (Issue C).
      const coverageRate =
        accounting.total_alerts_recorded > 0
          ? (
              (accounting.evaluated / accounting.total_alerts_recorded) *
              100
            ).toFixed(1) + "%"
          : "0.0%";

      const report = {
        version: MODULE_VERSION,
        evaluatedAt: new Date().toISOString(),
        accounting,
        metrics: {
          coverageRate,
          winRate: ((wins / accounting.evaluated) * 100).toFixed(1) + "%",
          medianNetReturn: median.toFixed(2) + "%",
          meanNetReturn: mean.toFixed(2) + "%",
          rugCount: rugs,
          rugRate: ((rugs / accounting.evaluated) * 100).toFixed(1) + "%",
        },
        baseline: {
          description:
            "Median net return across all evaluated tokens in this batch. " +
            "Not a true random-population baseline (would require a " +
            "matched control set).",
          medianNetReturn: baseline.toFixed(2) + "%",
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
            "This establishes fixed-horizon performance, but does not " +
            "prove predictive ability without a matched control baseline " +
            "and the pre-registered Mann-Whitney U test (Issue D, pending).",
          dataErrorsExcluded:
            "Gains >1000% are excluded as suspected data errors. Extreme " +
            "losses (down to -100%) are KEPT and counted as real outcomes.",
          costModel:
            "Cost is per-trade, tiered by liquidity: 0.5% (>$1M), 1.5% " +
            "($100k-$1M), 3% ($30k-$100k), 10% (<$30k). Applied via the " +
            "pre-registered multiplicative formula, not subtraction.",
          coverage:
            "Coverage = evaluated / total_alerts_recorded. Alerts without " +
            "a D1 snapshot at alert_time + 24h (±15m), with unknown " +
            "liquidity, or with an implausible >1000% gain are counted as " +
            "unresolved and reported separately — never silently dropped. " +
            "The pre-registered danger-verdict exclusion is not computable " +
            "on historical alerts because gem.risk.verdict was not " +
            "persisted in the meme/alert payload.",
        },
      };

      console.table(
        results.map((r) => ({
          symbol: r.symbol,
          chain: r.chain,
          raw: r.rawReturnPct + "%",
          cost: r.costPct + "%",
          net: r.netReturnPct + "%",
          win: r.isWin,
          rug: r.isRug,
        })),
      );
      console.log(
        `[Validator] FIXED 24H HORIZON | coverage=${report.metrics.coverageRate} | ` +
          `winRate=${report.metrics.winRate} | ` +
          `medianNet=${report.metrics.medianNetReturn} | ` +
          `rugRate=${report.metrics.rugRate} | ` +
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
            No tokens could be evaluated yet. The D1 snapshot database was recently initialized.
            Coverage requires at least 24 hours of snapshot history.
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

    const rows = report.trades
      .map(
        (t) => `
      <tr>
        <td><b>${t.symbol}</b> (${t.chain})</td>
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

    container.innerHTML = `
      <div class="card">
        <h3>📊 Fixed 24h Horizon Evaluation</h3>
        <div class="alert info mt">
          This compares entry price at alert time to the snapshot price exactly 24 hours later.
          Coverage is currently limited because the D1 snapshot database was recently initialized.
        </div>
        <div class="grid-2 mt">
          <div class="card stat">
            <div class="stat-label">Win Rate</div>
            <div class="stat-big ${parseFloat(m.winRate) >= 50 ? "text-up" : "text-down"}">${m.winRate}</div>
          </div>
          <div class="card stat">
            <div class="stat-label">Median Net Return</div>
            <div class="stat-big ${parseFloat(m.medianNetReturn) >= 0 ? "text-up" : "text-down"}">${m.medianNetReturn}</div>
          </div>
          <div class="card stat">
            <div class="stat-label">Mean Net Return</div>
            <div class="stat-big ${parseFloat(m.meanNetReturn) >= 0 ? "text-up" : "text-down"}">${m.meanNetReturn}</div>
          </div>
          <div class="card stat">
            <div class="stat-label">Rug Rate</div>
            <div class="stat-big text-down">${m.rugRate}</div>
          </div>
        </div>
        <p class="muted small mt">
          Coverage: <b>${m.coverageRate}</b>
          (Evaluated ${a.evaluated} of ${a.total_alerts_recorded} recorded alerts; eligible ${a.eligible_for_evaluation}).
          Unresolved: no-snapshot=${a.unresolved_no_snapshot}, unknown-liquidity=${a.unresolved_unknown_liquidity}, implausible-gain=${a.unresolved_implausible_gain}.
          Excluded by pre-registered rules: ${a.excluded_by_rules === null ? "not computable (field not persisted)" : a.excluded_by_rules}.
        </p>
        <p class="muted small mt"><b>Baseline:</b> ${report.baseline.medianNetReturn} (${report.baseline.description})</p>
        <details class="mt">
          <summary class="muted small" style="cursor:pointer;">▶ Limitations (read before interpreting)</summary>
          <ul class="tx-list mt">
            <li><b>Horizon:</b> ${report._limitations.horizon}</li>
            <li><b>Not predictive:</b> ${report._limitations.notPredictive}</li>
            <li><b>Data errors:</b> ${report._limitations.dataErrorsExcluded}</li>
            <li><b>Cost model:</b> ${report._limitations.costModel}</li>
            <li><b>Coverage:</b> ${report._limitations.coverage}</li>
          </ul>
        </details>
        ${
          report.unresolvedSamples.length > 0
            ? `
          <details class="mt">
            <summary class="muted small" style="cursor:pointer;">▶ Unresolved Samples (first 20)</summary>
            <div class="table-wrap mt">
              <table>
                <thead><tr><th>Token</th><th>Chain</th><th>Reason</th></tr></thead>
                <tbody>
                  ${report.unresolvedSamples
                    .map(
                      (u) =>
                        `<tr><td>${u.symbol}</td><td>${u.chain}</td><td class="muted">${u.reason}</td></tr>`,
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
          </details>
        `
            : ""
        }
        <div class="table-wrap mt">
          <table>
            <thead>
              <tr><th>Token</th><th>Entry</th><th>24h Snapshot</th><th>Raw</th><th>Cost</th><th>Net</th><th></th></tr>
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
  "[PredictiveValidator] Module loaded — v7-d1 pre-registered evaluator.",
);
