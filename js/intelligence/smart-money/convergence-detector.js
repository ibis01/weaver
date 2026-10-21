// js/intelligence/smart-money/convergence-detector.js
//
// Detects when N independent, historically-early wallets are
// accumulating the same token within a short window.
//
// Independence v3 = Behavioral (co-timing/amount) + Funding Graph.
// Two wallets look like the same actor if they are similar on BOTH
// behavioral axes, OR if they share a non-CEX funding source.
//
// CHAIN SUPPORT:
//   - ethereum: routes to W.smartMoney.walletHistory (Blockscout)
//   - solana:   routes to W.smartMoney.solanaAdapter (Solscan/Helius)

window.W = window.W || {};
W.smartMoney = W.smartMoney || {};

W.smartMoney.convergenceDetector = (() => {
  "use strict";

  const MODULE_VERSION = "convergence-detector-v3";
  const N_MIN = 3;
  const INDEPENDENCE_MIN = 0.7;
  const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
  const MIN_HISTORICAL_EARLY_RATE = 0.5;
  const MIN_EARLY_ENTRY_SAMPLE = 10;

  const ETH_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
  const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

  function isValidAddress(chain, a) {
    if (typeof a !== "string") return false;
    if (chain === "solana") return SOLANA_ADDRESS_RE.test(a);
    return ETH_ADDRESS_RE.test(a);
  }

  function limitations() {
    return {
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

    if (input.chain !== "ethereum" && input.chain !== "solana")
      return emptyResult(input, "unsupported-chain");

    if (!isValidAddress(input.chain, input.tokenAddress))
      return emptyResult(input, "invalid-token");

    const asOf =
      Number.isFinite(input.asOf) && input.asOf > 0 ? input.asOf : Date.now();
    const windowMs =
      Number.isFinite(input.windowMs) && input.windowMs > 0
        ? input.windowMs
        : DEFAULT_WINDOW_MS;

    const candidates = Array.isArray(input.candidates) ? input.candidates : [];
    if (!candidates.length) return emptyResult(input, "no-candidates");

    // Verify we have the correct adapter for the chain
    const history = W.smartMoney && W.smartMoney.walletHistory;
    const solanaAdapter = W.smartMoney && W.smartMoney.solanaAdapter;

    if (
      input.chain === "ethereum" &&
      (!history || typeof history.fetchTrades !== "function")
    ) {
      return emptyResult(input, "wallet-history-unavailable");
    }
    if (
      input.chain === "solana" &&
      (!solanaAdapter || typeof solanaAdapter.fetchTradeHistory !== "function")
    ) {
      return emptyResult(input, "solana-adapter-unavailable");
    }

    const qualifyingWallets = [];
    const __pool = { bySource: {}, records: [] };
    const __src = (c) => (c && c._poolSource) || "holder";
    const __bump = (source, field) => {
      if (!__pool.bySource[source]) {
        __pool.bySource[source] = {
          total: 0,
          qualified: 0,
          invalidAddress: 0,
          noHp: 0,
          notPriced: 0,
          noTokenCount: 0,
          noEarlyRate: 0,
          sampleBelowMin: 0,
          rateBelowMin: 0,
          fetchFailed: 0,
          noTrades: 0,
          noRecentBuys: 0,
          sellsGeBuys: 0,
        };
      }
      __pool.bySource[source][field] =
        (__pool.bySource[source][field] || 0) + 1;
    };

    for (const c of candidates) {
      const __s = __src(c);
      __bump(__s, "total");
      if (!c || !isValidAddress(input.chain, c.wallet)) {
        __bump(__s, "invalidAddress");
        continue;
      }

      const hp = c.historicalProfile;
      if (!hp || typeof hp !== "object") {
        __bump(__s, "noHp");
        continue;
      }
      if (hp.priced !== true) {
        __bump(__s, "notPriced");
        continue;
      }
      if (!Number.isFinite(hp.tokenCount) || hp.tokenCount < 1) {
        __bump(__s, "noTokenCount");
        continue;
      }
      if (!Number.isFinite(hp.earlyEntryRate)) {
        __bump(__s, "noEarlyRate");
        continue;
      }
      __pool.records.push({
        src: __s,
        wallet: String(c.wallet).slice(0, 10),
        sample: hp.earlyEntrySampleCount,
        rate: hp.earlyEntryRate,
      });
      if (
        !Number.isFinite(hp.earlyEntrySampleCount) ||
        hp.earlyEntrySampleCount < MIN_EARLY_ENTRY_SAMPLE
      ) {
        __bump(__s, "sampleBelowMin");
        continue;
      }
      if (hp.earlyEntryRate < MIN_HISTORICAL_EARLY_RATE) {
        __bump(__s, "rateBelowMin");
        continue;
      }

      let trades = [];
      try {
        let r;
        if (input.chain === "solana") {
          r = await solanaAdapter.fetchTradeHistory(
            c.wallet,
            input.tokenAddress,
          );
        } else {
          r = await history.fetchTrades(
            input.chain,
            c.wallet,
            input.tokenAddress,
          );
        }
        trades = Array.isArray(r && r.trades) ? r.trades : [];
      } catch (e) {
        console.warn(
          "[ConvergenceDetector] fetch failed for",
          String(c.wallet).slice(0, 10),
          e && e.message,
        );
        __bump(__s, "fetchFailed");
        continue;
      }
      if (!trades.length) {
        __bump(__s, "noTrades");
        continue;
      }

      const recent = filterRecent(trades, asOf, windowMs);
      if (!recent.buys.length) {
        __bump(__s, "noRecentBuys");
        continue;
      }

      const totalBuyAmount = recent.buys.reduce((s, t) => s + t.amount, 0);
      const totalSellAmount = recent.sells.reduce((s, t) => s + t.amount, 0);
      if (totalSellAmount >= totalBuyAmount) {
        __bump(__s, "sellsGeBuys");
        continue;
      }

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
        _poolSource: __s,
      });
    }

    for (const q of qualifyingWallets) {
      const s = q._poolSource || "holder";
      if (!__pool.bySource[s]) {
        __pool.bySource[s] = { total: 0, qualified: 0 };
      }
      __pool.bySource[s].qualified = (__pool.bySource[s].qualified || 0) + 1;
    }

    console.log(
      "[POOL_DIAG] " +
        JSON.stringify({
          token: String(input.tokenAddress || "").slice(0, 10),
          bySource: __pool.bySource,
          poolSampleRecords: __pool.records.filter((r) => r.src !== "holder"),
        }),
    );

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

    // ══ Funding Source Independence Check ══
    const sourceToWallets = Object.create(null);
    const allFundingSources = [];

    // Fetch funding sources (chain-aware)
    if (
      input.chain === "solana" &&
      solanaAdapter &&
      typeof solanaAdapter.fetchFundingSources === "function"
    ) {
      try {
        const res = await solanaAdapter.fetchFundingSources(
          qualifyingWallets.map((w) => w.wallet),
        );
        if (res && res.fundingSources) {
          for (const [wallet, fund] of res.fundingSources.entries()) {
            allFundingSources.push({
              wallet,
              source: fund.source,
              type: fund.type,
            });
          }
        }
      } catch (e) {
        console.warn(
          "[ConvergenceDetector] Solana funding fetch failed:",
          e.message,
        );
      }
    } else if (history && typeof history.fetchFundingSources === "function") {
      const fundingData = await Promise.all(
        qualifyingWallets.map(async (w) => {
          try {
            const res = await history.fetchFundingSources(
              input.chain,
              w.wallet,
            );
            return { wallet: w.wallet, sources: res.fundingSources || [] };
          } catch (e) {
            return { wallet: w.wallet, sources: [] };
          }
        }),
      );

      for (const item of fundingData) {
        for (const fund of item.sources) {
          allFundingSources.push({
            wallet: item.wallet,
            source: fund.source,
            type: fund.type,
          });
        }
      }
    }

    // Cluster the wallets based on shared funders
    for (const item of allFundingSources) {
      if (item.type !== "wallet") continue; // Ignore CEX/Mint
      if (!sourceToWallets[item.source]) sourceToWallets[item.source] = [];
      if (!sourceToWallets[item.source].includes(item.wallet)) {
        sourceToWallets[item.source].push(item.wallet);
      }
    }

    const clusteredWallets = new Set();
    const clusters = [];
    for (const [source, wallets] of Object.entries(sourceToWallets)) {
      if (wallets.length > 1) {
        clusters.push({
          fundingSource: source,
          wallets: wallets,
          confidence: "high",
        });
        wallets.forEach((w) => clusteredWallets.add(w));
      }
    }

    const totalWallets = qualifyingWallets.length;
    const independentCount = totalWallets - clusteredWallets.size;

    // We only care about the behavioral independence of the *unclustered* wallets
    const independentWallets = qualifyingWallets.filter(
      (w) => !clusteredWallets.has(w.wallet),
    );
    const mp = minPairwiseIndependence(independentWallets, windowMs);

    if (independentCount < N_MIN || (mp !== null && mp < INDEPENDENCE_MIN)) {
      return {
        tokenAddress: input.tokenAddress,
        asOf,
        windowStart: asOf - windowMs,
        convergence: false,
        reason:
          independentCount < N_MIN
            ? "sybil-cluster-detected"
            : "behavioral-proximity-too-high",
        qualifyingWallets: qualifyingWallets.map(sanitize),
        independentWalletCount: independentCount,
        minPairwiseIndependence: mp,
        clusters: clusters,
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
      independentWalletCount: independentCount,
      minPairwiseIndependence: mp,
      clusters: clusters,
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
      MIN_EARLY_ENTRY_SAMPLE,
    }),
  });
})();

console.log(
  "[ConvergenceDetector] Module loaded — N>=3, multi-chain, sybil-resistant, 15m window.",
);
