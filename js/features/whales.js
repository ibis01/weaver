window.W = window.W || {};

W.whales = (() => {
  const KEY = "whale-wallets";
  const DEFAULTS = [
    {
      chain: "btc",
      label: "Binance Cold Wallet (reported)",
      addr: "34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo",
    },
    {
      chain: "btc",
      label: "Mega-Whale (reported)",
      addr: "bc1qa5wkgaew2dkv56kfvj49j0av5nml45x2ek9jm9",
    },
    {
      chain: "eth",
      label: "Vitalik Buterin (vitalik.eth)",
      addr: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    },
    {
      chain: "eth",
      label: "Binance Cold Wallet (reported)",
      addr: "0xF977814e90dA44bFA03b6295A0616a897441aceC",
    },
  ];
  const wallets = () => W.store.get(KEY, DEFAULTS);
  const save = (w) => W.store.set(KEY, w);
  const esc = (s) => String(s).replace(/</g, "&lt;");

  const MEMPOOL = "https://mempool.space/api";
  const BSCOUT = "https://eth.blockscout.com/api/v2";

  const timeAgo = (t) => {
    const s = (Date.now() - t) / 1000;
    if (s < 3600) return Math.max(1, Math.floor(s / 60)) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago";
    return Math.floor(s / 86400) + "d ago";
  };

  /* ── BTC via mempool.space ── */
  async function btcBalance(addr) {
    const d = await fetch(`${MEMPOOL}/address/${addr}`).then((r) => r.json());
    return (d.chain_stats.funded_txo_sum - d.chain_stats.spent_txo_sum) / 1e8;
  }
  async function btcTxs(addr) {
    const d = await fetch(`${MEMPOOL}/address/${addr}/txs`).then((r) =>
      r.json(),
    );
    return d.map((t) => {
      let out = 0,
        inn = 0;
      (t.vout || []).forEach((o) => {
        if (o.scriptpubkey_address === addr) out += o.value;
      });
      (t.vin || []).forEach((i) => {
        if (i.prevout && i.prevout.scriptpubkey_address === addr)
          inn += i.prevout.value;
      });
      return {
        hash: t.txid,
        time: (t.status?.block_time || Date.now() / 1000) * 1000,
        net: (out - inn) / 1e8,
      };
    });
  }

  /* ── ETH via Blockscout ── */
  async function ethBalance(addr) {
    const d = await fetch(`${BSCOUT}/addresses/${addr}`).then((r) => r.json());
    return parseFloat(d.coin_balance || "0") / 1e18;
  }
  async function ethTxs(addr) {
    const d = await fetch(`${BSCOUT}/addresses/${addr}/transactions`).then(
      (r) => r.json(),
    );
    return (d.items || []).map((t) => ({
      hash: t.hash,
      time: new Date(t.timestamp).getTime(),
      net:
        ((t.from?.hash || "").toLowerCase() === addr.toLowerCase() ? -1 : 1) *
        (parseFloat(t.value || "0") / 1e18),
    }));
  }

  async function card(w, prices, min) {
    const sym = w.chain === "btc" ? "BTC" : "ETH";
    const price = prices[w.chain] || 0;
    try {
      const bal =
        w.chain === "btc" ? await btcBalance(w.addr) : await ethBalance(w.addr);
      const txs = (
        w.chain === "btc" ? await btcTxs(w.addr) : await ethTxs(w.addr)
      )
        .filter((t) => Math.abs(t.net) * price >= min)
        .slice(0, 6);
      return `<div class="card">
        <div class="watch-head">
          <div><b>${esc(w.label)}</b> <span class="tag rank">${sym}</span><br><code>${W.fmt.addr(w.addr)}</code></div>
          <div style="text-align:right"><b>${bal.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${sym}</b>
            <div class="muted small">${W.fmt.money(bal * price, { compact: true })}</div></div>
        </div>
        ${
          txs.length
            ? `<ul class="tx-list">${txs
                .map(
                  (t) => `
          <li><span class="tag ${t.net > 0 ? "buy" : "sell"}">${t.net > 0 ? "⬇ IN" : "⬆ OUT"}</span>
          <b>${Math.abs(t.net).toLocaleString(undefined, { maximumFractionDigits: 1 })} ${sym}</b>
          <span class="muted">(${W.fmt.money(Math.abs(t.net) * price, { compact: true })})</span>
          <span class="muted small">${timeAgo(t.time)}</span>
          <a class="link small ml" target="_blank" href="${w.chain === "btc" ? "https://mempool.space/tx/" : "https://etherscan.io/tx/"}${t.hash}">view ↗</a></li>`,
                )
                .join("")}</ul>`
            : '<p class="muted small">No moves above threshold recently.</p>'
        }
        <div class="mt"><button class="icon-btn" data-untrack="${w.addr}">🗑️ Stop tracking</button></div>
      </div>`;
    } catch (e) {
      return `<div class="card"><b>${esc(w.label)}</b> <span class="tag rank">${sym}</span>
        <p class="muted small mt">On-chain data unavailable right now.</p>
        <button class="icon-btn" data-untrack="${w.addr}">🗑️</button></div>`;
    }
  }

  async function load(view) {
    const body = view.querySelector("#whale-body");
    const min = parseFloat(view.querySelector("#whale-min").value) * 1e6;
    const prices = { btc: 0, eth: 0 };
    try {
      (await W.api.markets("bitcoin,ethereum")).forEach(
        (c) => (prices[c.id === "bitcoin" ? "btc" : "eth"] = c.current_price),
      );
    } catch (e) {}
    const cards = await Promise.all(wallets().map((w) => card(w, prices, min)));
    body.innerHTML =
      cards.join("") ||
      W.ui.empty("🐋", "No wallets tracked", "Add one with + Track Wallet");
    body.querySelectorAll("[data-untrack]").forEach(
      (b) =>
        (b.onclick = () => {
          save(wallets().filter((x) => x.addr !== b.dataset.untrack));
          load(view);
        }),
    );
  }

  function addModal() {
    const m = W.ui.modal({
      title: "Track a Whale Wallet",
      body: `<label>Chain<select id="w-chain"><option value="btc">Bitcoin</option><option value="eth">Ethereum</option></select></label>
        <label>Label<input id="w-label" placeholder="e.g. Smart money wallet"></label>
        <label>Address<input id="w-addr" placeholder="bc1… or 0x…"></label>
        <p class="muted small mt">Paste any BTC/ETH address — e.g. copy a top holder from an explorer.</p>`,
      footer: `<button class="btn ghost" id="w-cancel">Cancel</button><button class="btn primary" id="w-save">Track 🐋</button>`,
    });
    m.el.querySelector("#w-cancel").onclick = m.close;
    m.el.querySelector("#w-save").onclick = () => {
      const chain = m.el.querySelector("#w-chain").value;
      const addr = m.el.querySelector("#w-addr").value.trim();
      const label =
        m.el.querySelector("#w-label").value.trim() ||
        (chain === "btc" ? "BTC Whale" : "ETH Whale");
      const ok =
        chain === "btc"
          ? /^(bc1|[13])[a-zA-Z0-9]{20,60}$/.test(addr)
          : /^0x[a-fA-F0-9]{40}$/.test(addr);
      if (!ok)
        return W.ui.toast(
          "Address doesn't look valid for " + chain.toUpperCase(),
          "warn",
        );
      save([...wallets(), { chain, label, addr }]);
      m.close();
      W.ui.toast("Now tracking 🐋", "ok");
      W.refresh();
    };
  }

  async function render(view) {
    view.innerHTML = `
      <div class="card">
        <div class="watch-head"><h3>🐋 Whale Wallet Tracker</h3>
          <div class="qa">
            <label style="margin:0">Min move ($M)
              <select id="whale-min" style="width:auto"><option>1</option><option selected>5</option><option>10</option><option>50</option></select>
            </label>
            <button class="btn primary" id="whale-add">+ Track Wallet</button>
            <button class="btn ghost" id="whale-refresh">⟳</button>
          </div>
        </div>
        <p class="muted small">Live on-chain feed of reported whale & exchange wallets. Labels are community-reported — always verify on-chain. Not financial advice.</p>
      </div>
      <div id="whale-body">${W.ui.spinner()}</div>`;
    view.querySelector("#whale-add").onclick = addModal;
    view.querySelector("#whale-refresh").onclick = () => render(view);
    view.querySelector("#whale-min").onchange = () => load(view);
    await load(view);
  }

  function track(addr, label, chain = "eth") {
    const l = wallets();
    if (l.some((x) => x.addr.toLowerCase() === addr.toLowerCase()))
      return false;
    save([...l, { chain, label, addr }]);
    return true;
  }

  return { render, track };
})();
