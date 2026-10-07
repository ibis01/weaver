// js/intelligence/smart-money/wallet-profiler.js
//
// Per-wallet aggregate profiler. Consumes wallet-history for
// trades, W.smart.buildPriceMap for historical prices, and
// W.smart.analyzeWallet for per-token cost-basis reconstruction.
//
// DESIGN NOTES:
//   - Every metric is either a defensible aggregate over the
//     input list or null with a documented reason. This mirrors
//     the policy in W.memeCalibration and W.decisionEngine.
//   - asOf is a hard truncation boundary. Trades after asOf are
//     excluded from every aggregate. This is the no-look-ahead
//     guard at the module boundary.
//   - "Early entry" is day-ahead, not minute-ahead. The daily
//     price map from W.smart.buildPriceMap cannot support
//     sub-day windows. The definition is: a wallet's buy that
//     was followed within one calendar day by a price rise of
//     >= EARLY_ENTRY_PUMP_PCT. Intra-day timing is deferred
//     until we have better price history (see _limitations).
//   - Never throws. Every failure path returns an aggregate
//     with tokenCount 0 or with the affected token absent.
//   - Independent of js/features/smart.js at load time. Reads
//     W.smart.* at call time only.

window.W = window.W || {};
W.smartMoney = W.smartMoney || {};

W.smartMoney.walletProfiler = (() => {
  "use strict";

  const MODULE_VERSION = "wallet-profiler-v1";
  const EARLY_ENTRY_PUMP_PCT = 20;
  const EARLY_ENTRY_LOOKAHEAD_DAYS = 1;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const ETH_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

  function newMap() {
    return Object.create(null);
  }

  function isValidEthAddress(addr) {
    return typeof addr === "string" && ETH_ADDRESS_RE.test(addr);
  }

  // Pure. Given a trade list, a price map keyed by Date.toString(),
  // and an asOf timestamp, returns early-entry stats. Trades after
  // asOf are excluded. Trades whose next-day price is missing are
  // dropped from the sample rather than counted as non-early.
  function computeEarlyEntry(trades, priceMap, asOf) {
    if (!Array.isArray(trades) || !trades.length) {
      return { buyCount: 0, earlyCount: 0, earlyEntryRate: null };
    }
    if (!priceMap || typeof priceMap !== "object") {
      return { buyCount: 0, earlyCount: 0, earlyEntryRate: null };
    }
    if (!Number.isFinite(asOf)) {
      return { buyCount: 0, earlyCount: 0, earlyEntryRate: null };
    }

    let buyCount = 0;
    let earlyCount = 0;
    const lookaheadMs = DAY_MS * EARLY_ENTRY_LOOKAHEAD_DAYS;

    for (const t of trades) {
      if (!t || t.side !== "in") continue;
      if (!Number.isFinite(t.at)) continue;
      if (t.at > asOf) continue;                   // no look-ahead
      if (t.at + lookaheadMs > asOf) continue;     // window extends past asOf

      const tradeKey = new Date(t.at).toDateString();
      const nextKey = new Date(t.at + lookaheadMs).toDateString();

      const tradePrice = priceMap[tradeKey];
      const nextPrice = priceMap[nextKey];

      if (!Number.isFinite(tradePrice) || tradePrice <= 0) continue;
      if (!Number.isFinite(nextPrice)) continue;

      buyCount++;
      const pct = ((nextPrice - tradePrice) / tradePrice) * 100;
      if (pct >= EARLY_ENTRY_PUMP_PCT) earlyCount++;
    }

    return {
      buyCount,
      earlyCount,
      earlyEntryRate: buyCount > 0 ? earlyCount / buyCount : null,
    };
  }

  // Pure. Aggregates per-token results into a wallet profile.
  function aggregate(perToken, wallet, chain, asOf) {
    if (!Array.isArray(perToken) || !perToken.length) {
      return {
        wallet,
        chain,
        asOf,
        tokenCount: 0,
        priced: false,
        totalRealizedPnl: null,
        totalInvested: null,
        winningTradeRate: null,
        earlyEntryRate: null,
        earlyEntrySampleCount: 0,
        _limitations: {
          medianEarlyEntryMs:
            "requires intra-day price history; not available with daily granularity",
          memeSpecialization: "deferred to v2",
        },
        perToken: [],
      };
    }

    const priced = perToken.every((x) => x.analysis && x.analysis.priced);

    let totalRealized = 0;
    let totalInvested = 0;
    let winners = 0;
    let totalBuys = 0;
    let totalEarly = 0;

    for (const x of perToken) {
      const a = x.analysis || {};
      totalRealized += Number.isFinite(a.realized) ? a.realized : 0;
      totalInvested += Number.isFinite(a.invested) ? a.invested : 0;
      if (Number.isFinite(a.realized) && a.realized > 0) winners++;
      const e = x.early || {};
      totalBuys += Number.isFinite(e.buyCount) ? e.buyCount : 0;
      totalEarly += Number.isFinite(e.earlyCount) ? e.earlyCount : 0;
    }

    const winningTradeRate = perToken.length > 0 ? winners / perToken.length : null;
    const earlyEntryRate = totalBuys > 0 ? totalEarly / totalBuys : null;

    return {
      wallet,
      chain,
      asOf,
      tokenCount: perToken.length,
      priced,
      totalRealizedPnl: priced ? totalRealized : null,
      totalInvested: priced ? totalInvested : null,
      winningTradeRate,
      earlyEntryRate,
      earlyEntrySampleCount: totalBuys,
      _limitations: {
        medianEarlyEntryMs:
          "requires intra-day price history; not available with daily granularity",
        memeSpecialization: "deferred to v2",
      },
      perToken: perToken.map((x) => ({
        tokenAddress: x.tokenAddress,
        coingeckoId: x.coingeckoId || null,
        priced: !!(x.analysis && x.analysis.priced),
        realized: x.analysis ? x.analysis.realized : null,
        invested: x.analysis ? x.analysis.invested : null,
        balance: x.analysis ? x.analysis.balance : null,
        buyCount: x.early ? x.early.buyCount : 0,
        earlyCount: x.early ? x.early.earlyCount : 0,
      })),
    };
  }

  // Public. Profile a wallet across a list of tokens.
  //
  // tokens: [{ tokenAddress, coingeckoId, currentPrice }]
  //   tokenAddress   required, ETH contract address
  //   coingeckoId    required for historical price map
  //   currentPrice   optional; fallback for analyzeWallet
  //
  // Returns the aggregate. Never throws.
  async function profile(chain, wallet, tokens, options = {}) {
    const asOf =
      Number.isFinite(options.asOf) && options.asOf > 0
        ? options.asOf
        : Date.now();

    if (chain !== "ethereum") return aggregate([], wallet, chain, asOf);
    if (!isValidEthAddress(wallet)) return aggregate([], wallet, chain, asOf);
    if (!Array.isArray(tokens) || !tokens.length) {
      return aggregate([], wallet, chain, asOf);
    }

    const history = W.smartMoney && W.smartMoney.walletHistory;
    if (!history || typeof history.fetchTrades !== "function") {
      console.warn("[WalletProfiler] wallet-history not loaded");
      return aggregate([], wallet, chain, asOf);
    }
    if (!W.smart || typeof W.smart.analyzeWallet !== "function") {
      console.warn("[WalletProfiler] W.smart.analyzeWallet not available");
      return aggregate([], wallet, chain, asOf);
    }

    const perToken = [];

    for (const t of tokens) {
      if (!t || !isValidEthAddress(t.tokenAddress)) continue;

      let trades = [];
      try {
        const r = await history.fetchTrades(chain, wallet, t.tokenAddress);
        trades = Array.isArray(r && r.trades) ? r.trades : [];
      } catch (e) {
        console.warn(
          "[WalletProfiler] trade fetch failed:",
          String(t.tokenAddress).slice(0, 10),
          e && e.message,
        );
        continue;
      }
      if (!trades.length) continue;

      // asOf gate at the input boundary.
      const filtered = trades.filter(
        (x) => Number.isFinite(x.at) && x.at <= asOf,
      );
      if (!filtered.length) continue;

      let priceMap = newMap();
      if (t.coingeckoId && typeof W.smart.buildPriceMap === "function") {
        try {
          priceMap = await W.smart.buildPriceMap(t.coingeckoId, 365);
        } catch (e) {
          console.warn(
            "[WalletProfiler] price map failed:",
            t.coingeckoId,
            e && e.message,
          );
        }
      }

      const analysis = W.smart.analyzeWallet(
        filtered,
        wallet,
        priceMap,
        t.currentPrice,
      );

      const early = computeEarlyEntry(filtered, priceMap, asOf);

      perToken.push({
        tokenAddress: t.tokenAddress,
        coingeckoId: t.coingeckoId || null,
        analysis,
        early,
      });
    }

    return aggregate(perToken, wallet, chain, asOf);
  }

  return Object.freeze({
    profile,
    version: MODULE_VERSION,
    _internal: Object.freeze({
      computeEarlyEntry,
      aggregate,
      EARLY_ENTRY_PUMP_PCT,
      EARLY_ENTRY_LOOKAHEAD_DAYS,
    }),
  });
})();

console.log(
  "[WalletProfiler] Module loaded — day-ahead early entry, no-look-ahead asOf.",
);
