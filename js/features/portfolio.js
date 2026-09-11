// ===============================================================
//         Portfolio Management Module – Canonical AssetId
// ===============================================================

window.W = window.W || {};
W.portfolio = W.portfolio || {};

(function () {
  const PORTFOLIO_KEY = "portfolio_holdings";
  let holdings = W.store.get(PORTFOLIO_KEY, []);

  function save() {
    W.store.set(PORTFOLIO_KEY, holdings);
  }

  function all() {
    return holdings;
  }

  // ── Canonical key: prefer coingeckoId, fall back to symbol ────
  function identityKey(holding) {
    if (!holding) return null;
    if (holding.assetId && holding.assetId.coingeckoId) {
      return `cg:${holding.assetId.coingeckoId}`;
    }
    if (holding.coinId) return `cg:${holding.coinId}`;
    if (holding.assetId && holding.assetId.symbol) {
      return `sym:${holding.assetId.symbol}`;
    }
    if (holding.symbol) return `sym:${holding.symbol.toUpperCase()}`;
    return null;
  }

  // ── Add/Update with weighted-average cost basis ───────────────
  async function add(holding) {
    if (!holding) {
      console.warn("[Portfolio] Invalid holding data");
      return false;
    }

    const qty = parseFloat(holding.qty) || 0;
    const buyPrice = parseFloat(holding.buyPrice) || 0;
    if (qty <= 0 || buyPrice < 0) {
      console.warn("[Portfolio] Invalid quantity or price");
      return false;
    }

    // Resolve canonical assetId if not provided
    let assetId = holding.assetId;
    if (!assetId) {
      const input = holding.coinId || holding.symbol || holding.name;
      try {
        assetId = await W.asset.resolveAssetId(input);
      } catch (e) {
        console.warn("[Portfolio] Asset resolution failed:", e.message);
        assetId = {
          chainId: "unknown",
          contractAddress: null,
          symbol: (holding.symbol || "UNKNOWN").toUpperCase(),
          coingeckoId: holding.coinId || null,
          name: holding.name || holding.symbol || "Unknown",
        };
      }
    }

    const merged = {
      ...holding,
      assetId,
      symbol: assetId.symbol,
      name: assetId.name,
      coinId: assetId.coingeckoId,
    };

    const key = identityKey(merged);
    if (!key) {
      console.warn("[Portfolio] Could not determine identity for holding");
      return false;
    }

    const existingIndex = holdings.findIndex((h) => identityKey(h) === key);

    if (existingIndex !== -1) {
      const existing = holdings[existingIndex];
      const oldQty = parseFloat(existing.qty) || 0;
      const oldAvg = parseFloat(existing.buyPrice) || 0;
      const oldTotalCost =
        existing.totalCost !== undefined ? existing.totalCost : oldQty * oldAvg;
      const newTotalCost = oldTotalCost + qty * buyPrice;
      const newTotalQty = oldQty + qty;
      const newAvgPrice = newTotalQty > 0 ? newTotalCost / newTotalQty : 0;

      holdings[existingIndex] = {
        ...existing,
        assetId,
        symbol: assetId.symbol,
        name: assetId.name,
        coinId: assetId.coingeckoId,
        qty: newTotalQty,
        buyPrice: newAvgPrice,
        totalCost: newTotalCost,
        updatedAt: Date.now(),
      };
    } else {
      const totalCost = qty * buyPrice;
      holdings.push({
        id:
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        assetId,
        symbol: assetId.symbol,
        name: assetId.name,
        coinId: assetId.coingeckoId,
        img: holding.img || "",
        qty,
        buyPrice,
        totalCost,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    save();
    return true;
  }

  function remove(id) {
    holdings = holdings.filter((h) => h.id !== id);
    save();
    return true;
  }

  function update(id, updates) {
    const index = holdings.findIndex((h) => h.id === id);
    if (index === -1) return false;
    const current = holdings[index];
    const newQty =
      updates.qty !== undefined ? parseFloat(updates.qty) : current.qty;
    const newPrice =
      updates.buyPrice !== undefined
        ? parseFloat(updates.buyPrice)
        : current.buyPrice;
    holdings[index] = {
      ...current,
      ...updates,
      qty: newQty,
      buyPrice: newPrice,
      totalCost: newQty * newPrice,
      updatedAt: Date.now(),
    };
    save();
    return true;
  }

  function clear() {
    holdings = [];
    save();
  }

  // ── Migration: resolve assetIds for legacy holdings ───────────
  async function migrateLegacyHoldings() {
    let migrated = 0;
    for (let i = 0; i < holdings.length; i++) {
      const h = holdings[i];
      if (h.assetId && h.assetId.coingeckoId) continue;
      const input = h.coinId || h.symbol || h.name;
      if (!input) continue;
      try {
        const assetId = await W.asset.resolveAssetId(input);
        holdings[i] = {
          ...h,
          assetId,
          symbol: assetId.symbol,
          name: assetId.name,
          coinId: assetId.coingeckoId,
        };
        migrated++;
      } catch (e) {
        // leave as-is
      }
    }
    if (migrated > 0) save();
    return migrated;
  }

  // ── Transactions ──────────────────────────────────────────────
  const TX_KEY = "portfolio_transactions";
  function txs() {
    return W.store.get(TX_KEY, []);
  }
  function recordTx(tx) {
    const list = W.store.get(TX_KEY, []);
    list.push({
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      ...tx,
      timestamp: Date.now(),
    });
    W.store.set(TX_KEY, list);
    return true;
  }

  // ── Sample portfolio ──────────────────────────────────────────
  async function seed() {
    const samples = [
      {
        symbol: "BTC",
        name: "Bitcoin",
        coinId: "bitcoin",
        qty: 0.5,
        buyPrice: 60000,
      },
      {
        symbol: "ETH",
        name: "Ethereum",
        coinId: "ethereum",
        qty: 5,
        buyPrice: 3000,
      },
      {
        symbol: "SOL",
        name: "Solana",
        coinId: "solana",
        qty: 20,
        buyPrice: 150,
      },
    ];
    for (const s of samples) {
      await add(s);
    }
    return true;
  }

  async function render(view) {
    view.innerHTML = '<p class="muted">Portfolio module loaded</p>';
  }

  W.portfolio = {
    all,
    add,
    remove,
    update,
    clear,
    txs,
    recordTx,
    seed,
    render,
    migrateLegacyHoldings,
    identityKey,
  };
})();

console.log(
  "[Portfolio] Module loaded (canonical AssetId + weighted-average).",
);
