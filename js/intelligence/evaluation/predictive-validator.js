// js/intelligence/evaluation/predictive-validator.js
//
// Phase 4 — CORRECTED 2026-10-22
//
// WARNING: This module does NOT establish predictive ability.
// It is a snapshot comparison: entry price at alert time vs current
// price at validator run time, with heterogeneous holding periods.
// See _limitations in every report. A true predictive evaluation
// requires fixed-horizon prices, which this module cannot produce
// without historical price data.

window.W = window.W || {};

W.predictiveValidator = (() => {
  "use strict";

  const MODULE_VERSION = "predictive-validator-v5-honest";
  const WORKER_BASE = "https://weaver-proxy.ibis01-weaver.workers.dev";
  const BATCH_SIZE = 30;

  // Liquidity-tiered cost model. Justification: memecoin slippage scales
  // inversely with pool depth. A single 3% assumption understates cost on
  // thin names and overstates cost on deep ones.
  function costForLiquidity(liquidityUsd) {
    const l = Number(liquidityUsd) || 0;
    if (l >= 1_000_000) return 0.5;
    if (l >= 100_000) return 1.5;
    if (l >= 30_000) return 3.0;
    if (l > 0) return 10.0;
    return null; // unknown liquidity → cannot justify a cost
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function isValidAddress(chain, addr) {
    if (typeof addr !== "string") return false;
    if (chain === "solana") return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
    return /^0x[a-fA-F0-9]{40}$/i.test(addr);
  }

  async function fetchPricesInBatches(chain, tokenAddresses, retries = 3) {
    const priceMap = new Map();
    const uniqueAddresses = [...new Set(tokenAddresses)].filter((a) =>
      isValidAddress(chain, a),
    );
    if (!uniqueAddresses.length) return priceMap;

    for (let i = 0; i < uniqueAddresses.length; i += BATCH_SIZE) {
      const chunk = uniqueAddresses.slice(i, i + BATCH_SIZE);
      const targetUrl = `https://api.dexscreener.com/tokens/v1/${chain}/${chunk.join(",")}`;
      const url = `${WORKER_BASE}/proxy?url=${encodeURIComponent(targetUrl)}`;
      try {
        const res = await fetch(url);
        if (res.status === 429 && retries > 0) {
          await sleep(4000);
          return fetchPricesInBatches(chain, tokenAddresses, retries - 1);
        }
        if (!res.ok) continue;
        const data = await res.json();
        const pairs = Array.isArray(data) ? data : data.pairs || [];
        for (const pair of pairs) {
          if (!pair.baseToken?.address) continue;
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
        console.warn(`[Validator] Batch failed:`, e.message);
      }
      await sleep(1000);
    }
    return priceMap;
  }

  async function evaluateHistoricalAlerts() {
    console.log(
      "[Validator] Snapshot comparison (NOT predictive — see limitations)",
    );

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
        dropped_no_current_price: 0,
        dropped_unknown_liquidity: 0,
        evaluated: 0,
      };

      const uniqueMap = new Map();
      for (const alert of rawAlerts) {
        const chain = alert.assessment?.identity?.chain;
        const addr = alert.assessment?.identity?.tokenAddress;
        const entry = alert.market?.priceUsd;
        if (!chain || !addr) {
          accounting.dropped_invalid_address++;
          continue;
        }
        if (!isValidAddress(chain, addr)) {
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
          tokenAddress: addr.toLowerCase(),
          entryPrice: entry,
        });
      }
      accounting.unique_tokens = uniqueMap.size;

      const uniqueAlerts = [...uniqueMap.values()];
      const byChain = {};
      for (const u of uniqueAlerts) {
        if (!byChain[u.chain]) byChain[u.chain] = [];
        byChain[u.chain].push(u);
      }

      const results = [];
      const unresolvedSamples = [];

      for (const [chain, chainAlerts] of Object.entries(byChain)) {
        const priceMap = await fetchPricesInBatches(
          chain,
          chainAlerts.map((a) => a.tokenAddress),
        );

        for (const item of chainAlerts) {
          const priceData = priceMap.get(item.tokenAddress);
          if (!priceData || priceData.priceUsd <= 0) {
            accounting.dropped_no_current_price++;
            unresolvedSamples.push({
              symbol: item.alert.symbol || "?",
              chain,
              reason: "no-current-price",
            });
            continue;
          }

          const currentPrice = priceData.priceUsd;
          const rawReturnPct =
            ((currentPrice - item.entryPrice) / item.entryPrice) * 100;

          // Detect data errors (not real outcomes). A token cannot gain
          // 10,000% between two price reads unless one read is wrong.
          // Extreme LOSSES are kept — they represent real rug pulls.
          if (rawReturnPct > 1000) {
            accounting.dropped_no_current_price++;
            unresolvedSamples.push({
              symbol: item.alert.symbol || "?",
              chain,
              reason: "implausible-gain-suspected-data-error",
            });
            continue;
          }

          const costPct = costForLiquidity(priceData.liquidityUsd);
          if (costPct === null) {
            accounting.dropped_unknown_liquidity++;
            unresolvedSamples.push({
              symbol: item.alert.symbol || "?",
              chain,
              reason: "unknown-liquidity",
            });
            continue;
          }

          const netReturnPct = rawReturnPct - costPct;
          accounting.evaluated++;
          results.push({
            symbol: item.alert.symbol || "Unknown",
            chain,
            entryPrice: item.entryPrice,
            currentPrice,
            rawReturnPct: rawReturnPct.toFixed(2),
            costPct: costPct.toFixed(1),
            netReturnPct: netReturnPct.toFixed(2),
            liquidityUsd: priceData.liquidityUsd,
            isWin: netReturnPct > 0,
            isRug: rawReturnPct <= -95,
          });
        }
      }

      if (accounting.evaluated === 0) return null;

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

      // Baseline: median return across all evaluated tokens. If Weaver's
      // alerts have no advantage, this equals the "random pick from the
      // alerted population" baseline. A more rigorous baseline would
      // require a population of non-alerted tokens, which we don't have.
      const baseline = median;

      const report = {
        version: MODULE_VERSION,
        evaluatedAt: new Date().toISOString(),
        accounting,
        metrics: {
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
            "matched control set), but reveals whether the aggregate " +
            "beats the median of its own sample.",
          medianNetReturn: baseline.toFixed(2) + "%",
        },
        unresolvedSamples: unresolvedSamples.slice(0, 20),
        trades: results.sort(
          (a, b) => parseFloat(b.netReturnPct) - parseFloat(a.netReturnPct),
        ),
        _limitations: {
          horizon:
            "Holding period is NOT fixed. Each trade measures entry-price " +
            "at alert time to current-price at validator run time. Alerts " +
            "from 2 hours ago and 2 weeks ago are mixed in the same statistic.",
          notPredictive:
            "This is a snapshot comparison, not a walk-forward predictive " +
            "evaluation. It does not establish whether the alerts have " +
            "predictive value for future price movements.",
          dataErrorsExcluded:
            "Gains >1000% are excluded as suspected data errors. Extreme " +
            "losses (down to -100%) are KEPT and counted as real outcomes.",
          costModel:
            "Cost is per-trade, tiered by liquidity: 0.5% (>$1M), 1.5% " +
            "($100k-$1M), 3% ($30k-$100k), 10% (<$30k). Trades with " +
            "unknown liquidity are marked unresolved, not costed at an " +
            "arbitrary rate.",
          baseline:
            "The baseline shown is the median of the evaluated sample " +
            "itself. A rigorous baseline requires a matched control set " +
            "of non-alerted tokens, which this validator does not have.",
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
        `[Validator] SNAPSHOT RESULT (not predictive) | ` +
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
    if (!report) {
      container.innerHTML =
        "<p class='muted'>No valid data to evaluate yet.</p>";
      return;
    }

    const a = report.accounting;
    const m = report.metrics;

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
        <h3>📊 Snapshot Comparison — NOT a predictive evaluation</h3>
        <div class="alert warn mt">
          This compares entry price at alert time to current price at run time.
          Holding periods vary. It does not establish predictive ability.
          See limitations below.
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
          Evaluated ${a.evaluated} of ${a.unique_tokens} unique tokens.
          Dropped: invalid=${a.dropped_invalid_address},
          no-entry=${a.dropped_no_entry_price},
          dup=${a.dropped_duplicate},
          no-current-price=${a.dropped_no_current_price},
          unknown-liquidity=${a.dropped_unknown_liquidity}.
        </p>
        <p class="muted small mt"><b>Baseline:</b> ${report.baseline.medianNetReturn} (${report.baseline.description})</p>
        <details class="mt">
          <summary class="muted small" style="cursor:pointer;">▶ Limitations (read before interpreting)</summary>
          <ul class="tx-list mt">
            <li><b>Horizon:</b> ${report._limitations.horizon}</li>
            <li><b>Not predictive:</b> ${report._limitations.notPredictive}</li>
            <li><b>Data errors:</b> ${report._limitations.dataErrorsExcluded}</li>
            <li><b>Cost model:</b> ${report._limitations.costModel}</li>
            <li><b>Baseline:</b> ${report._limitations.baseline}</li>
          </ul>
        </details>
        <div class="table-wrap mt">
          <table>
            <thead>
              <tr><th>Token</th><th>Entry</th><th>Current</th><th>Raw</th><th>Cost</th><th>Net</th><th></th></tr>
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
  "[PredictiveValidator] Module loaded — v5-honest snapshot comparison.",
);
