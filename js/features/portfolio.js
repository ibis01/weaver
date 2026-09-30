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
        // A position that was closed and is now reopened.
        closedAt: null,
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
        realizedPnl: 0,
        disposals: [],
        closedAt: null,
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

  // ── Update (validated, allowlisted fields) ────────────────────
  // Quantity must be finite and > 0. A quantity of 0 is a full
  // disposal, and sell() is the correct entry point for that. Only
  // name, qty, buyPrice, and img can be edited. assetId, symbol,
  // coinId, id, createdAt, and the accounting fields are protected.
  function update(id, updates) {
    if (typeof id !== "string" || !id) return false;
    if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
      return false;
    }

    const index = holdings.findIndex((h) => h.id === id);
    if (index === -1) return false;

    const current = holdings[index];

    let newQty = current.qty;
    if (updates.qty !== undefined) {
      const q = parseFloat(updates.qty);
      if (!Number.isFinite(q) || q <= 0) {
        console.warn("[Portfolio] update: invalid qty");
        return false;
      }
      newQty = q;
    }

    let newPrice = current.buyPrice;
    if (updates.buyPrice !== undefined) {
      const p = parseFloat(updates.buyPrice);
      if (!Number.isFinite(p) || p < 0) {
        console.warn("[Portfolio] update: invalid buyPrice");
        return false;
      }
      newPrice = p;
    }

    const next = { ...current };
    next.qty = newQty;
    next.buyPrice = newPrice;
    next.totalCost = newQty * newPrice;
    next.updatedAt = Date.now();

    if (typeof updates.name === "string") next.name = updates.name;
    if (typeof updates.img === "string") next.img = updates.img;

    holdings[index] = next;
    save();
    return true;
  }

  // ── Sell (partial or full disposal, average-cost) ─────────────
  // Reduces the position by sellQty at the current average cost.
  // The disposed portion contributes realizedPnl = (price - avg) *
  // qty. The remaining position retains the same average cost.
  //
  // Returns a disposal record on success, or null on any failure
  // (invalid qty, invalid price, qty > held, unknown id). All
  // validation happens before any state mutation.
  function sell(id, qty, price) {
    if (typeof id !== "string" || !id) return null;

    const sellQty = parseFloat(qty);
    const sellPrice = parseFloat(price);

    if (!Number.isFinite(sellQty) || sellQty <= 0) {
      console.warn("[Portfolio] sell: invalid qty");
      return null;
    }
    if (!Number.isFinite(sellPrice) || sellPrice < 0) {
      console.warn("[Portfolio] sell: invalid price");
      return null;
    }

    const index = holdings.findIndex((h) => h.id === id);
    if (index === -1) {
      console.warn("[Portfolio] sell: holding not found");
      return null;
    }

    const h = holdings[index];
    const heldQty = parseFloat(h.qty) || 0;
    if (sellQty > heldQty) {
      console.warn("[Portfolio] sell: qty exceeds position");
      return null;
    }

    // Average cost per unit before this sale.
    const totalCost = parseFloat(h.totalCost) || 0;
    const avgCost = heldQty > 0 ? totalCost / heldQty : 0;

    // Cost basis of the disposed portion.
    const disposedCost = avgCost * sellQty;
    const proceeds = sellQty * sellPrice;
    const realizedPnl = proceeds - disposedCost;

    // Remaining position after the sale.
    const remainingQty = heldQty - sellQty;
    const remainingCost = totalCost - disposedCost;

    // New average cost per unit (should equal avgCost, but recompute
    // to avoid floating-point drift on the last partial sale).
    const newAvgPrice = remainingQty > 0 ? remainingCost / remainingQty : 0;

    const disposal = {
      qty: sellQty,
      price: sellPrice,
      costBasis: disposedCost,
      proceeds,
      realizedPnl,
      at: Date.now(),
    };

    const priorDisposals = Array.isArray(h.disposals) ? h.disposals : [];
    const priorRealized = Number.isFinite(h.realizedPnl) ? h.realizedPnl : 0;

    holdings[index] = {
      ...h,
      qty: remainingQty,
      buyPrice: newAvgPrice,
      totalCost: remainingCost,
      realizedPnl: priorRealized + realizedPnl,
      disposals: [...priorDisposals, disposal],
      closedAt: remainingQty === 0 ? Date.now() : null,
      updatedAt: Date.now(),
    };

    // Mirror into the transaction log so the tax CSV and the Track
    // Record see the sell.
    recordTx({
      type: "sell",
      coinId: h.coinId,
      symbol: h.symbol,
      name: h.name,
      qty: sellQty,
      price: sellPrice,
      total: proceeds,
      realizedPnl,
      date: disposal.at,
    });

    save();
    return disposal;
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
    sell,
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
  "[Portfolio] Module loaded (canonical AssetId + weighted-average + sell).",
);
