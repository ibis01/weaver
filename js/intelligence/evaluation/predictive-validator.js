// js/intelligence/evaluation/predictive-validator.js
//
// Phase 4 — Fixed-Horizon Evaluation (Commit 1b)
//
// WARNING: This module evaluates a 24-hour fixed holding period.
// It is no longer a "current price snapshot" comparison.
// It relies entirely on the Worker's D1 snapshot database.
// If a snapshot does not exist at exactly alert_time + 24h (±15m),
// the alert is marked UNRESOLVED, not silently dropped.

window.W = window.W || {};

W.predictiveValidator = (() => {
  "use strict";

  const MODULE_VERSION = "predictive-validator-v6-d1";
  const WORKER_BASE = "https://weaver-proxy.ibis01-weaver.workers.dev";
  const HORIZON_MS = 24 * 60 * 60 * 1000;

  // Liquidity-tiered cost model.
  function costForLiquidity(liquidityUsd) {
    const l = Number(liquidityUsd) || 0;
    if (l >= 1_000_000) return 0.5;
    if (l >= 100_000) return 1.5;
    if (l >= 30_000) return 3.0;
    if (l > 0) return 10.0;
    return null; // unknown liquidity -> cannot justify a cost
  }

  async function evaluateHistoricalAlerts() {
    console.log("[Validator] Fetching historical alerts from Worker...");

    try {
      const res = await fetch(`${WORKER_BASE}/meme/alerts?limit=100`);
      if (!res.ok) throw new Error(`Worker returned ${res.status}`);

      const data = await res.json();
      const rawAlerts = data.alerts || [];
      if (!rawAlerts.length) return null;

      // ── Dedup + accounting counters ──
      const accounting = {
        total_alerts: rawAlerts.length,
        dropped_invalid_address: 0,
        dropped_no_entry_price: 0,
        dropped_duplicate: 0,
        unique_tokens: 0,
        evaluated: 0,
        unresolved_no_snapshot: 0,
        unresolved_unknown_liquidity: 0,
        unresolved_implausible_gain: 0,
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

        const key = `${chain}:${addr.toLowerCase()}`;
        if (uniqueMap.has(key)) {
          accounting.dropped_duplicate++;
          continue;
        }
        uniqueMap.set(key, {
          alert,
          chain,
          tokenAddress: addr,
          entryPrice: entry,
          observedAtMs,
        });
      }
      accounting.unique_tokens = uniqueMap.size;

      const uniqueAlerts = [...uniqueMap.values()];
      const results = [];
      const unresolvedSamples = [];

      for (const item of uniqueAlerts) {
        // The fixed 24h horizon
        const targetTime = item.observedAtMs + HORIZON_MS;

        // Query the Worker's D1 snapshot layer
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

        // Detect data errors (not real outcomes). A token cannot gain
        // 10,000% between two price reads unless one read is wrong.
        // Extreme LOSSES are kept.
        if (rawReturnPct > 1000) {
          accounting.unresolved_implausible_gain++;
          unresolvedSamples.push({
            symbol: item.alert.symbol || "?",
            chain: item.chain,
            reason: "implausible-gain-suspected-data-error",
          });
          continue;
        }

        const costPct = costForLiquidity(liquidityUsd);
        if (costPct === null) {
          accounting.unresolved_unknown_liquidity++;
          unresolvedSamples.push({
            symbol: item.alert.symbol || "?",
            chain: item.chain,
            reason: "unknown-liquidity",
          });
          continue;
        }

        const netReturnPct = rawReturnPct - costPct;
        accounting.evaluated++;

        results.push({
          symbol: item.alert.symbol || "Unknown",
          chain: item.chain,
          entryPrice: item.entryPrice,
          currentPrice,
          rawReturnPct: rawReturnPct.toFixed(2),
          costPct: costPct.toFixed(1),
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
      const coverageRate =
        ((accounting.evaluated / accounting.unique_tokens) * 100).toFixed(1) +
        "%";

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
            "prove predictive ability without a matched control baseline.",
          dataErrorsExcluded:
            "Gains >1000% are excluded as suspected data errors. Extreme " +
            "losses (down to -100%) are KEPT and counted as real outcomes.",
          costModel:
            "Cost is per-trade, tiered by liquidity: 0.5% (>$1M), 1.5% " +
            "($100k-$1M), 3% ($30k-$100k), 10% (<$30k).",
          coverage:
            "Alerts that do not have a D1 snapshot exactly 24h later " +
            "are marked unresolved, NOT dropped. This is a coverage limitation " +
            "of the newly initialized snapshot database.",
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
          `evaluated=${accounting.evaluated}/${accounting.unique_tokens}`,
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
            Total Alerts: ${a.total_alerts} | Unique Tokens: ${a.unique_tokens} | Unresolved (No Snapshot): ${a.unresolved_no_snapshot}
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
          Coverage: <b>${m.coverageRate}</b> (Evaluated ${a.evaluated} of ${a.unique_tokens} unique tokens).
          Unresolved: no-snapshot=${a.unresolved_no_snapshot}, unknown-liquidity=${a.unresolved_unknown_liquidity}, implausible-gain=${a.unresolved_implausible_gain}.
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
  "[PredictiveValidator] Module loaded — v6-d1 fixed-horizon evaluator.",
);
