// js/intelligence/smart-money/solana-adapter.js
window.W = window.W || {};
W.smartMoney = W.smartMoney || {};

W.smartMoney.solanaAdapter = (() => {
  "use strict";
  const MODULE_VERSION = "solana-adapter-v2";
  const WORKER_BASE = "https://weaver-proxy.ibis01-weaver.workers.dev";

  const KNOWN_CEX_WALLETS = new Set([
    "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9",
    "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
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
        if (KNOWN_CEX_WALLETS.has(funder)) type = "cex";
        fundingMap.set(entry.address, { source: funder, type });
      }

      return { fundingSources: fundingMap, cached: false };
    } catch (e) {
      console.warn("[SolanaAdapter] Funding source fetch failed:", e.message);
      return { fundingSources: new Map(), reason: "fetch-failed" };
    }
  }

  async function fetchTradeHistory(wallet, tokenMint) {
    try {
      const res = await fetch(`${WORKER_BASE}/solana/trades`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet, tokenMint }),
      });

      if (!res.ok) throw new Error(`Worker returned ${res.status}`);
      const json = await res.json();

      if (!json.ok || !Array.isArray(json.trades)) {
        throw new Error("Invalid response shape from Worker");
      }

      return { trades: json.trades, cached: false };
    } catch (e) {
      console.warn("[SolanaAdapter] Trade history fetch failed:", e.message);
      return { trades: [], reason: "fetch-failed" };
    }
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
