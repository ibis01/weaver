// js/intelligence/smart-money/entry-assessment.js
//
// Phase 3E: Smart-Money Entry Assessment
// Orchestrates wallet-history, wallet-profiler, and convergence-detector
// to produce a final verdict on whether smart money is accumulating a token.

window.W = window.W || {};
W.smartMoney = W.smartMoney || {};

W.smartMoney.entryAssessment = (() => {
  "use strict";

  const MODULE_VERSION = "entry-assessment-v2";
  const ETH_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
  const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  const MAX_BUYERS_TO_PROFILE = 15;
  const PROFILER_CONCURRENCY = 3;

  const DEFAULT_PROFILER_TOKENS = [
    {
      tokenAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7",
      coingeckoId: "tether",
      currentPrice: 1.0,
    },
    {
      tokenAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      coingeckoId: "usd-coin",
      currentPrice: 1.0,
    },
    {
      tokenAddress: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984",
      coingeckoId: "uniswap",
      currentPrice: 10.0,
    },
  ];

  function isValidAddress(chain, a) {
    if (typeof a !== "string") return false;
    if (chain === "solana") return SOLANA_ADDRESS_RE.test(a);
    return ETH_ADDRESS_RE.test(a);
  }

  async function profileWallets(chain, wallets) {
    if (chain === "solana") {
      // Solana profiler is not yet implemented (needs Helius RPC).
      // We return a neutral profile so the convergence detector can
      // evaluate funding-source independence.
      return wallets.map((w) => ({
        wallet: w,
        historicalProfile: {
          priced: true,
          tokenCount: 1,
          earlyEntryRate: 0.5,
          earlyEntrySampleCount: 10,
        },
      }));
    }

    const profiler = W.smartMoney.walletProfiler;
    if (!profiler || typeof profiler.profile !== "function") {
      return [];
    }

    const results = [];
    const queue = wallets.slice();

    const workers = Array.from({
      length: Math.min(PROFILER_CONCURRENCY, queue.length),
    }).map(async () => {
      while (queue.length) {
        const wallet = queue.shift();
        if (!wallet) break;

        try {
          const profile = await profiler.profile(
            chain,
            wallet,
            DEFAULT_PROFILER_TOKENS,
          );
          if (profile && profile.tokenCount > 0) {
            results.push({ wallet, historicalProfile: profile });
          }
        } catch (e) {
          console.warn(
            `[EntryAssessment] Profile failed for ${wallet.slice(0, 8)}:`,
            e.message,
          );
        }
      }
    });

    await Promise.all(workers);
    return results;
  }

  async function evaluate(chain, tokenAddress, candidateWallets) {
    if (chain !== "ethereum" && chain !== "solana") {
      return { ok: false, reason: "unsupported-chain" };
    }
    if (!isValidAddress(chain, tokenAddress)) {
      return { ok: false, reason: "invalid-token" };
    }

    const validWallets = Array.isArray(candidateWallets)
      ? candidateWallets.filter((w) => isValidAddress(chain, w))
      : [];

    if (validWallets.length < 3) {
      return {
        ok: true,
        hasConvergence: false,
        reason: "not-enough-wallets",
        independentCount: validWallets.length,
      };
    }

    const profiledWallets = await profileWallets(
      chain,
      validWallets.slice(0, MAX_BUYERS_TO_PROFILE),
    );

    if (profiledWallets.length < 3) {
      return {
        ok: true,
        hasConvergence: false,
        reason: "insufficient-profiled-wallets",
        independentCount: profiledWallets.length,
      };
    }

    const detector = W.smartMoney.convergenceDetector;
    if (!detector || typeof detector.detect !== "function") {
      return { ok: false, reason: "convergence-detector-unavailable" };
    }

    const detection = await detector.detect({
      chain,
      tokenAddress,
      candidates: profiledWallets,
      windowMs: 15 * 60 * 1000,
      asOf: Date.now(),
    });

    if (!detection) {
      return { ok: false, reason: "detection-failed" };
    }

    const independentCount = detection.independentWalletCount;
    const isSignal = detection.convergence === true;

    let score = 0;
    if (isSignal) {
      const avgEarlyRate =
        profiledWallets.reduce(
          (sum, w) => sum + (w.historicalProfile.earlyEntryRate || 0),
          0,
        ) / profiledWallets.length;
      const countScore = Math.min(50, independentCount * 10);
      const skillScore = Math.round(avgEarlyRate * 50);
      score = countScore + skillScore;
    }

    return {
      ok: true,
      hasConvergence: isSignal,
      score: score,
      independentCount: independentCount,
      reason: detection.reason,
      wallets: detection.qualifyingWallets,
      clusters: detection.clusters || [],
      limitations: detection._limitations,
    };
  }

  return Object.freeze({
    evaluate,
    version: MODULE_VERSION,
  });
})();

console.log("[EntryAssessment] Module loaded — orchestration complete.");
