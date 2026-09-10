// ===============================================================
//         Portfolio Management Module
// ===============================================================
// Purpose: Track holdings, calculate cost basis, and manage transactions.
// P1 Data Correctness Task 2: Implement weighted-average cost basis.
// Rule 21: Safely handles NaN, zero quantities, and missing fields.
// ===============================================================

window.W = window.W || {};
W.portfolio = W.portfolio || {};

(function () {
  const PORTFOLIO_KEY = "portfolio_holdings";
  const TX_KEY = "portfolio_transactions";

  let holdings = W.store.get(PORTFOLIO_KEY, []);
  let transactions = W.store.get(TX_KEY, []);

  function save() {
    W.store.set(PORTFOLIO_KEY, holdings);
    W.store.set(TX_KEY, transactions);
  }

  function all() {
    return holdings;
  }
  function txs() {
    return transactions;
  }

  // ── Core Logic: Weighted Average Cost Basis (P1 Task 2) ──
  function add(holding) {
    if (!holding || !holding.symbol) return false;

    const symbol = holding.symbol.toUpperCase().trim();
    const newQty = parseFloat(holding.qty) || 0;
    const newPrice = parseFloat(holding.buyPrice) || 0;

    // Rule 21: Prevent invalid state (zero or negative quantity)
    if (newQty <= 0) return false;

    const existingIndex = holdings.findIndex(
      (h) => h.symbol.toUpperCase() === symbol,
    );

    if (existingIndex !== -1) {
      // MERGE: Calculate weighted average price
      const existing = holdings[existingIndex];
      const oldQty = parseFloat(existing.qty) || 0;
      const oldPrice = parseFloat(existing.buyPrice) || 0;

      const totalQty = oldQty + newQty;

      // Avoid division by zero (totalQty is guaranteed > 0 here)
      const avgPrice =
        totalQty > 0
          ? (oldQty * oldPrice + newQty * newPrice) / totalQty
          : newPrice;

      holdings[existingIndex] = {
        ...existing,
        symbol: symbol,
        name: holding.name || existing.name,
        coinId: holding.coinId || existing.coinId,
        img: holding.img || existing.img,
        qty: totalQty,
        buyPrice: avgPrice,
        updatedAt: new Date().toISOString(),
      };
    } else {
      // NEW HOLDING
      holdings.push({
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        symbol: symbol,
        name: holding.name || symbol,
        coinId: holding.coinId || symbol.toLowerCase(),
        img: holding.img || "",
        qty: newQty,
        buyPrice: newPrice,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    save();
    return true;
  }

  function remove(id) {
    holdings = holdings.filter((h) => h.id !== id);
    save();
  }

  function update(id, data) {
    const index = holdings.findIndex((h) => h.id === id);
    if (index !== -1) {
      holdings[index] = {
        ...holdings[index],
        ...data,
        updatedAt: new Date().toISOString(),
      };
      save();
    }
  }

  function recordTx(tx) {
    if (!tx || !tx.coin) return false;

    const newTx = {
      id: Date.now().toString(36),
      type: tx.type, // 'buy' or 'sell'
      coinId: tx.coin.id,
      symbol: tx.coin.symbol.toUpperCase(),
      name: tx.coin.name,
      qty: parseFloat(tx.qty),
      price: parseFloat(tx.price),
      date: new Date().toISOString(),
    };

    transactions.push(newTx);

    // Auto-update holding if it's a buy
    if (tx.type === "buy") {
      add({
        symbol: tx.coin.symbol,
        name: tx.coin.name,
        coinId: tx.coin.id,
        img: tx.coin.img,
        qty: tx.qty,
        buyPrice: tx.price,
      });
    }

    save();
    return true;
  }

  function seed() {
    holdings = [
      {
        id: "s1",
        symbol: "BTC",
        name: "Bitcoin",
        coinId: "bitcoin",
        qty: 0.5,
        buyPrice: 42000,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "s2",
        symbol: "ETH",
        name: "Ethereum",
        coinId: "ethereum",
        qty: 4.2,
        buyPrice: 2200,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    save();
  }

  W.portfolio = { all, add, remove, update, recordTx, txs, seed };
})();

console.log("[Portfolio] Module loaded (weighted-average cost basis enabled).");
