// ================================================================
// js/features/whales.js – Multi‑Chain Whale Wallet Tracker
// ================================================================

window.W = window.W || {};

W.whales = (() => {
  // ── Chain Registry ──────────────────────────────────
  const CHAINS = {
    btc: {
      label: "Bitcoin",
      symbol: "BTC",
      icon: "₿",
      explorer: "https://mempool.space/address/",
      balance: async (addr) => {
        const data = await fetch(
          `https://mempool.space/api/address/${addr}`,
        ).then((r) => r.json());
        return (
          (data.chain_stats.funded_txo_sum - data.chain_stats.spent_txo_sum) /
          1e8
        );
      },
      txs: async (addr, minValue = 0) => {
        const data = await fetch(
          `https://mempool.space/api/address/${addr}/txs`,
        ).then((r) => r.json());
        return data
          .map((t) => {
            let out = 0,
              inn = 0;
            (t.vout || []).forEach((o) => {
              if (o.scriptpubkey_address === addr) out += o.value;
            });
            (t.vin || []).forEach((i) => {
              if (i.prevout?.scriptpubkey_address === addr)
                inn += i.prevout.value;
            });
            const net = (out - inn) / 1e8;
            return {
              hash: t.txid,
              time: t.status?.block_time * 1000 || Date.now(),
              net,
            };
          })
          .filter((t) => Math.abs(t.net) >= minValue);
      },
    },
    eth: {
      label: "Ethereum",
      symbol: "ETH",
      icon: "⟠",
      explorer: "https://etherscan.io/address/",
      balance: async (addr) => {
        const data = await fetch(`https://cloudflare-eth.com/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "eth_getBalance",
            params: [addr, "latest"],
          }),
        }).then((r) => r.json());
        return parseInt(data.result || "0x0", 16) / 1e18;
      },
      txs: async (addr, minValue = 0) => {
        const data = await fetch(
          `https://eth.blockscout.com/api/v2/addresses/${addr}/transactions`,
        ).then((r) => r.json());
        return (data.items || [])
          .map((t) => {
            const net =
              t.from.hash.toLowerCase() === addr.toLowerCase() ? -1 : 1;
            const value = parseFloat(t.value || "0") / 1e18;
            return {
              hash: t.hash,
              time: new Date(t.timestamp).getTime(),
              net: net * value,
            };
          })
          .filter((t) => Math.abs(t.net) >= minValue);
      },
    },
    bsc: {
      label: "BSC",
      symbol: "BNB",
      icon: "🟡",
      explorer: "https://bscscan.com/address/",
      balance: async (addr) => {
        const data = await fetch(
          `https://api.bscscan.com/api?module=account&action=balance&address=${addr}&tag=latest`,
        ).then((r) => r.json());
        return parseInt(data.result || "0") / 1e18;
      },
      txs: async (addr, minValue = 0) => {
        const data = await fetch(
          `https://api.bscscan.com/api?module=account&action=txlist&address=${addr}&sort=desc`,
        ).then((r) => r.json());
        return (data.result || [])
          .map((t) => {
            const net = t.from.toLowerCase() === addr.toLowerCase() ? -1 : 1;
            const value = parseFloat(t.value) / 1e18;
            return {
              hash: t.hash,
              time: new Date(t.timeStamp * 1000).getTime(),
              net: net * value,
            };
          })
          .filter((t) => Math.abs(t.net) >= minValue);
      },
    },
    polygon: {
      label: "Polygon",
      symbol: "MATIC",
      icon: "🟣",
      explorer: "https://polygonscan.com/address/",
      balance: async (addr) => {
        const data = await fetch(
          `https://api.polygonscan.com/api?module=account&action=balance&address=${addr}&tag=latest`,
        ).then((r) => r.json());
        return parseInt(data.result || "0") / 1e18;
      },
      txs: async (addr, minValue = 0) => {
        const data = await fetch(
          `https://api.polygonscan.com/api?module=account&action=txlist&address=${addr}&sort=desc`,
        ).then((r) => r.json());
        return (data.result || [])
          .map((t) => {
            const net = t.from.toLowerCase() === addr.toLowerCase() ? -1 : 1;
            const value = parseFloat(t.value) / 1e18;
            return {
              hash: t.hash,
              time: new Date(t.timeStamp * 1000).getTime(),
              net: net * value,
            };
          })
          .filter((t) => Math.abs(t.net) >= minValue);
      },
    },
    arbitrum: {
      label: "Arbitrum",
      symbol: "ARB",
      icon: "🔷",
      explorer: "https://arbiscan.io/address/",
      balance: async (addr) => {
        const data = await fetch(
          `https://api.arbiscan.io/api?module=account&action=balance&address=${addr}&tag=latest`,
        ).then((r) => r.json());
        return parseInt(data.result || "0") / 1e18;
      },
      txs: async (addr, minValue = 0) => {
        const data = await fetch(
          `https://api.arbiscan.io/api?module=account&action=txlist&address=${addr}&sort=desc`,
        ).then((r) => r.json());
        return (data.result || [])
          .map((t) => {
            const net = t.from.toLowerCase() === addr.toLowerCase() ? -1 : 1;
            const value = parseFloat(t.value) / 1e18;
            return {
              hash: t.hash,
              time: new Date(t.timeStamp * 1000).getTime(),
              net: net * value,
            };
          })
          .filter((t) => Math.abs(t.net) >= minValue);
      },
    },
    avalanche: {
      label: "Avalanche",
      symbol: "AVAX",
      icon: "❄️",
      explorer: "https://snowtrace.io/address/",
      balance: async (addr) => {
        const data = await fetch(
          `https://api.snowtrace.io/api?module=account&action=balance&address=${addr}&tag=latest`,
        ).then((r) => r.json());
        return parseInt(data.result || "0") / 1e18;
      },
      txs: async (addr, minValue = 0) => {
        const data = await fetch(
          `https://api.snowtrace.io/api?module=account&action=txlist&address=${addr}&sort=desc`,
        ).then((r) => r.json());
        return (data.result || [])
          .map((t) => {
            const net = t.from.toLowerCase() === addr.toLowerCase() ? -1 : 1;
            const value = parseFloat(t.value) / 1e18;
            return {
              hash: t.hash,
              time: new Date(t.timeStamp * 1000).getTime(),
              net: net * value,
            };
          })
          .filter((t) => Math.abs(t.net) >= minValue);
      },
    },
    solana: {
      label: "Solana",
      symbol: "SOL",
      icon: "🟣",
      explorer: "https://solscan.io/account/",
      balance: async (addr) => {
        const data = await fetch("https://api.mainnet-beta.solana.com", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getBalance",
            params: [addr],
          }),
        }).then((r) => r.json());
        return (data.result?.value || 0) / 1e9;
      },
      txs: async (addr, minValue = 0) => {
        const data = await fetch(`https://api.solscan.io/account/${addr}`)
          .then((r) => r.json())
          .catch(() => ({ txs: [] }));
        if (!data.txs) return [];
        return data.txs
          .slice(0, 20)
          .map((t) => ({
            hash: t.txHash,
            time: new Date(t.blockTime * 1000).getTime(),
            net:
              t.tokenTransfers?.reduce((sum, transfer) => {
                if (transfer.to === addr)
                  sum += transfer.amount / Math.pow(10, transfer.decimals);
                if (transfer.from === addr)
                  sum -= transfer.amount / Math.pow(10, transfer.decimals);
                return sum;
              }, 0) || 0,
          }))
          .filter((t) => Math.abs(t.net) >= minValue);
      },
    },
  };

  // ── Helpers ──────────────────────────────────────────
  const KEY = "whale-wallets";
  const DEFAULTS = [
    {
      chain: "btc",
      label: "Binance Cold Wallet (reported)",
      addr: "34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo",
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
    {
      chain: "sol",
      label: "Solana Foundation (reported)",
      addr: "GxqGWmRkRqT8Ff5DzsYtXkDd7U8V3d8g1y7q5gX9a2b",
    },
  ];

  const wallets = () => W.store.get(KEY, DEFAULTS);
  const save = (list) => W.store.set(KEY, list);

  const timeAgo = (ts) => {
    const s = (Date.now() - ts) / 1000;
    if (s < 60) return "just now";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago";
    return Math.floor(s / 86400) + "d ago";
  };

  const shortAddr = (a) =>
    a.length > 12 ? a.slice(0, 6) + "…" + a.slice(-4) : a;

  // ── Fetch price for a symbol ────────────────────────
  async function getPrice(symbol) {
    try {
      const data = await W.api.markets(symbol);
      return (
        data.find((c) => c.symbol.toLowerCase() === symbol.toLowerCase())
          ?.current_price || 0
      );
    } catch {
      return 0;
    }
  }

  // ── Render one wallet card ──────────────────────────
  async function renderCard(w, minValue) {
    const chain = CHAINS[w.chain];
    if (!chain)
      return `<div class="card"><p class="muted">Unsupported chain: ${w.chain}</p></div>`;

    try {
      const [balance, txs, price] = await Promise.all([
        chain.balance(w.addr).catch(() => 0),
        chain.txs(w.addr, minValue).catch(() => []),
        getPrice(chain.symbol),
      ]);

      const valueUSD = balance * price;
      const txsHTML = txs.length
        ? `<ul class="tx-list">${txs
            .slice(0, 6)
            .map(
              (tx) => `
          <li>
            <span class="tag ${tx.net > 0 ? "buy" : "sell"}">${tx.net > 0 ? "⬇ IN" : "⬆ OUT"}</span>
            <b>${Math.abs(tx.net).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${chain.symbol}</b>
            <span class="muted">(${W.fmt.money(Math.abs(tx.net) * price, { compact: true })})</span>
            <span class="muted small">${timeAgo(tx.time)}</span>
            <a class="link small ml" target="_blank" href="${chain.explorer}${w.addr}#transactions">view ↗</a>
          </li>
        `,
            )
            .join("")}</ul>`
        : '<p class="muted small">No moves above threshold recently.</p>';

      return `
        <div class="card">
          <div class="watch-head">
            <div>
              <b>${w.label}</b>
              <span class="tag rank">${chain.icon} ${chain.symbol}</span>
              <br><code>${shortAddr(w.addr)}</code>
            </div>
            <div style="text-align:right;">
              <b>${balance.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${chain.symbol}</b>
              <div class="muted small">${W.fmt.money(valueUSD, { compact: true })}</div>
            </div>
          </div>
          ${txsHTML}
          <div class="mt">
            <button class="icon-btn" data-untrack="${w.addr}">🗑️ Stop tracking</button>
          </div>
        </div>
      `;
    } catch (e) {
      // ✅ FIX: Mask address in error logs
      console.warn(
        `[Whales] Error for ${w.chain}:${W.fmt.maskAddress(w.addr)}`,
        e,
      );
      return `
        <div class="card">
          <div class="watch-head">
            <div><b>${w.label}</b> <span class="tag rank">${chain.icon} ${chain.symbol}</span></div>
            <div><span class="tag warn">⚠️ Offline</span></div>
          </div>
          <p class="muted small">Could not fetch data right now.</p>
          <button class="icon-btn" data-untrack="${w.addr}">🗑️ Stop tracking</button>
        </div>
      `;
    }
  }

  // ── Load and render all cards ──────────────────────
  async function load(view) {
    const body = view.querySelector("#whale-body");
    const min = parseFloat(view.querySelector("#whale-min").value) || 1;
    const minValue = min * 1e6;

    const list = wallets();
    if (!list.length) {
      body.innerHTML = W.ui.empty(
        "🐋",
        "No wallets tracked",
        "Add one with + Track Wallet",
      );
      return;
    }

    body.innerHTML = W.ui.spinner();
    const cards = await Promise.all(list.map((w) => renderCard(w, minValue)));
    body.innerHTML = cards.join("");
    body.querySelectorAll("[data-untrack]").forEach((btn) => {
      btn.onclick = () => {
        const addr = btn.dataset.untrack;
        save(wallets().filter((w) => w.addr !== addr));
        load(view);
      };
    });
  }

  // ── Add Wallet Modal ─────────────────────────────────
  function addModal() {
    const m = W.ui.modal({
      title: "Track a Whale Wallet",
      body: `
        <label>
          Chain
          <select id="w-chain">
            ${Object.keys(CHAINS)
              .map(
                (c) =>
                  `<option value="${c}">${CHAINS[c].label} (${CHAINS[c].symbol})</option>`,
              )
              .join("")}
          </select>
        </label>
        <label>
          Label
          <input id="w-label" placeholder="e.g. Smart money wallet">
        </label>
        <label>
          Address
          <input id="w-addr" placeholder="Enter wallet address">
        </label>
        <p class="muted small mt">Paste any address on the selected chain.</p>
      `,
      footer: `
        <button class="btn ghost" id="w-cancel">Cancel</button>
        <button class="btn primary" id="w-save">Track 🐋</button>
      `,
    });

    m.el.querySelector("#w-cancel").onclick = m.close;
    m.el.querySelector("#w-save").onclick = () => {
      const chain = m.el.querySelector("#w-chain").value;
      const addr = m.el.querySelector("#w-addr").value.trim();
      const label =
        m.el.querySelector("#w-label").value.trim() ||
        `${CHAINS[chain].symbol} Whale`;
      if (!addr) return W.ui.toast("Please enter an address.", "warn");
      if (
        chain === "btc" &&
        !/^[13][a-zA-Z0-9]{25,34}$/.test(addr) &&
        !/^bc1[a-zA-Z0-9]{25,90}$/.test(addr)
      ) {
        return W.ui.toast("Invalid Bitcoin address.", "warn");
      }
      if (
        chain !== "btc" &&
        chain !== "sol" &&
        !/^0x[a-fA-F0-9]{40}$/.test(addr)
      ) {
        return W.ui.toast("Invalid EVM address (must start with 0x).", "warn");
      }
      if (chain === "sol" && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr)) {
        return W.ui.toast("Invalid Solana address.", "warn");
      }
      const list = wallets();
      if (list.some((w) => w.addr.toLowerCase() === addr.toLowerCase())) {
        return W.ui.toast("Already tracking this address.", "warn");
      }
      save([...list, { chain, label, addr }]);
      m.close();
      W.ui.toast("Now tracking 🐋", "ok");
      W.refresh();
    };
  }

  // ── Public render function ──────────────────────────
  async function render(view) {
    view.innerHTML = `
      <div class="card">
        <div class="watch-head">
          <h3>🐋 Multi‑Chain Whale Tracker</h3>
          <div class="qa">
            <label style="margin:0;">Min move ($M)
              <select id="whale-min" style="width:auto;">
                <option value="0.1">0.1</option>
                <option value="0.5">0.5</option>
                <option value="1" selected>1</option>
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="50">50</option>
              </select>
            </label>
            <button class="btn primary" id="whale-add">+ Track Wallet</button>
            <button class="btn ghost" id="whale-refresh">⟳</button>
          </div>
        </div>
        <p class="muted small">Live on‑chain feed for BTC, ETH, BSC, Polygon, Arbitrum, Avalanche, Solana, and more. Labels are user‑provided — always verify on‑chain. Not financial advice.</p>
      </div>
      <div id="whale-body">${W.ui.spinner()}</div>
    `;

    view.querySelector("#whale-add").onclick = addModal;
    view.querySelector("#whale-refresh").onclick = () => render(view);
    view.querySelector("#whale-min").onchange = () => load(view);

    await load(view);
  }

  // ── Public track function ──────────────────────────
  function track(addr, label, chain = "eth") {
    const list = wallets();
    if (list.some((w) => w.addr.toLowerCase() === addr.toLowerCase()))
      return false;
    save([...list, { chain, label, addr }]);
    return true;
  }

  return { render, track };
})();

console.log("[Whales] Module loaded (with masked logging).");
