window.W = window.W || {};

W.portfolio = (() => {
  const HKEY = "portfolio",
    TKEY = "transactions";
  const uid = () =>
    Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  const all = () => W.store.get(HKEY, []);
  const save = (list) => {
    W.store.set(HKEY, list);
    if (W.achievements) W.achievements.check();
  };
  const txs = () => W.store.get(TKEY, []);
  const saveTxs = (list) => W.store.set(TKEY, list);

  function add({ coinId, symbol, name, img, qty, buyPrice, date }) {
    const list = all();
    const h = list.find((x) => x.coinId === coinId);
    if (h) {
      const nq = h.qty + qty;
      h.buyPrice = (h.qty * h.buyPrice + qty * buyPrice) / nq;
      h.qty = nq;
    } else {
      list.push({
        id: uid(),
        coinId,
        symbol,
        name,
        img,
        qty,
        buyPrice,
        date: date || Date.now(),
      });
    }
    save(list);
  }

  function update(id, { qty, buyPrice }) {
    const list = all();
    const h = list.find((x) => x.id === id);
    if (!h) return;
    h.qty = qty;
    h.buyPrice = buyPrice;
    save(list);
  }

  function remove(id) {
    save(all().filter((h) => h.id !== id));
  }

  /* Manual transactions that auto-adjust holdings */
  function recordTx(tx) {
    const list = all();
    const h = list.find((x) => x.coinId === tx.coin.id);
    if (tx.type === "buy") {
      if (h) {
        const nq = h.qty + tx.qty;
        h.buyPrice = (h.qty * h.buyPrice + tx.qty * tx.price) / nq;
        h.qty = nq;
      } else
        list.push({
          id: uid(),
          coinId: tx.coin.id,
          symbol: tx.coin.symbol,
          name: tx.coin.name,
          img: tx.coin.img,
          qty: tx.qty,
          buyPrice: tx.price,
          date: Date.now(),
        });
    } else {
      if (!h) {
        W.ui.toast("You don't hold this coin.", "warn");
        return false;
      }
      if (tx.qty > h.qty) {
        W.ui.toast("Cannot sell more than you hold.", "warn");
        return false;
      }
      h.qty -= tx.qty;
      if (h.qty <= 1e-9) list.splice(list.indexOf(h), 1);
    }
    save(list);
    saveTxs(
      [
        ...txs(),
        {
          id: uid(),
          type: tx.type,
          coinId: tx.coin.id,
          symbol: tx.coin.symbol,
          name: tx.coin.name,
          qty: tx.qty,
          price: tx.price,
          date: Date.now(),
        },
      ].slice(-200),
    );
    return true;
  }

  /* Demo data so you can see the full dashboard instantly */
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
    save(
      samples.map((s, i) => ({
        ...s,
        img: "",
        id: uid(),
        date: now - (200 - i * 30) * 864e5,
      })),
    );
    saveTxs(
      samples.map((s) => ({
        id: uid(),
        type: "buy",
        coinId: s.coinId,
        symbol: s.symbol,
        name: s.name,
        qty: s.qty,
        price: s.buyPrice,
        date: now - 200 * 864e5,
      })),
    );
  }

  return { all, add, update, remove, txs, recordTx, seed };
})();
