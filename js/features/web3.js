window.W = window.W || {};

W.web3 = (() => {
  let viewRef = null;
  const state = () => W.store.get("wallets", {});
  const save = (w) => W.store.set("wallets", w);
  const short = (a) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "");

  async function balances(w) {
    const out = {};
    if (w.evm) {
      try {
        const r = await fetch("https://cloudflare-eth.com", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "eth_getBalance",
            params: [w.evm, "latest"],
          }),
        });
        const d = await r.json();
        out.evm = parseInt(d.result || "0x0", 16) / 1e18;
      } catch (e) {
        out.evm = null;
      }
    }
    if (w.sol) {
      try {
        const r = await fetch("https://api.mainnet-beta.solana.com", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getBalance",
            params: [w.sol],
          }),
        });
        const d = await r.json();
        out.sol = ((d.result || {}).value || 0) / 1e9;
      } catch (e) {
        out.sol = null;
      }
    }
    return out;
  }

  async function render(view) {
    viewRef = view;
    const w = state();
    const bal = await balances(w);
    view.innerHTML = `
      <div class="grid-2">
        <div class="card"><h3>🦊 MetaMask (EVM chains)</h3>
          ${
            w.evm
              ? `<span class="tag buy">CONNECTED</span>
            <div class="kv-row"><span class="muted">Address</span><code>${short(w.evm)}</code></div>
            <div class="kv-row"><span class="muted">Balance</span><b>${bal.evm == null ? "—" : bal.evm.toFixed(4) + " ETH"}</b></div>
            <div class="kv-row"><span class="muted">Chain ID</span>1</div>
            <button class="btn danger tiny mt" id="w-dis-evm">🔌 Disconnect</button>`
              : `<p class="muted">Not connected</p><button class="btn primary" id="w-mm">Connect MetaMask</button>`
          }
        </div>
        <div class="card"><h3>👻 Phantom (Solana)</h3>
          ${
            w.sol
              ? `<span class="tag buy">CONNECTED</span>
            <div class="kv-row"><span class="muted">Address</span><code>${short(w.sol)}</code></div>
            <div class="kv-row"><span class="muted">Balance</span><b>${bal.sol == null ? "—" : bal.sol.toFixed(3) + " SOL"}</b></div>
            <button class="btn danger tiny mt" id="w-dis-sol">🔌 Disconnect</button>`
              : `<p class="muted">Not connected</p><button class="btn primary" id="w-ph">Connect Phantom</button>`
          }
        </div>
      </div>
      <div class="card"><h3>🖼️ NFT Viewer</h3><p class="muted small">Connect a wallet above. Full NFT gallery (OpenSea / Alchemy APIs) and multi-chain balance sync ship with Weaver Pro. 🔒</p></div>
      <div class="card"><h3>🔗 WalletConnect</h3><p class="muted small">QR-based multi-wallet connection is on the roadmap (requires WalletConnect SDK + project ID).</p></div>`;
    const mm = view.querySelector("#w-mm");
    if (mm) mm.onclick = connectMM;
    const ph = view.querySelector("#w-ph");
    if (ph) ph.onclick = connectPh;
    const de = view.querySelector("#w-dis-evm");
    if (de) de.onclick = () => disconnect("evm");
    const ds = view.querySelector("#w-dis-sol");
    if (ds) ds.onclick = () => disconnect("sol");
  }

  async function connectMM() {
    if (!window.ethereum)
      return W.ui.toast(
        "MetaMask not detected — install the extension first",
        "warn",
      );
    try {
      const accs = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      const w = state();
      w.evm = accs[0];
      save(w);
      W.ui.toast("MetaMask connected 🦊", "ok");
      render(viewRef);
    } catch (e) {
      W.ui.toast("MetaMask: " + (e.message || "rejected"), "warn");
    }
  }
  async function connectPh() {
    const ph = window.phantom && window.phantom.solana;
    if (!ph)
      return W.ui.toast(
        "Phantom not detected — install the extension first",
        "warn",
      );
    try {
      const r = await ph.connect();
      const w = state();
      w.sol = r.publicKey.toString();
      save(w);
      W.ui.toast("Phantom connected 👻", "ok");
      render(viewRef);
    } catch (e) {
      W.ui.toast("Phantom: " + (e.message || "rejected"), "warn");
    }
  }
  function disconnect(kind) {
    const w = state();
    delete w[kind];
    save(w);
    if (kind === "sol" && window.phantom && window.phantom.solana) {
      try {
        window.phantom.solana.disconnect();
      } catch (e) {}
    }
    W.ui.toast("Wallet disconnected 👋", "info");
    render(viewRef);
  }

  return { render, connectMM, connectPh, disconnect };
})();
