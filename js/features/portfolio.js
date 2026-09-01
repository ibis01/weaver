// ===============================================================
//         Portfolio Management Module – Data Correctness
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

  // ── Add/Update with weighted-average cost basis ─────────────
  function add(holding) {
    if (!holding || !holding.symbol) {
      console.warn("[Portfolio] Invalid holding data");
      return false;
    }

    // Normalize symbol to uppercase; later we'll use AssetId
    const symbol = holding.symbol.toUpperCase();
    const qty = parseFloat(holding.qty) || 0;
    const buyPrice = parseFloat(holding.buyPrice) || 0;
    if (qty <= 0 || buyPrice < 0) {
      console.warn("[Portfolio] Invalid quantity or price");
      return false;
    }

    // Find existing holding by symbol (temporary, later we'll use AssetId)
    const existingIndex = holdings.findIndex(
      (h) => h.symbol.toUpperCase() === symbol,
    );

    if (existingIndex !== -1) {
      const existing = holdings[existingIndex];
      const oldQty = parseFloat(existing.qty) || 0;
      const oldAvg = parseFloat(existing.buyPrice) || 0;
      // Use totalCost if available, else compute from old qty and avg
      const oldTotalCost =
        existing.totalCost !== undefined ? existing.totalCost : oldQty * oldAvg;
      const newTotalCost = oldTotalCost + qty * buyPrice;
      const newTotalQty = oldQty + qty;
      const newAvgPrice = newTotalQty > 0 ? newTotalCost / newTotalQty : 0;

      holdings[existingIndex] = {
        ...existing,
        qty: newTotalQty,
        buyPrice: newAvgPrice,
        totalCost: newTotalCost,
        updatedAt: Date.now(),
      };
    } else {
      // New holding – compute totalCost
      const totalCost = qty * buyPrice;
      holdings.push({
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        symbol: symbol,
        name: holding.name || symbol,
        coinId: holding.coinId || null,
        img: holding.img || "",
        qty: qty,
        buyPrice: buyPrice,
        totalCost: totalCost,
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
    const newTotalCost = newQty * newPrice;
    holdings[index] = {
      ...current,
      ...updates,
      qty: newQty,
      buyPrice: newPrice,
      totalCost: newTotalCost,
      updatedAt: Date.now(),
    };
    save();
    return true;
  }

  function clear() {
    holdings = [];
    save();
  }

  // ── Transactions (tax reporting) ─────────────────────────────
  const TX_KEY = "portfolio_transactions";
  function txs() {
    return W.store.get(TX_KEY, []);
  }
  function recordTx(tx) {
    const list = W.store.get(TX_KEY, []);
    list.push({
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      ...tx,
      timestamp: Date.now(),
    });
    W.store.set(TX_KEY, list);
    return true;
  }

  // ── Seed sample portfolio (for testing) ──────────────────────
  function seed() {
    const samples = [
      {
        symbol: "BTC",
        name: "Bitcoin",
        coinId: "bitcoin",
        qty: 0.5,
        buyPrice: 60000,
        img: "https://assets.coingecko.com/coins/images/1/small/bitcoin.png",
      },
      {
        symbol: "ETH",
        name: "Ethereum",
        coinId: "ethereum",
        qty: 5,
        buyPrice: 3000,
        img: "https://assets.coingecko.com/coins/images/279/small/ethereum.png",
      },
      {
        symbol: "SOL",
        name: "Solana",
        coinId: "solana",
        qty: 20,
        buyPrice: 150,
        img: "https://assets.coingecko.com/coins/images/4128/small/solana.png",
      },
    ];
    samples.forEach((h) => add(h));
    return true;
  }

  // ── Render UI (minimal; dashboard handles full rendering) ──
  async function render(view) {
    // This is a stub; dashboard.js renders the portfolio table.
    // We keep it for consistency.
    view.innerHTML = '<p class="muted">Portfolio module loaded</p>';
  }

  // ── Public API ──────────────────────────────────────────────
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
  };
})();

console.log(
  "[Portfolio] Module loaded (weighted-average cost basis with totalCost).",
);
