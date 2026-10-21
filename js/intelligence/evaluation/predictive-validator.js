// js/intelligence/evaluation/predictive-validator.js
//
// Phase 4: Predictive Value Validation
// Evaluates historical Gem Alerts against current prices to determine
// if the strategy has a real statistical edge after costs.

window.W = window.W || {};

W.predictiveValidator = (() => {
  "use strict";

  const MODULE_VERSION = "predictive-validator-v1";
  // Conservative assumption: 1.5% slippage on entry, 1.5% on exit.
  const TOTAL_ROUND_TRIP_COST_PCT = 3.0;
  const WORKER_BASE = "https://weaver-proxy.ibis01-weaver.workers.dev";

  /**
   * Fetches the current price for a token from DexScreener via the Worker proxy.
   */
  async function fetchCurrentPrice(chain, tokenAddress) {
    try {
      const url = `${WORKER_BASE}/proxy?url=${encodeURIComponent(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`)}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();

      if (data.pairs && data.pairs.length > 0) {
        // Find the pair with the highest liquidity on the correct chain
        const validPairs = data.pairs.filter((p) => p.chainId === chain);
        if (!validPairs.length) return null;

        validPairs.sort(
          (a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0),
        );
        return Number(validPairs[0].priceUsd);
      }
      return null;
    } catch (e) {
      console.warn(
        `[Validator] Price fetch failed for ${tokenAddress}:`,
        e.message,
      );
      return null;
    }
  }

  /**
   * Evaluates all historical alerts stored in the Worker.
   */
  async function evaluateHistoricalAlerts() {
    console.log("[Validator] Fetching historical alerts from Worker...");

    try {
      const res = await fetch(`${WORKER_BASE}/meme/alerts?limit=100`);
      if (!res.ok) throw new Error(`Worker returned ${res.status}`);

      const data = await res.json();
      const alerts = data.alerts || [];

      if (alerts.length === 0) {
        console.log("[Validator] No historical alerts found to evaluate.");
        return null;
      }

      const results = [];
      let totalReturnPct = 0;
      let wins = 0;
      let validTrades = 0;

      for (const alert of alerts) {
        const symbol = alert.symbol || "Unknown";
        const chain = alert.assessment?.identity?.chain;
        const tokenAddress = alert.assessment?.identity?.tokenAddress;
        const entryPrice = alert.market?.priceUsd;

        if (!chain || !tokenAddress || !entryPrice || entryPrice <= 0) continue;

        // Fetch current price
        const currentPrice = await fetchCurrentPrice(chain, tokenAddress);
        if (!currentPrice) continue;

        // Calculate Raw Return
        const rawReturnPct = ((currentPrice - entryPrice) / entryPrice) * 100;

        // Apply Costs (Slippage + Fees)
        const netReturnPct = rawReturnPct - TOTAL_ROUND_TRIP_COST_PCT;

        if (netReturnPct > 0) wins++;
        totalReturnPct += netReturnPct;
        validTrades++;

        results.push({
          symbol,
          chain,
          entryPrice,
          currentPrice,
          rawReturnPct: rawReturnPct.toFixed(2),
          netReturnPct: netReturnPct.toFixed(2),
          isWin: netReturnPct > 0,
        });
      }

      if (validTrades === 0) {
        console.log(
          "[Validator] Could not find valid current prices for historical alerts.",
        );
        return null;
      }

      const winRate = ((wins / validTrades) * 100).toFixed(1);
      const avgReturn = (totalReturnPct / validTrades).toFixed(2);

      const report = {
        version: MODULE_VERSION,
        evaluatedAt: new Date().toISOString(),
        totalAlertsFound: alerts.length,
        validTradesEvaluated: validTrades,
        winRate: winRate + "%",
        averageNetReturn: avgReturn + "%",
        totalNetReturn: totalReturnPct.toFixed(2) + "%",
        costAssumption: TOTAL_ROUND_TRIP_COST_PCT + "%",
        trades: results.sort((a, b) => b.netReturnPct - a.netReturnPct),
      };

      console.table(report.trades);
      console.log(
        `[Validator] 📊 FINAL VERDICT: Win Rate ${report.winRate} | Avg Return ${report.averageNetReturn} over ${report.validTradesEvaluated} trades.`,
      );

      return report;
    } catch (e) {
      console.error("[Validator] Evaluation failed:", e.message);
      return null;
    }
  }

  /**
   * Renders a simple UI for the report (can be hooked into a Settings/Debug page).
   */
  function renderReport(container, report) {
    if (!report) {
      container.innerHTML =
        "<p class='muted'>No valid data to evaluate yet.</p>";
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
        <td class="${t.isWin ? "text-up" : "text-down"}"><b>${t.netReturnPct}%</b></td>
      </tr>
    `,
      )
      .join("");

    container.innerHTML = `
      <div class="card">
        <h3>📊 Strategy Validation (Phase 4)</h3>
        <div class="grid-2 mt">
          <div class="card stat">
            <div class="stat-label">Win Rate</div>
            <div class="stat-big ${parseFloat(report.winRate) >= 50 ? "text-up" : "text-down"}">${report.winRate}</div>
          </div>
          <div class="card stat">
            <div class="stat-label">Avg Net Return</div>
            <div class="stat-big ${parseFloat(report.averageNetReturn) >= 0 ? "text-up" : "text-down"}">${report.averageNetReturn}</div>
          </div>
        </div>
        <p class="muted small mt">Cost Assumption: -${report.costAssumption} per trade (slippage + gas). Evaluated over ${report.validTradesEvaluated} historical alerts.</p>
        <div class="table-wrap mt">
          <table>
            <thead>
              <tr>
                <th>Token</th>
                <th>Entry</th>
                <th>Current</th>
                <th>Raw %</th>
                <th>Net %</th>
              </tr>
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

console.log("[PredictiveValidator] Module loaded — Phase 4 backtester armed.");
