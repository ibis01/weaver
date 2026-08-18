// ================================================================
// js/features/portfolio.js – Portfolio Management
// ================================================================

window.W = window.W || {};

W.portfolio = (() => {
  const HKEY = "portfolio";
  const TKEY = "transactions";
  const STREAK_KEY = "portfolio_streak";

  // ── Helpers ──────────────────────────────────────────────
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }

  function escapeHTML(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Data Access ─────────────────────────────────────────
  function all() {
    return W.store.get(HKEY, []);
  }

  function save(list) {
    W.store.set(HKEY, list);
    if (W.achievements) W.achievements.check();
    updateStreak();
  }

  function txs() {
    return W.store.get(TKEY, []);
  }

  function saveTxs(list) {
    W.store.set(TKEY, list);
  }

  // ── Streak Tracking ─────────────────────────────────────
  function updateStreak() {
    const today = new Date().toDateString();
    const streak = W.store.get(STREAK_KEY, { last: today, count: 1 });
    if (streak.last !== today) {
      const yesterday = new Date(Date.now() - 864e5).toDateString();
      streak.count = streak.last === yesterday ? streak.count + 1 : 1;
      streak.last = today;
      W.store.set(STREAK_KEY, streak);
    }
    return streak;
  }

  function getStreak() {
    return W.store.get(STREAK_KEY, {
      last: new Date().toDateString(),
      count: 1,
    });
  }

  // ── CRUD Operations ─────────────────────────────────────
  function add({ coinId, symbol, name, img, qty, buyPrice, date }) {
    if (!coinId || !symbol || !name) throw new Error("Missing required fields");
    if (!qty || qty <= 0) throw new Error("Quantity must be positive");
    if (!buyPrice || buyPrice <= 0)
      throw new Error("Buy price must be positive");

    const list = all();
    const existing = list.find((x) => x.coinId === coinId);
    if (existing) {
      const totalQty = existing.qty + qty;
      existing.buyPrice =
        (existing.qty * existing.buyPrice + qty * buyPrice) / totalQty;
      existing.qty = totalQty;
    } else {
      list.push({
        id: uid(),
        coinId,
        symbol: symbol.toLowerCase(),
        name,
        img: img || "",
        qty,
        buyPrice,
        date: date || Date.now(),
      });
    }
    save(list);
    return list;
  }

  function update(id, { qty, buyPrice }) {
    const list = all();
    const item = list.find((x) => x.id === id);
    if (!item) throw new Error("Holding not found");
    if (qty && qty > 0) item.qty = qty;
    if (buyPrice && buyPrice > 0) item.buyPrice = buyPrice;
    save(list);
    return list;
  }

  function remove(id) {
    save(all().filter((h) => h.id !== id));
  }

  function clear() {
    W.store.delete(HKEY);
    W.store.delete(TKEY);
  }

  // ── Transaction Recording ──────────────────────────────
  function recordTx(tx) {
    const { type, coin, qty, price } = tx;
    if (
      !type ||
      !coin ||
      !coin.id ||
      !qty ||
      qty <= 0 ||
      !price ||
      price <= 0
    ) {
      throw new Error("Invalid transaction data");
    }
    if (!["buy", "sell"].includes(type))
      throw new Error("Invalid transaction type");

    const list = all();
    const existing = list.find((h) => h.coinId === coin.id);

    if (type === "buy") {
      if (existing) {
        const totalQty = existing.qty + qty;
        existing.buyPrice =
          (existing.qty * existing.buyPrice + qty * price) / totalQty;
        existing.qty = totalQty;
      } else {
        list.push({
          id: uid(),
          coinId: coin.id,
          symbol: coin.symbol.toLowerCase(),
          name: coin.name,
          img: coin.img || "",
          qty,
          buyPrice: price,
          date: Date.now(),
        });
      }
    } else {
      // sell
      if (!existing) throw new Error(`You don't hold ${coin.name}`);
      if (qty > existing.qty)
        throw new Error(`Cannot sell more than you hold (${existing.qty})`);
      existing.qty -= qty;
      if (existing.qty <= 1e-9) {
        const idx = list.indexOf(existing);
        if (idx > -1) list.splice(idx, 1);
      }
    }

    save(list);
    const txList = txs();
    txList.push({
      id: uid(),
      type,
      coinId: coin.id,
      symbol: coin.symbol.toLowerCase(),
      name: coin.name,
      qty,
      price,
      date: Date.now(),
    });
    saveTxs(txList.slice(-500)); // keep last 500 transactions
    return true;
  }

  // ── Seed Demo Data ──────────────────────────────────────
  function seed() {
    const now = Date.now();
    const samples = [
      {
        coinId: "bitcoin",
        symbol: "btc",
        name: "Bitcoin",
        qty: 0.25,
        buyPrice: 43250,
      },
      {
        coinId: "ethereum",
        symbol: "eth",
        name: "Ethereum",
        qty: 2.4,
        buyPrice: 2280,
      },
      {
        coinId: "solana",
        symbol: "sol",
        name: "Solana",
        qty: 18,
        buyPrice: 98,
      },
      {
        coinId: "chainlink",
        symbol: "link",
        name: "Chainlink",
        qty: 120,
        buyPrice: 14.2,
      },
      {
        coinId: "dogecoin",
        symbol: "doge",
        name: "Dogecoin",
        qty: 3000,
        buyPrice: 0.082,
      },
    ];

    const holdings = samples.map((s, i) => ({
      ...s,
      img: "",
      id: uid(),
      date: now - (200 - i * 30) * 864e5,
    }));
    save(holdings);

    const transactions = samples.map((s) => ({
      id: uid(),
      type: "buy",
      coinId: s.coinId,
      symbol: s.symbol,
      name: s.name,
      qty: s.qty,
      price: s.buyPrice,
      date: now - 200 * 864e5,
    }));
    saveTxs(transactions);
    return holdings;
  }

  // ── Exports ─────────────────────────────────────────────
  return {
    all,
    save,
    txs,
    saveTxs,
    add,
    update,
    remove,
    clear,
    recordTx,
    seed,
    getStreak,
    uid,
  };
})();

console.log("[Portfolio] Module loaded.");
