// js/intelligence/evaluation/predictive-validator.js
//
// Phase 4: Predictive Value Validation
// Evaluates historical Gem Alerts using BATCHED DexScreener requests.
// Sanitizes data: filters invalid addresses, deduplicates alerts,
// ignores impossible returns, and calculates Median Net Return.

window.W = window.W || {};

W.predictiveValidator = (() => {
  "use strict";

  const MODULE_VERSION = "predictive-validator-v4";
  const TOTAL_ROUND_TRIP_COST_PCT = 3.0;
  const WORKER_BASE = "https://weaver-proxy.ibis01-weaver.workers.dev";
  const BATCH_SIZE = 30;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Basic validation to prevent DexScreener batch rejections
  function isValidAddress(chain, addr) {
    if (typeof addr !== "string") return false;
    if (chain === "solana") {
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
    }
    return /^0x[a-fA-F0-9]{40}$/i.test(addr);
  }

  async function fetchPricesInBatches(chain, tokenAddresses, retries = 3) {
    const priceMap = new Map();
    // Ensure we only send valid addresses
    const uniqueAddresses = [...new Set(tokenAddresses)].filter((addr) =>
      isValidAddress(chain, addr),
    );

    if (uniqueAddresses.length === 0) return priceMap;

    for (let i = 0; i < uniqueAddresses.length; i += BATCH_SIZE) {
      const chunk = uniqueAddresses.slice(i, i + BATCH_SIZE);
      const targetUrl = `https://api.dexscreener.com/tokens/v1/${chain}/${chunk.join(",")}`;
      const url = `${WORKER_BASE}/proxy?url=${encodeURIComponent(targetUrl)}`;

      try {
        const res = await fetch(url);
        if (res.status === 429) {
          if (retries > 0) {
            console.warn(
              `[Validator] Rate limited on ${chain} batch. Retrying in 4s...`,
            );
            await sleep(4000);
            return fetchPricesInBatches(chain, tokenAddresses, retries - 1);
          }
          console.warn(
            `[Validator] Skipping ${chain} batch due to persistent rate limits.`,
          );
          continue;
        }
        if (!res.ok) continue;

        const data = await res.json();
        const pairs = Array.isArray(data) ? data : data.pairs || [];

        for (const pair of pairs) {
          if (!pair.baseToken || !pair.baseToken.address) continue;
          const addr = pair.baseToken.address.toLowerCase();
          const price = Number(pair.priceUsd);
          if (!Number.isFinite(price)) continue;

          const existing = priceMap.get(addr);
          if (
            !existing ||
            (pair.liquidity?.usd || 0) > (existing.liquidityUsd || 0)
          ) {
            priceMap.set(addr, {
              priceUsd: price,
              liquidityUsd: pair.liquidity?.usd || 0,
            });
          }
        }
      } catch (e) {
        console.warn(`[Validator] Batch request failed:`, e.message);
      }
      await sleep(1000); // Polite 1s delay between batches
    }
    return priceMap;
  }

  async function evaluateHistoricalAlerts() {
    console.log("[Validator] Fetching historical alerts from Worker...");

    try {
      const res = await fetch(`${WORKER_BASE}/meme/alerts?limit=100`);
      if (!res.ok) throw new Error(`Worker returned ${res.status}`);

      const data = await res.json();
      const rawAlerts = data.alerts || [];
      if (rawAlerts.length === 0) return null;

      // 1. Deduplicate Alerts & Filter invalid addresses
      const uniqueAlertsMap = new Map();
      for (const alert of rawAlerts) {
        const chain = alert.assessment?.identity?.chain;
        const tokenAddress = alert.assessment?.identity?.tokenAddress;
        const entryPrice = alert.market?.priceUsd;

        if (!chain || !tokenAddress || !entryPrice || entryPrice <= 0) continue;
        if (!isValidAddress(chain, tokenAddress)) continue; // Drop 0xtest2

        const key = `${chain}:${tokenAddress.toLowerCase()}`;
        if (!uniqueAlertsMap.has(key)) {
          uniqueAlertsMap.set(key, {
            alert,
            tokenAddress: tokenAddress.toLowerCase(),
            entryPrice,
          });
        }
      }

      const uniqueAlerts = Array.from(uniqueAlertsMap.values());
      console.log(
        `[Validator] Deduplicated ${rawAlerts.length} raw alerts down to ${uniqueAlerts.length} valid unique tokens.`,
      );

      const alertsByChain = {};
      for (const item of uniqueAlerts) {
        const chain = item.alert.assessment.identity.chain;
        if (!alertsByChain[chain]) alertsByChain[chain] = [];
        alertsByChain[chain].push(item);
      }

      let validTrades = 0;
      let wins = 0;
      const returnPercentages = [];
      const results = [];

      for (const [chain, chainAlerts] of Object.entries(alertsByChain)) {
        const tokenAddresses = chainAlerts.map((a) => a.tokenAddress);
        console.log(
          `[Validator] Fetching prices for ${tokenAddresses.length} valid tokens on ${chain}...`,
        );
        const priceMap = await fetchPricesInBatches(chain, tokenAddresses);

        for (const item of chainAlerts) {
          const priceData = priceMap.get(item.tokenAddress);
          if (!priceData) continue;

          const currentPrice = priceData.priceUsd;
          if (currentPrice <= 0) continue;

          const rawReturnPct =
            ((currentPrice - item.entryPrice) / item.entryPrice) * 100;

          // 2. Sanitize Outliers: Ignore impossible returns
          if (rawReturnPct > 1000 || rawReturnPct < -99.9) continue;

          const netReturnPct = rawReturnPct - TOTAL_ROUND_TRIP_COST_PCT;
          if (netReturnPct > 0) wins++;

          returnPercentages.push(netReturnPct);
          validTrades++;

          results.push({
            symbol: item.alert.symbol || "Unknown",
            chain,
            entryPrice: item.entryPrice,
            currentPrice,
            rawReturnPct: rawReturnPct.toFixed(2),
            netReturnPct: netReturnPct.toFixed(2),
            isWin: netReturnPct > 0,
          });
        }
      }

      if (validTrades === 0) return null;

      // 3. Calculate Median
      returnPercentages.sort((a, b) => a - b);
      const mid = Math.floor(returnPercentages.length / 2);
      const medianReturn =
        returnPercentages.length % 2 !== 0
          ? returnPercentages[mid]
          : (returnPercentages[mid - 1] + returnPercentages[mid]) / 2;

      const winRate = ((wins / validTrades) * 100).toFixed(1);

      const report = {
        version: MODULE_VERSION,
        evaluatedAt: new Date().toISOString(),
        totalAlertsFound: rawAlerts.length,
        uniqueTokensEvaluated: validTrades,
        winRate: winRate + "%",
        medianNetReturn: medianReturn.toFixed(2) + "%",
        costAssumption: TOTAL_ROUND_TRIP_COST_PCT + "%",
        trades: results.sort((a, b) => b.netReturnPct - a.netReturnPct),
      };

      console.table(report.trades);
      console.log(
        `[Validator] 📊 FINAL VERDICT: Win Rate ${report.winRate} | Median Net Return ${report.medianNetReturn} over ${report.uniqueTokensEvaluated} unique tokens.`,
      );

      return report;
    } catch (e) {
      console.error("[Validator] Evaluation failed:", e.message);
      return null;
    }
  }

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
            <div class="stat-label">Median Net Return</div>
            <div class="stat-big ${parseFloat(report.medianNetReturn) >= 0 ? "text-up" : "text-down"}">${report.medianNetReturn}</div>
          </div>
        </div>
        <p class="muted small mt">Cost Assumption: -${report.costAssumption} per trade. Evaluated over ${report.uniqueTokensEvaluated} unique tokens (deduplicated from ${report.totalAlertsFound} alerts).</p>
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

console.log(
  "[PredictiveValidator] Module loaded — Phase 4 robust backtester armed.",
);
