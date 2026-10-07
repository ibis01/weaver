// js/features/smart-radar.js
//
// Manual scan orchestration for the Smart Money Radar, invoked from
// a button on the existing #/smart page.
//
// DESIGN NOTES:
//   - Bounded: MAX_WALLETS cap, one token per scan, one button click
//     per scan. This is not an automatic scanner; it lives behind
//     user intent so we never profile N wallets × M tokens in a
//     refresh cycle.
//   - Reuses W.smart.fetchHolders for the holder fetch so both the
//     tracker page and the radar share one Blockscout request path.
//   - Never throws. Every failure returns { ok: false, reason }.
//   - Renders inline into #sm-radar-body on the current #/smart view.

window.W = window.W || {};

W.smartRadar = (() => {
  "use strict";

  const MODULE_VERSION = "smart-radar-v1";
  const MAX_WALLETS = 8;
  const ETH_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

  function esc(v) {
    if (typeof W.miscEsc === "function") return W.miscEsc(v);
    if (v == null) return "";
    const s = String(v);
    return s.replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);
  }

  function isValidEthAddress(a) {
    return typeof a === "string" && ETH_ADDRESS_RE.test(a);
  }

  async function runPipeline(coin) {
    if (!coin || typeof coin.id !== "string" || !coin.id) {
      return { ok: false, reason: "invalid-coin" };
    }

    let detail;
    try {
      detail = await W.api.coin(coin.id);
    } catch (e) {
      return { ok: false, reason: "coin-detail-failed", message: e.message };
    }
    if (!detail || typeof detail !== "object") {
      return { ok: false, reason: "coin-detail-missing" };
    }

    const contract =
      detail.platforms && typeof detail.platforms === "object"
        ? detail.platforms.ethereum
        : null;
    if (!isValidEthAddress(contract)) {
      return { ok: false, reason: "no-ethereum-contract" };
    }
    const tokenAddress = String(contract).toLowerCase();

    const currentPrice = Number(
      detail.market_data &&
        detail.market_data.current_price &&
        detail.market_data.current_price.usd,
    );

    if (!W.smart || typeof W.smart.fetchHolders !== "function") {
      return { ok: false, reason: "smart-fetchHolders-unavailable" };
    }
    const holders = await W.smart.fetchHolders(tokenAddress);
    if (!holders || !holders.length) {
      return { ok: false, reason: "no-holders" };
    }

    if (!W.smartMoney || !W.smartMoney.walletProfiler) {
      return { ok: false, reason: "wallet-profiler-unavailable" };
    }
    const walletProfiler = W.smartMoney.walletProfiler;
    const candidates = [];
    const topHolders = holders.slice(0, MAX_WALLETS);
    const asOf = Date.now();

    for (const h of topHolders) {
      const addr = h && h.address && h.address.hash;
      if (!isValidEthAddress(addr)) continue;
      try {
        const profile = await walletProfiler.profile(
          "ethereum",
          addr,
          [
            {
              tokenAddress,
              coingeckoId: coin.id,
              currentPrice: Number.isFinite(currentPrice) ? currentPrice : null,
            },
          ],
          { asOf },
        );
        candidates.push({ wallet: addr, historicalProfile: profile });
      } catch (e) {
        console.warn(
          "[SmartRadar] profile failed for",
          String(addr).slice(0, 10),
          e && e.message,
        );
      }
    }

    if (!candidates.length) {
      return { ok: false, reason: "no-candidates-profiled" };
    }

    if (!W.smartMoney.convergenceDetector) {
      return { ok: false, reason: "convergence-detector-unavailable" };
    }
    const convergence = await W.smartMoney.convergenceDetector.detect({
      chain: "ethereum",
      tokenAddress,
      candidates,
      asOf,
    });

    if (!W.smartMoney.momentumDetector) {
      return { ok: false, reason: "momentum-detector-unavailable" };
    }
    const momentum = await W.smartMoney.momentumDetector.detect({
      chain: "ethereum",
      tokenAddress,
      tokenId: coin.id,
      asOf,
    });

    if (!W.smartMoney.smartEntryEngine) {
      return { ok: false, reason: "smart-entry-engine-unavailable" };
    }
    const signal = W.smartMoney.smartEntryEngine.compose({
      chain: "ethereum",
      tokenAddress,
      symbol: typeof detail.symbol === "string" ? detail.symbol : coin.symbol,
      coingeckoId: coin.id,
      convergence,
      momentum,
      asOf,
    });

    return {
      ok: true,
      coin: {
        id: coin.id,
        symbol: detail.symbol || coin.symbol || "TOKEN",
        name: detail.name || coin.name || "",
      },
      tokenAddress,
      currentPrice,
      convergence,
      momentum,
      signal,
    };
  }

  function fmtState(state) {
    if (state === "PRE_MOMENTUM")
      return '<span class="tag bullish">PRE_MOMENTUM</span>';
    if (state === "MOMENTUM_EMERGING")
      return '<span class="tag caution">EMERGING</span>';
    if (state === "MOMENTUM_CONFIRMED")
      return '<span class="tag high-risk">CONFIRMED</span>';
    return '<span class="tag neutral">unknown</span>';
  }

  const REASON_TEXT = {
    "invalid-coin": "No token selected.",
    "coin-detail-failed": "Could not fetch token details from the market API.",
    "coin-detail-missing": "No token details available.",
    "no-ethereum-contract":
      "This token has no Ethereum contract. The radar is ETH-only in v1.",
    "smart-fetchHolders-unavailable": "Holder fetch not available (W.smart not loaded).",
    "no-holders": "No holder data for this token.",
    "no-candidates-profiled":
      "No wallets could be profiled. Blockscout may be rate-limited or blocked on this network.",
    "wallet-profiler-unavailable": "Wallet profiler module not loaded.",
    "convergence-detector-unavailable": "Convergence detector module not loaded.",
    "momentum-detector-unavailable": "Momentum detector module not loaded.",
    "smart-entry-engine-unavailable": "Smart entry engine module not loaded.",
    "unexpected-error": "Unexpected error during scan.",
  };

  function renderResult(result, body) {
    if (!result.ok) {
      const msg = REASON_TEXT[result.reason] || result.reason;
      body.innerHTML = `<div class="card"><p class="muted small">${esc(msg)}</p>${
        result.message
          ? `<p class="muted text-2xs">${esc(String(result.message).slice(0, 200))}</p>`
          : ""
      }</div>`;
      return;
    }

    const { coin, convergence, momentum, signal } = result;

    const convergenceStatus = convergence.convergence
      ? '<span class="tag bullish">✓ CONVERGENCE</span>'
      : `<span class="tag neutral">✗ ${esc(convergence.reason)}</span>`;

    const convergenceDetail = convergence.convergence
      ? `${convergence.independentWalletCount} independent wallets · min pairwise independence ${
          convergence.minPairwiseIndependence != null
            ? convergence.minPairwiseIndependence.toFixed(2)
            : "—"
        }`
      : `Only ${convergence.independentWalletCount} qualifying wallet${
          convergence.independentWalletCount === 1 ? "" : "s"
        } (need 3)`;

    let signalBlock;
    if (signal) {
      signalBlock = `
        <div class="card-verdict">
          <b>🟢 SMART MONEY ENTRY</b>
          <div class="kv-row"><span>Smart Entry Score</span><b>${signal.rawData.smartEntryScore.toFixed(1)}/100</b></div>
          <div class="kv-row"><span>Momentum state</span><span>${fmtState(signal.rawData.momentumState)}</span></div>
          <div class="kv-row"><span>Independent wallets</span><b>${signal.rawData.aggregate.independentWalletCount}</b></div>
          <div class="kv-row"><span>Total net inflow</span><b>${esc(W.fmt.money(signal.rawData.aggregate.totalNetInflow, { compact: true }))}</b></div>
          <div class="kv-row"><span>Data completeness</span><b>${(signal.metadata.dataCompleteness * 100).toFixed(0)}%</b></div>
        </div>
      `;
    } else {
      signalBlock = `
        <div class="card">
          <p class="muted small">
            <b>No SMART_MONEY_ENTRY signal emitted.</b>
            The pipeline ran but did not meet the emission criteria —
            see the convergence and momentum readings above.
          </p>
        </div>
      `;
    }

    const limitationLine =
      convergence._limitations && convergence._limitations.fundingGraph
        ? `<p class="muted text-2xs mt-8">${esc(convergence._limitations.fundingGraph)}</p>`
        : "";

    body.innerHTML = `
      <div class="card">
        <h3>${esc(coin.symbol)} — ${esc(coin.name)}</h3>
        <div class="kv-row"><span>Contract</span><code>${esc(result.tokenAddress)}</code></div>
        <div class="kv-row"><span>Convergence</span><span>${convergenceStatus}</span></div>
        <div class="kv-row"><span></span><span class="muted small">${esc(convergenceDetail)}</span></div>
        <div class="kv-row"><span>Momentum</span><span>${fmtState(momentum.momentumState)}</span></div>
        ${
          momentum.signals
            ? `
          <div class="kv-row"><span>1h return</span><b>${momentum.signals.return1h != null ? momentum.signals.return1h.toFixed(2) + "%" : "—"}</b></div>
          <div class="kv-row"><span>24h return</span><b>${momentum.signals.return24h != null ? momentum.signals.return24h.toFixed(2) + "%" : "—"}</b></div>
          <div class="kv-row"><span>Volume z-score</span><b>${momentum.signals.volumeZ != null ? momentum.signals.volumeZ.toFixed(2) : "—"}</b></div>
        `
            : ""
        }
        ${limitationLine}
      </div>
      ${signalBlock}
    `;
  }

  async function scan(coin, view) {
    const body = view && view.querySelector("#sm-radar-body");
    if (!body) return;
    body.innerHTML = W.ui.spinner();

    let result;
    try {
      result = await runPipeline(coin);
    } catch (e) {
      result = {
        ok: false,
        reason: "unexpected-error",
        message: e && e.message,
      };
    }

    if (!view.isConnected) return;
    renderResult(result, body);
  }

  // Top level is NOT frozen: sibling modules (smart-radar-auto)
  // attach their own namespace under W.smartRadar. Only _internal
  // is frozen, which is where the "do not touch" contract lives.
  return {
    scan,
    version: MODULE_VERSION,
    _internal: Object.freeze({ runPipeline, renderResult, MAX_WALLETS }),
  };
})();

console.log("[SmartRadar] Module loaded — manual convergence scan for #/smart.");
