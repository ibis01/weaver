// js/intelligence/smart-money/convergence-detector.js
//
// Detects when N independent, historically-early wallets are
// accumulating the same token within a short window.
//
// Independence v1 = 1 - min(coTiming, amountProx). Two wallets
// look like the same actor only if they are similar on BOTH
// axes: same moment AND same size. Similarity on one axis alone
// is coincidence, not evidence.

window.W = window.W || {};
W.smartMoney = W.smartMoney || {};

W.smartMoney.convergenceDetector = (() => {
  "use strict";

  const MODULE_VERSION = "convergence-detector-v1";
  const N_MIN = 3;
  const INDEPENDENCE_MIN = 0.7;
  const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
  const MIN_HISTORICAL_EARLY_RATE = 0.5;
  const ETH_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

  function isValidEthAddress(a) {
    return typeof a === "string" && ETH_ADDRESS_RE.test(a);
  }

  function limitations() {
    return {
      fundingGraph:
        "independence uses co-timing and amount-proximity only. " +
        "Funding-source independence requires the funding route and " +
        "is deferred.",
      subDayTiming:
        "historical early-entry signal uses daily price maps; the " +
        "detector's own window is short but the historical timing is " +
        "day-granular.",
    };
  }

  function emptyResult(input, reason) {
    const asOf =
      input && Number.isFinite(input.asOf) && input.asOf > 0
        ? input.asOf
        : Date.now();
    return {
      tokenAddress:
        input && typeof input.tokenAddress === "string"
          ? input.tokenAddress
          : null,
      asOf,
      windowStart: asOf - DEFAULT_WINDOW_MS,
      convergence: false,
      reason,
      qualifyingWallets: [],
      independentWalletCount: 0,
      minPairwiseIndependence: null,
      _limitations: limitations(),
    };
  }

  function pairwiseIndependence(a, b, windowMs) {
    if (!a || !b) return null;
    if (!Number.isFinite(a.lastBuyAt) || !Number.isFinite(b.lastBuyAt))
      return null;
    if (!Number.isFinite(a.totalAmount) || !Number.isFinite(b.totalAmount))
      return null;
    if (!Number.isFinite(windowMs) || windowMs <= 0) return null;

    const dt = Math.abs(a.lastBuyAt - b.lastBuyAt);
    const coTiming = Math.max(0, 1 - dt / windowMs);

    const denom = Math.max(a.totalAmount, b.totalAmount, 1e-9);
    const dAmount = Math.abs(a.totalAmount - b.totalAmount) / denom;
    const amountProx = Math.max(0, 1 - dAmount);

    // Min rule: same actor only if BOTH axes look alike.
    const sameActorScore = Math.min(coTiming, amountProx);
    return Math.max(0, Math.min(1, 1 - sameActorScore));
  }

  function minPairwiseIndependence(wallets, windowMs) {
    if (!Array.isArray(wallets) || wallets.length < 2) return null;
    let min = 1;
    for (let i = 0; i < wallets.length; i++) {
      for (let j = i + 1; j < wallets.length; j++) {
        const s = pairwiseIndependence(wallets[i], wallets[j], windowMs);
        if (s === null) return null;
        if (s < min) min = s;
      }
    }
    return min;
  }

  function filterRecent(trades, asOf, windowMs) {
    const start = asOf - windowMs;
    const out = { buys: [], sells: [] };
    if (!Array.isArray(trades)) return out;
    for (const t of trades) {
      if (!t || !Number.isFinite(t.at)) continue;
      if (t.at < start || t.at > asOf) continue;
      if (!Number.isFinite(t.amount) || t.amount <= 0) continue;
      if (t.side === "in") out.buys.push(t);
      else if (t.side === "out") out.sells.push(t);
    }
    return out;
  }

  function sanitize(w) {
    return {
      wallet: w.wallet,
      lastBuyAt: w.lastBuyAt,
      buyCount: w.buyCount,
      totalAmount: w.totalAmount,
      historicalEarlyEntryRate: w.historicalEarlyEntryRate,
    };
  }

  async function detect(input) {
    if (!input || typeof input !== "object")
      return emptyResult(input, "invalid-input");
    if (input.chain !== "ethereum")
      return emptyResult(input, "unsupported-chain");
    if (!isValidEthAddress(input.tokenAddress))
      return emptyResult(input, "invalid-token");

    const asOf =
      Number.isFinite(input.asOf) && input.asOf > 0 ? input.asOf : Date.now();
    const windowMs =
      Number.isFinite(input.windowMs) && input.windowMs > 0
        ? input.windowMs
        : DEFAULT_WINDOW_MS;

    const candidates = Array.isArray(input.candidates) ? input.candidates : [];
    if (!candidates.length) return emptyResult(input, "no-candidates");

    const history = W.smartMoney && W.smartMoney.walletHistory;
    if (!history || typeof history.fetchTrades !== "function") {
      return emptyResult(input, "wallet-history-unavailable");
    }

    const qualifyingWallets = [];

    for (const c of candidates) {
      if (!c || !isValidEthAddress(c.wallet)) continue;

      const hp = c.historicalProfile;
      if (!hp || typeof hp !== "object") continue;
      if (hp.priced !== true) continue;
      if (!Number.isFinite(hp.tokenCount) || hp.tokenCount < 1) continue;
      if (!Number.isFinite(hp.earlyEntryRate)) continue;
      if (hp.earlyEntryRate < MIN_HISTORICAL_EARLY_RATE) continue;

      let trades = [];
      try {
        const r = await history.fetchTrades(
          input.chain,
          c.wallet,
          input.tokenAddress,
        );
        trades = Array.isArray(r && r.trades) ? r.trades : [];
      } catch (e) {
        console.warn(
          "[ConvergenceDetector] fetch failed for",
          String(c.wallet).slice(0, 10),
          e && e.message,
        );
        continue;
      }
      if (!trades.length) continue;

      const recent = filterRecent(trades, asOf, windowMs);
      if (!recent.buys.length) continue;

      const totalBuyAmount = recent.buys.reduce((s, t) => s + t.amount, 0);
      const totalSellAmount = recent.sells.reduce((s, t) => s + t.amount, 0);
      if (totalSellAmount >= totalBuyAmount) continue;

      const lastBuyAt = recent.buys.reduce(
        (m, t) => (t.at > m ? t.at : m),
        recent.buys[0].at,
      );

      qualifyingWallets.push({
        wallet: c.wallet,
        lastBuyAt,
        buyCount: recent.buys.length,
        totalAmount: totalBuyAmount,
        historicalEarlyEntryRate: hp.earlyEntryRate,
      });
    }

    if (qualifyingWallets.length < N_MIN) {
      return {
        tokenAddress: input.tokenAddress,
        asOf,
        windowStart: asOf - windowMs,
        convergence: false,
        reason: "insufficient-independent-wallets",
        qualifyingWallets: qualifyingWallets.map(sanitize),
        independentWalletCount: qualifyingWallets.length,
        minPairwiseIndependence: null,
        _limitations: limitations(),
      };
    }

    const mp = minPairwiseIndependence(qualifyingWallets, windowMs);
    if (mp === null || mp < INDEPENDENCE_MIN) {
      return {
        tokenAddress: input.tokenAddress,
        asOf,
        windowStart: asOf - windowMs,
        convergence: false,
        reason: "independence-below-floor",
        qualifyingWallets: qualifyingWallets.map(sanitize),
        independentWalletCount: qualifyingWallets.length,
        minPairwiseIndependence: mp,
        _limitations: limitations(),
      };
    }

    return {
      tokenAddress: input.tokenAddress,
      asOf,
      windowStart: asOf - windowMs,
      convergence: true,
      reason: "convergence",
      qualifyingWallets: qualifyingWallets.map(sanitize),
      independentWalletCount: qualifyingWallets.length,
      minPairwiseIndependence: mp,
      _limitations: limitations(),
    };
  }

  return Object.freeze({
    detect,
    version: MODULE_VERSION,
    _internal: Object.freeze({
      pairwiseIndependence,
      minPairwiseIndependence,
      filterRecent,
      limitations,
      N_MIN,
      INDEPENDENCE_MIN,
      DEFAULT_WINDOW_MS,
      MIN_HISTORICAL_EARLY_RATE,
    }),
  });
})();

console.log(
  "[ConvergenceDetector] Module loaded — N>=3, independence>=0.7, 15m window.",
);
