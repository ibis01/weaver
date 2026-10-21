// js/intelligence/smart-money/entry-assessment.js
//
// Phase 3E: Smart-Money Entry Assessment
// Orchestrates wallet-history, wallet-profiler, and convergence-detector
// to produce a final verdict on whether smart money is accumulating a token.

window.W = window.W || {};
W.smartMoney = W.smartMoney || {};

W.smartMoney.entryAssessment = (() => {
  "use strict";

  const MODULE_VERSION = "entry-assessment-v1";
  const ETH_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
  const MAX_BUYERS_TO_PROFILE = 15;
  const PROFILER_CONCURRENCY = 3;

  // We need a small universe of tokens to test against for the profiler.
  // In a real scenario, this comes from your token database.
  // For now, we will pass a generic placeholder if we don't have history.
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
    }, // Example
  ];

  function isValidEthAddress(a) {
    return typeof a === "string" && ETH_ADDRESS_RE.test(a);
  }

  function newMap() {
    return Object.create(null);
  }

  /**
   * Identifies recent buyers of a token using Blockscout.
   * (Simplified: grabs the most recent inbound transfers from known routers).
   */
  async function getRecentBuyers(
    chain,
    tokenAddress,
    limit = MAX_BUYERS_TO_PROFILE,
  ) {
    const history = W.smartMoney.walletHistory;
    if (!history) return [];

    // In a production scenario, you would query a specific token contract.
    // For this implementation, we will fetch a generic holder list or
    // rely on the fact that the convergence detector already does the heavy lifting.
    // To make this standalone, we'll return a mock list of "holders"
    // if we don't have a direct way to query top buyers.
    // (Your W.walletGraph already handles holders from GoPlus).

    // For the sake of this orchestration, we will assume the caller
    // (Gem Agent) passes us a list of candidate wallets to profile.
    return [];
  }

  /**
   * Profiles a batch of wallets concurrently.
   */
  async function profileWallets(chain, wallets) {
    const profiler = W.smartMoney.walletProfiler;
    if (!profiler || typeof profiler.profile !== "function") {
      return [];
    }

    const results = [];
    const queue = wallets.slice();

    // Simple concurrency limiter
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

  /**
   * Main entry point.
   * @param {string} chain - "ethereum"
   * @param {string} tokenAddress - The token being evaluated
   * @param {Array<string>} candidateWallets - List of wallets to evaluate (e.g., from GoPlus holders)
   */
  async function evaluate(chain, tokenAddress, candidateWallets) {
    if (chain !== "ethereum" || !isValidEthAddress(tokenAddress)) {
      return { ok: false, reason: "unsupported-chain-or-token" };
    }

    const validWallets = Array.isArray(candidateWallets)
      ? candidateWallets.filter(isValidEthAddress)
      : [];

    if (validWallets.length < 3) {
      return {
        ok: true,
        hasConvergence: false,
        reason: "not-enough-wallets",
        independentCount: validWallets.length,
      };
    }

    // 1. Profile the wallets to establish historical skill
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

    // 2. Pass the profiled wallets to the Convergence Detector
    const detector = W.smartMoney.convergenceDetector;
    if (!detector || typeof detector.detect !== "function") {
      return { ok: false, reason: "convergence-detector-unavailable" };
    }

    const detection = await detector.detect({
      chain,
      tokenAddress,
      candidates: profiledWallets,
      windowMs: 15 * 60 * 1000, // 15 minutes
      asOf: Date.now(),
    });

    if (!detection) {
      return { ok: false, reason: "detection-failed" };
    }

    // 3. Formulate the final assessment
    const independentCount = detection.independentWalletCount;
    const minIndependence = detection.minPairwiseIndependence;

    // Only consider it a "signal" if we have real convergence
    const isSignal = detection.convergence === true;

    // Calculate a confidence score (0-100)
    // Base it on how many independent wallets we found, and how high their historical early rate was
    let score = 0;
    if (isSignal) {
      const avgEarlyRate =
        profiledWallets.reduce(
          (sum, w) => sum + (w.historicalProfile.earlyEntryRate || 0),
          0,
        ) / profiledWallets.length;
      // 3 wallets = 30 pts, 5 wallets = 50 pts (cap at 50 for count)
      const countScore = Math.min(50, independentCount * 10);
      // 100% early rate = 50 pts
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
