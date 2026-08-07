window.W = window.W || {};

W.web3 = (() => {
  async function render(view) {
    view.innerHTML = `
      <div class="grid-2">
        <div class="card"><h3>🦊 MetaMask (EVM chains)</h3>
          <div id="mm-status" class="muted">Not connected</div>
          <button class="btn primary mt" id="mm-connect">Connect MetaMask</button>
          <div id="mm-info" class="mt"></div>
        </div>
        <div class="card"><h3>👻 Phantom (Solana)</h3>
          <div id="ph-status" class="muted">Not connected</div>
          <button class="btn primary mt" id="ph-connect">Connect Phantom</button>
          <div id="ph-info" class="mt"></div>
        </div>
      </div>
      <div class="card"><h3>🖼️ NFT Viewer</h3><p class="muted">Connect a wallet above. Full NFT gallery (OpenSea / Alchemy APIs) and multi-chain balance sync ship with <b>Weaver Pro</b>. 🔒</p></div>
      <div class="card"><h3>🔗 WalletConnect</h3><p class="muted">QR-based multi-wallet connection is on the roadmap (requires WalletConnect SDK + project ID).</p></div>`;

    view.querySelector("#mm-connect").onclick = async () => {
      if (!window.ethereum)
        return W.ui.toast("MetaMask not found — install the extension", "warn");
      try {
        const accounts = await window.ethereum.request({
          method: "eth_requestAccounts",
        });
        const chainId = await window.ethereum.request({
          method: "eth_chainId",
        });
        const balHex = await window.ethereum.request({
          method: "eth_getBalance",
          params: [accounts[0], "latest"],
        });
        const eth = parseInt(balHex, 16) / 1e18;
        W.store.set("wallet-connected", true);
        if (W.achievements) W.achievements.check();
        view.querySelector("#mm-status").innerHTML =
          '<span class="tag live">Connected</span>';
        view.querySelector("#mm-info").innerHTML = `
          <div class="kv-row"><span class="muted">Address</span><code>${W.fmt.addr(accounts[0])}</code></div>
          <div class="kv-row"><span class="muted">Balance</span><b>${eth.toFixed(4)} ETH</b></div>
          <div class="kv-row"><span class="muted">Chain ID</span>${parseInt(chainId, 16)}</div>`;
      } catch (e) {
        W.ui.toast("Connection rejected", "warn");
      }
    };

    view.querySelector("#ph-connect").onclick = async () => {
      const ph = window.phantom?.solana;
      if (!ph)
        return W.ui.toast("Phantom not found — install the extension", "warn");
      try {
        const res = await ph.connect();
        W.store.set("wallet-connected", true);
        if (W.achievements) W.achievements.check();
        view.querySelector("#ph-status").innerHTML =
          '<span class="tag live">Connected</span>';
        view.querySelector("#ph-info").innerHTML =
          `<div class="kv-row"><span class="muted">Address</span><code>${W.fmt.addr(res.publicKey.toString())}</code></div>`;
      } catch (e) {
        W.ui.toast("Connection rejected", "warn");
      }
    };
  }
  return { render };
})();
