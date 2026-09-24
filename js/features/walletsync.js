// ================================================================
//  Secure Multi‑Chain Wallet Sync
// ================================================================

window.W = window.W || {};

W.walletSync = (() => {
  // ── Constants ─────────────────────────────────────────
  const STORAGE_KEY = "wallet_sync_data";
  const CACHE_KEY = "wallet_sync_cache";
  const CACHE_TTL = 300000; // 5 minutes

  async function fetchJSON(url, options, schema) {
    const response = W.requestGuard
      ? await W.requestGuard.fetch(url, options, {
          capacity: 8,
          refillMs: 10000,
          failureThreshold: 4,
          cooldownMs: 30000,
        })
      : await fetch(url, options);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (W.schemas) W.schemas.validate(schema, data);
    W.dataHealth?.mark("wallet-data", {
      source: new URL(url).hostname,
      observedAt: Date.now(),
      staleAfter: CACHE_TTL * 2,
    });
    return data;
  }

  // ── Chain configurations ──────────────────────────────
  const CHAINS = {
    btc: {
      label: "Bitcoin",
      symbol: "BTC",
      icon: "₿",
      coingeckoId: "bitcoin",
      explorer: "https://mempool.space/address/",
      balance: async (addr) => {
        const data = await fetchJSON(
          `https://mempool.space/api/address/${addr}`,
          undefined,
          "bitcoinAddress",
        );
        return (
          (data.chain_stats.funded_txo_sum - data.chain_stats.spent_txo_sum) /
          1e8
        );
      },
      tokens: async () => [], // No ERC‑20 on BTC
    },
    eth: {
      label: "Ethereum",
      symbol: "ETH",
      icon: "⟠",
      coingeckoId: "ethereum",
      explorer: "https://etherscan.io/address/",
      balance: async (addr) => {
        const data = await fetchJSON(
          "https://cloudflare-eth.com",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "eth_getBalance",
              params: [addr, "latest"],
            }),
          },
          "jsonRpc",
        );
        return parseInt(data.result || "0x0", 16) / 1e18;
      },
      tokens: async (addr) => {
        const tokens = [
          {
            symbol: "USDC",
            address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
            decimals: 6,
            coingeckoId: "usd-coin",
          },
          {
            symbol: "USDT",
            address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
            decimals: 6,
            coingeckoId: "tether",
          },
          {
            symbol: "DAI",
            address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
            decimals: 18,
            coingeckoId: "dai",
          },
          {
            symbol: "LINK",
            address: "0x514910771AF9Ca656af840dff83E8264EcF986CA",
            decimals: 18,
            coingeckoId: "chainlink",
          },
        ];
        const results = [];
        for (const token of tokens) {
          try {
            const data = await fetchJSON(
              "https://cloudflare-eth.com",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  jsonrpc: "2.0",
                  id: 1,
                  method: "eth_call",
                  params: [
                    {
                      to: token.address,
                      data: "0x70a08231" + addr.slice(2).padStart(64, "0"),
                    },
                    "latest",
                  ],
                }),
              },
              "jsonRpc",
            );
            const balance =
              parseInt(data.result || "0x0", 16) / Math.pow(10, token.decimals);
            if (balance > 1e-9) {
              results.push({ ...token, balance });
            }
          } catch (e) {
            /* ignore */
          }
        }
        return results;
      },
    },
    bsc: {
      label: "BSC",
      symbol: "BNB",
      icon: "🟡",
      coingeckoId: "binancecoin",
      explorer: "https://bscscan.com/address/",
      balance: async (addr) => {
        const data = await fetchJSON(
          `https://api.bscscan.com/api?module=account&action=balance&address=${addr}&tag=latest`,
          undefined,
          "bscscan",
        );
        return parseInt(data.result || "0") / 1e18;
      },
      tokens: async (addr) => {
        const tokens = [
          {
            symbol: "USDC",
            address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
            decimals: 18,
            coingeckoId: "usd-coin",
          },
          {
            symbol: "USDT",
            address: "0x55d398326f99059fF775485246999027B3197955",
            decimals: 18,
            coingeckoId: "tether",
          },
          {
            symbol: "BUSD",
            address: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
            decimals: 18,
            coingeckoId: "binance-usd",
          },
        ];
        const results = [];
        for (const token of tokens) {
          try {
            const data = await fetchJSON(
              "https://bsc-dataseed.binance.org",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  jsonrpc: "2.0",
                  id: 1,
                  method: "eth_call",
                  params: [
                    {
                      to: token.address,
                      data: "0x70a08231" + addr.slice(2).padStart(64, "0"),
                    },
                    "latest",
                  ],
                }),
              },
              "jsonRpc",
            );
            const balance =
              parseInt(data.result || "0x0", 16) / Math.pow(10, token.decimals);
            if (balance > 1e-9) {
              results.push({ ...token, balance });
            }
          } catch (e) {
            /* ignore */
          }
        }
        return results;
      },
    },
    sol: {
      label: "Solana",
      symbol: "SOL",
      icon: "🟣",
      coingeckoId: "solana",
      explorer: "https://solscan.io/account/",
      balance: async (addr) => {
        const data = await fetchJSON(
          "https://api.mainnet-beta.solana.com",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "getBalance",
              params: [addr],
            }),
          },
          "jsonRpc",
        );
        return (data.result?.value || 0) / 1e9;
      },
      tokens: async (addr) => {
        const tokens = [
          {
            symbol: "USDC",
            mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            decimals: 6,
            coingeckoId: "usd-coin",
          },
          {
            symbol: "USDT",
            mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11Mc8wjjcPbW",
            decimals: 6,
            coingeckoId: "tether",
          },
        ];
        const results = [];
        for (const token of tokens) {
          try {
            const data = await fetchJSON(
              "https://api.mainnet-beta.solana.com",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  jsonrpc: "2.0",
                  id: 1,
                  method: "getTokenAccountsByOwner",
                  params: [
                    addr,
                    { mint: token.mint },
                    { encoding: "jsonParsed" },
                  ],
                }),
              },
              "jsonRpc",
            );
            let balance = 0;
            (data.result?.value || []).forEach((acc) => {
              const amount =
                acc.account?.data?.parsed?.info?.tokenAmount?.amount || "0";
              balance += parseInt(amount) / Math.pow(10, token.decimals);
            });
            if (balance > 1e-9) {
              results.push({ symbol: token.symbol, balance });
            }
          } catch (e) {
            /* ignore */
          }
        }
        return results;
      },
    },
  };

  // ── Secure Storage Helpers ────────────────────────────

  async function encryptWalletData(data, password) {
    if (!password) throw new Error("Password required for encryption");
    const plaintext = JSON.stringify(data);
    const encrypted = await W.sync.encrypt(plaintext, password);
    return encrypted;
  }

  async function decryptWalletData(encrypted, password) {
    if (!password) throw new Error("Password required for decryption");
    const { ciphertext, iv, salt } = encrypted;
    const plaintext = await W.sync.decrypt(
      new Uint8Array(ciphertext),
      password,
      new Uint8Array(iv),
      new Uint8Array(salt),
    );
    return JSON.parse(plaintext);
  }

  // ── State Management ──────────────────────────────────

  function getStoredData() {
    return W.store.get(STORAGE_KEY, null);
  }

  function saveStoredData(encrypted) {
    W.store.set(STORAGE_KEY, encrypted);
  }

  // ── Public API ─────────────────────────────────────────

  async function addWallet(chain, address, label, password) {
    if (!password) throw new Error("Sync password required to add wallet");
    if (!CHAINS[chain]) throw new Error(`Unsupported chain: ${chain}`);
    if (!validateAddress(chain, address)) {
      throw new Error(`Invalid address format for ${chain}`);
    }
    const encrypted = getStoredData();
    let wallets = [];
    if (encrypted) {
      try {
        wallets = await decryptWalletData(encrypted, password);
      } catch (e) {
        console.warn("[WalletSync] Decryption failed, treating as new data.");
      }
    }
    if (
      wallets.some(
        (w) =>
          w.chain === chain &&
          w.address.toLowerCase() === address.toLowerCase(),
      )
    ) {
      throw new Error("Wallet already added");
    }
    wallets.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      chain,
      address,
      label: label || `${chain.toUpperCase()} wallet`,
      addedAt: Date.now(),
    });
    const newEncrypted = await encryptWalletData(wallets, password);
    saveStoredData(newEncrypted);
    return true;
  }

  async function removeWallet(id, password) {
    if (!password) throw new Error("Sync password required");
    const encrypted = getStoredData();
    if (!encrypted) return false;
    const wallets = await decryptWalletData(encrypted, password);
    const filtered = wallets.filter((w) => w.id !== id);
    if (filtered.length === wallets.length) return false;
    const newEncrypted = await encryptWalletData(filtered, password);
    saveStoredData(newEncrypted);
    return true;
  }

  async function getWallets(password) {
    if (!password) throw new Error("Sync password required");
    const encrypted = getStoredData();
    if (!encrypted) return [];
    return decryptWalletData(encrypted, password);
  }

  async function syncAll(password) {
    if (!password) throw new Error("Sync password required");
    const wallets = await getWallets(password);
    if (!wallets.length) return { wallets: [], holdings: [], totalValue: 0 };

    const results = [];
    let totalValue = 0;

    for (const wallet of wallets) {
      const chain = CHAINS[wallet.chain];
      if (!chain) continue;
      try {
        const nativeBalance = await chain.balance(wallet.address);
        const tokenBalances = await chain.tokens(wallet.address);
        let price = 0;
        try {
          const data = await W.api.markets(chain.symbol.toLowerCase());
          const coin = data.find(
            (c) => c.symbol.toLowerCase() === chain.symbol.toLowerCase(),
          );
          price = coin?.current_price || 0;
        } catch (e) {}
        const nativeValue = nativeBalance * price;
        const tokenValues = tokenBalances.map((t) => {
          return { ...t, value: t.balance * 0 };
        });
        results.push({
          ...wallet,
          nativeBalance,
          tokenBalances,
          nativeValue,
          price,
          totalValue:
            nativeValue + tokenValues.reduce((sum, t) => sum + t.value, 0),
        });
        totalValue +=
          nativeValue + tokenValues.reduce((sum, t) => sum + t.value, 0);
      } catch (e) {
        console.warn(
          `[WalletSync] Sync failed for ${wallet.chain}:${wallet.address}`,
          e,
        );
        results.push({ ...wallet, error: e.message });
      }
    }

    W.store.set(CACHE_KEY, { data: results, timestamp: Date.now() });

    return { wallets: results, holdings: results, totalValue };
  }

  function getCached() {
    const cache = W.store.get(CACHE_KEY, null);
    if (!cache) return null;
    if (Date.now() - cache.timestamp > CACHE_TTL) return null;
    return cache.data;
  }

  async function clearAll(password) {
    if (!password) throw new Error("Sync password required");
    const encrypted = getStoredData();
    if (encrypted) {
      await decryptWalletData(encrypted, password);
    }
    W.store.delete(STORAGE_KEY);
    W.store.delete(CACHE_KEY);
  }

  // ── Address Validation ─────────────────────────────────

  function validateAddress(chain, address) {
    switch (chain) {
      case "btc":
        return (
          /^[13][a-zA-Z0-9]{25,34}$/.test(address) ||
          /^bc1[a-zA-Z0-9]{25,90}$/.test(address)
        );
      case "eth":
      case "bsc":
        return /^0x[a-fA-F0-9]{40}$/i.test(address);
      case "sol":
        return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
      default:
        return false;
    }
  }

  // ── Portfolio-shaped holdings ─────────────────────────
  //
  // The dashboard's enrich() merges manual holdings and wallet
  // holdings into one array, then looks up each by `coinId` for
  // market prices. This transform converts the raw sync results
  // (native balance + token balances per wallet) into that shape.
  //
  // Native coins get a proper CoinGecko ID from CHAINS[chain].coingeckoId,
  // so prices resolve. ERC-20/SPL tokens carry a coingeckoId when the
  // hardcoded token list provides one; otherwise they fall back to
  // symbol-only lookup which may not resolve.
  function toPortfolioHoldings() {
    const cache = W.store.get(CACHE_KEY, null);
    if (!cache || !Array.isArray(cache.data)) return [];
    const out = [];
    for (const w of cache.data) {
      if (!w || w.error) continue;
      const chain = CHAINS[w.chain];
      if (!chain) continue;

      // Native balance
      if (Number.isFinite(w.nativeBalance) && w.nativeBalance > 0) {
        out.push({
          coinId: chain.coingeckoId || null,
          symbol: String(chain.symbol || w.chain).toUpperCase(),
          name: chain.label || w.chain,
          qty: w.nativeBalance,
          buyPrice: 0,
          img: "",
          wallet: true,
          walletChain: w.chain,
          walletLabel: w.label || null,
        });
      }

      // Token balances
      for (const t of w.tokenBalances || []) {
        if (!t || !Number.isFinite(t.balance) || t.balance <= 0) continue;
        out.push({
          coinId: t.coingeckoId || null,
          symbol: String(t.symbol || "?").toUpperCase(),
          name: String(t.symbol || "Token"),
          qty: t.balance,
          buyPrice: 0,
          img: "",
          wallet: true,
          walletChain: w.chain,
          walletLabel: w.label || null,
        });
      }
    }
    return out;
  }

  // ── UI Render ──────────────────────────────────────────

  async function render(view) {
    view.innerHTML = `
      <div class="card">
        <h3>🔐 Wallet Sync</h3>
        <p class="muted small">All wallet data is encrypted with your sync password. Native balances and a small set of well-known tokens are tracked per chain.</p>
        <div class="qa mt">
          <button class="btn primary" id="ws-add">+ Add Wallet</button>
          <button class="btn" id="ws-sync">🔄 Sync Now</button>
          <button class="btn danger" id="ws-clear">🗑️ Clear All</button>
        </div>
        <div id="ws-status" class="mt"></div>
        <div id="ws-list"></div>
      </div>
    `;

    view.querySelector("#ws-add").onclick = () => addWalletModal(view);
    view.querySelector("#ws-sync").onclick = () => syncAndDisplay(view);
    view.querySelector("#ws-clear").onclick = () => {
      W.ui.confirm(
        "This will permanently delete all synced wallet data. Continue?",
        async () => {
          const pwd = await W.ui.promptPassword({
            title: "Clear Wallet Data",
            message: "Enter your sync password to confirm.",
            confirmLabel: "Clear",
          });
          if (!pwd) return;
          try {
            await clearAll(pwd);
            W.ui.toast("All wallet data cleared.", "ok");
            render(view);
          } catch (e) {
            W.ui.toast(e.message, "warn");
          }
        },
      );
    };

    const cached = getCached();
    if (cached) {
      displayWallets(view, cached);
    } else {
      view.querySelector("#ws-status").innerHTML =
        '<p class="muted">No cached data. Click "Sync Now" to fetch.</p>';
    }
  }

  async function syncAndDisplay(view) {
    const pwd = await W.ui.promptPassword({
      title: "Sync Wallets",
      message: "Enter your sync password.",
      confirmLabel: "Sync",
    });
    if (!pwd) return;
    try {
      view.querySelector("#ws-status").innerHTML = W.ui.spinner();
      const result = await syncAll(pwd);
      displayWallets(view, result.wallets);
      view.querySelector("#ws-status").innerHTML =
        `<p class="up">✅ Synced at ${new Date().toLocaleTimeString()}</p>`;
    } catch (e) {
      view.querySelector("#ws-status").innerHTML =
        `<p class="down">❌ ${e.message}</p>`;
    }
  }

  function displayWallets(view, wallets) {
    const container = view.querySelector("#ws-list");
    if (!container) return;
    if (!wallets || !wallets.length) {
      container.innerHTML =
        '<p class="muted">No wallets added. Click "+ Add Wallet" to start.</p>';
      return;
    }
    container.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Chain</th>
              <th>Label</th>
              <th>Address</th>
              <th>Balance</th>
              <th>Value (USD)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${wallets
              .map(
                (w) => `
              <tr>
                <td>${CHAINS[w.chain]?.icon || "⛓️"} ${w.chain.toUpperCase()}</td>
                <td>${W.fmt.escapeHTML(w.label || "—")}</td>
                <td><code title="${W.fmt.escapeHTML(w.address)}">${W.fmt.escapeHTML(w.address.slice(0, 6) + "…" + w.address.slice(-4))}</code></td>
                <td>${w.error ? '<span class="down">error</span>' : Number.isFinite(w.nativeBalance) ? `${w.nativeBalance.toFixed(4)} ${CHAINS[w.chain]?.symbol || ""}` : "—"}</td>
                <td>${w.nativeValue ? W.fmt.money(w.nativeValue, { compact: true }) : "—"}</td>
                <td><button class="icon-btn" data-remove="${W.fmt.escapeHTML(w.id)}">✕</button></td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
    container.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.onclick = async () => {
        const pwd = await W.ui.promptPassword({
          title: "Remove Wallet",
          message: "Enter your sync password to confirm removal.",
          confirmLabel: "Remove",
        });
        if (!pwd) return;
        try {
          await removeWallet(btn.dataset.remove, pwd);
          W.ui.toast("Wallet removed.", "ok");
          syncAndDisplay(view);
        } catch (e) {
          W.ui.toast(e.message, "warn");
        }
      };
    });
  }

  function addWalletModal(view) {
    const m = W.ui.modal({
      title: "Add Wallet to Sync",
      body: `
        <label>Chain
          <select id="ws-chain">
            ${Object.keys(CHAINS)
              .map((c) => `<option value="${c}">${CHAINS[c].label}</option>`)
              .join("")}
          </select>
        </label>
        <label>Label
          <input id="ws-label" placeholder="e.g. My main wallet">
        </label>
        <label>Address
          <input id="ws-address" placeholder="Enter wallet address">
        </label>
        <label>Sync Password
          <input type="password" id="ws-password" placeholder="Your Weaver sync password">
        </label>
        <p class="muted small">Your wallet addresses are encrypted with your sync password.</p>
      `,
      footer: `
        <button class="btn ghost" id="ws-cancel">Cancel</button>
        <button class="btn primary" id="ws-save">Add Wallet</button>
      `,
    });

    m.el.querySelector("#ws-cancel").onclick = m.close;
    m.el.querySelector("#ws-save").onclick = async () => {
      const chain = m.el.querySelector("#ws-chain").value;
      const label =
        m.el.querySelector("#ws-label").value.trim() ||
        `${chain.toUpperCase()} Wallet`;
      const address = m.el.querySelector("#ws-address").value.trim();
      const password = m.el.querySelector("#ws-password").value;
      if (!password) return W.ui.toast("Sync password is required.", "warn");
      try {
        await addWallet(chain, address, label, password);
        m.close();
        W.ui.toast("Wallet added and encrypted.", "ok");
        const targetView = view || document.getElementById("view");
        if (targetView) render(targetView);
      } catch (e) {
        W.ui.toast(e.message, "warn");
      }
    };
  }

  // ── Exports ────────────────────────────────────────────
  return {
    addWallet,
    removeWallet,
    getWallets,
    syncAll,
    getCached,
    clearAll,
    render,
    addWalletModal,
    refresh: syncAll,
    holdings: toPortfolioHoldings,
    wallets: getWallets,
  };
})();

console.log("[WalletSync] Module loaded (secure).");
