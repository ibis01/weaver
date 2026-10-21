// js/intelligence/smart-money/solana-adapter.js
window.W = window.W || {};
W.smartMoney = W.smartMoney || {};

W.smartMoney.solanaAdapter = (() => {
  "use strict";
  const MODULE_VERSION = "solana-adapter-v1";
  const WORKER_BASE = "https://weaver-proxy.ibis01-weaver.workers.dev";

  // Known Solana CEX hot wallets to filter out
  const KNOWN_CEX_WALLETS = new Set([
    "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9", // Binance
    "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", // Coinbase
  ]);

  async function fetchFundingSources(addresses) {
    if (!Array.isArray(addresses) || addresses.length === 0) {
      return { fundingSources: new Map(), reason: "no-addresses" };
    }

    try {
      const res = await fetch(`${WORKER_BASE}/solana/funding-sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresses }),
      });

      if (!res.ok) throw new Error(`Worker returned ${res.status}`);
      const json = await res.json();
      if (!json.ok || !Array.isArray(json.data)) {
        throw new Error("Invalid response shape from Worker");
      }

      const fundingMap = new Map();
      for (const entry of json.data) {
        if (!entry || !entry.address) continue;
        const funder = entry.funded_by;
        if (!funder) continue;

        let type = "wallet";
        if (KNOWN_CEX_WALLETS.has(funder)) {
          type = "cex";
        }
        fundingMap.set(entry.address, { source: funder, type });
      }

      return { fundingSources: fundingMap, cached: false };
    } catch (e) {
      console.warn("[SolanaAdapter] Funding source fetch failed:", e.message);
      return { fundingSources: new Map(), reason: "fetch-failed" };
    }
  }

  async function fetchTradeHistory(wallet, tokenMint) {
    // Placeholder for Helius parsed history integration.
    // Without this, historicalEarlyEntryRate will be null, and the wallet
    // will be filtered out by the ConvergenceDetector's MIN_EARLY_ENTRY_SAMPLE check.
    console.warn(
      "[SolanaAdapter] Trade history is not yet implemented for Solana.",
    );
    return { trades: [], reason: "not-implemented" };
  }

  return Object.freeze({
    fetchFundingSources,
    fetchTradeHistory,
    version: MODULE_VERSION,
  });
})();

console.log(
  "[SolanaAdapter] Module loaded — Solana funding & trade history adapter.",
);
