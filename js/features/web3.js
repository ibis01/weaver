// ===============================================================
//         Secure Web3 Wallet Connector (Privacy & Security)
// ===============================================================
//
// Purpose: Observe wallets and securely request actions.
// Security: Enforces Section 13 (Mandatory Preview) &
//           Section 14 (Wallet Privacy / No logging raw addresses).
//
// ===============================================================

window.W = window.W || {};
W.web3 = W.web3 || {};

(function () {
  const CHAINS = {
    1: { name: "Ethereum", symbol: "ETH", explorer: "https://etherscan.io" },
    56: { name: "BSC", symbol: "BNB", explorer: "https://bscscan.com" },
    137: {
      name: "Polygon",
      symbol: "MATIC",
      explorer: "https://polygonscan.com",
    },
    42161: { name: "Arbitrum", symbol: "ARB", explorer: "https://arbiscan.io" },
    43114: {
      name: "Avalanche",
      symbol: "AVAX",
      explorer: "https://snowtrace.io",
    },
    10: {
      name: "Optimism",
      symbol: "OP",
      explorer: "https://optimistic.etherscan.io",
    },
  };

  let state = W.store.get("web3_state", { evm: null, sol: null });
  function saveState() {
    W.store.set("web3_state", state);
  }

  // ── Validate Address ──────────────────────────────────
  function validateAddress(address, chain) {
    if (chain === "sol") {
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address))
        throw new Error("Invalid Solana address");
      return address;
    }
    if (!/^0x[a-fA-F0-9]{40}$/i.test(address))
      throw new Error("Invalid EVM address");
    return address;
  }

  // ── Get Balances (Read-Only) ──────────────────────────
  async function getEVMBalance(address) {
    if (!window.ethereum) return null;
    try {
      const balanceHex = await window.ethereum.request({
        method: "eth_getBalance",
        params: [address, "latest"],
      });
      return parseInt(balanceHex, 16) / 1e18;
    } catch (error) {
      console.error("[Web3] EVM balance error"); // SAFE: No raw address logged
      return null;
    }
  }

  async function getSolBalance(address) {
    const phantom = window.phantom?.solana;
    if (!phantom) return null;
    try {
      if (typeof phantom.getBalance === "function")
        return (await phantom.getBalance()) / 1e9;
      const response = await fetch("https://api.mainnet-beta.solana.com", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getBalance",
          params: [address],
        }),
      });
      const data = await response.json();
      return data.result?.value !== undefined ? data.result.value / 1e9 : null;
    } catch (error) {
      console.error("[Web3] Solana balance error"); // SAFE: No raw address logged
      return null;
    }
  }

  // ── Chain Switching ───────────────────────────────────
  async function switchChain(chainId) {
    if (!window.ethereum) {
      W.ui?.toast?.("MetaMask not available", "warn");
      return false;
    }
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${chainId.toString(16)}` }],
      });
      state.evm = state.evm || {};
      state.evm.chainId = chainId;
      saveState();
      W.ui?.toast?.(`Switched to ${CHAINS[chainId]?.name || chainId}`, "ok");
      return true;
    } catch (error) {
      W.ui?.toast?.(`Switch chain failed`, "warn");
      return false;
    }
  }

  // ── SECTION 13: SECURE ACTION REQUEST WRAPPER ─────────
  function requestSecureAction(actionType, params, preview) {
    return new Promise((resolve, reject) => {
      if (!window.ethereum) {
        reject(new Error("No EVM wallet detected"));
        return;
      }

      const modal = document.createElement("div");
      modal.style.cssText =
        "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);";

      const card = document.createElement("div");
      card.style.cssText =
        "background:var(--bg-card, #161b22);padding:24px;border-radius:12px;max-width:420px;width:90%;color:var(--text, #e6edf3);border:1px solid var(--border, #30363d);box-shadow:0 10px 30px rgba(0,0,0,0.5);";

      const title = document.createElement("h3");
      title.style.marginTop = "0";
      title.textContent = `Confirm ${preview.action || "Action"}`;
      card.appendChild(title);

      const addRow = (label, value) => {
        if (value === null || value === undefined) return;
        const row = document.createElement("p");
        row.style.margin = "8px 0";
        row.style.fontSize = "0.9em";
        const b = document.createElement("b");
        b.textContent = `${label}: `;
        b.style.color = "#8b949e";
        const span = document.createElement("span");
        span.textContent = value; // SAFE: textContent prevents XSS (Section 15)
        row.appendChild(b);
        row.appendChild(span);
        card.appendChild(row);
      };

      // SAFE: Use maskAddress for UI display (Section 14)
      addRow("Chain", preview.chain);
      addRow("Wallet", W.fmt.maskAddress(preview.wallet));
      addRow("To", W.fmt.maskAddress(preview.destination));
      addRow("Assets", preview.assets);

      if (preview.consequences) {
        const cons = document.createElement("p");
        cons.style.marginTop = "16px";
        cons.style.fontSize = "0.8em";
        cons.style.color = "#f85149";
        cons.textContent = `⚠️ ${preview.consequences}`;
        card.appendChild(cons);
      }

      const btnContainer = document.createElement("div");
      btnContainer.style.cssText = "display:flex;gap:12px;margin-top:24px;";

      const cancelBtn = document.createElement("button");
      cancelBtn.textContent = "Cancel";
      cancelBtn.className = "btn";
      cancelBtn.onclick = () => {
        document.body.removeChild(modal);
        reject(new Error("User cancelled action"));
      };

      const confirmBtn = document.createElement("button");
      confirmBtn.textContent = "Confirm in Wallet";
      confirmBtn.className = "btn primary";
      confirmBtn.onclick = async () => {
        confirmBtn.disabled = true;
        confirmBtn.textContent = "Waiting for wallet...";
        try {
          let method =
            actionType === "sign_typed_data"
              ? "eth_signTypedData_v4"
              : "eth_sendTransaction";
          const result = await window.ethereum.request({ method, params });
          document.body.removeChild(modal);
          resolve(result);
        } catch (e) {
          document.body.removeChild(modal);
          reject(e);
        }
      };

      btnContainer.appendChild(cancelBtn);
      btnContainer.appendChild(confirmBtn);
      card.appendChild(btnContainer);
      modal.appendChild(card);
      document.body.appendChild(modal);
    });
  }

  // ── Setup EIP-1193 Wallet Listeners ───────────────────
  function setupWalletListeners() {
    if (!window.ethereum) return;

    // Listen for account changes (e.g., user switches or disconnects in wallet)
    window.ethereum.on("accountsChanged", (accounts) => {
      if (accounts.length === 0) {
        // User disconnected from the wallet side
        disconnectWallet();
      } else {
        // User switched to a different account in the wallet
        state.evm = { address: accounts[0] };
        saveState();
        render(document.getElementById("view"));
        W.ui?.toast?.("Wallet account updated", "info");
      }
    });

    // Listen for chain changes (EIP-1193 best practice: reload on chain change)
    window.ethereum.on("chainChanged", () => {
      window.location.reload();
    });
  }

  // ── Connect Wallet (EIP-1193) ────────────────────────
  async function connectWallet() {
    if (!window.ethereum) {
      W.ui?.toast?.("No EVM wallet detected (e.g., MetaMask)", "warn");
      return;
    }
    try {
      // eth_requestAccounts forces the wallet to show the account selection/approval UI
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });

      if (accounts && accounts.length > 0) {
        state.evm = { address: accounts[0] };
        saveState();
        setupWalletListeners(); // Ensure listeners are active
        W.ui?.toast?.("Wallet connected securely", "ok");
        render(document.getElementById("view"));
      }
    } catch (error) {
      console.error("[Web3] Connection error:", error);
      W.ui?.toast?.("Connection rejected or failed", "warn");
    }
  }

  // ── Disconnect Wallet ────────────────────────────────
  function disconnectWallet() {
    state.evm = null;
    saveState();
    W.ui?.toast?.("Wallet disconnected", "ok");
    render(document.getElementById("view"));
  }

  // ── Render UI (Privacy-First) ────────────────────────
  function render(view) {
    const connectedAddress = state.evm?.address || null;
    const displayAddress = connectedAddress
      ? W.fmt.maskAddress(connectedAddress)
      : "Not connected";

    view.innerHTML = `
      <div class="card">
        <h3>🌐 Web3 Wallets</h3>
        <p class="muted small">Connect your wallet to view on-chain balances. Weaver is read-only by default.</p>
        <div id="wallet-status" class="mt" style="display:flex; align-items:center; gap:10px; flex-wrap: wrap;">
          ${
            connectedAddress
              ? `
                <span class="muted" id="address-display" style="cursor:pointer; font-family:monospace; font-size:1.1em;">${displayAddress}</span>
                <span class="muted small" style="font-size:0.8em;">(Click to copy)</span>
                <button class="btn tiny warn" id="btn-disconnect" style="margin-left: auto;">Disconnect</button>
                `
              : `<button class="btn primary" id="btn-connect">Connect Wallet</button>`
          }
        </div>
      </div>
      <div class="card mt">
        <h3>🔐 Security & Privacy</h3>
        <ul class="tx-list" style="list-style:none;padding:0;">
          <li>✅ All wallet interactions require explicit UI preview.</li>
          <li>✅ Weaver never stores your private keys or seed phrases.</li>
          <li>✅ Wallet addresses are masked in the UI to prevent shoulder surfing.</li>
          <li>✅ Raw addresses are never logged to the console or analytics.</li>
          <li>✅ EIP-712 typed data signing preferred over blind signing.</li>
        </ul>
      </div>
    `;

    // ── Event Listeners ──────────────────────────────────
    const connectBtn = view.querySelector("#btn-connect");
    if (connectBtn) {
      connectBtn.onclick = connectWallet;
    }

    const disconnectBtn = view.querySelector("#btn-disconnect");
    if (disconnectBtn) {
      disconnectBtn.onclick = disconnectWallet;
    }

    // ── Click-to-Copy Logic (Section 14) ────────────────
    if (connectedAddress) {
      const addrEl = view.querySelector("#address-display");
      if (addrEl) {
        addrEl.onclick = async () => {
          try {
            await navigator.clipboard.writeText(connectedAddress);
            W.ui.toast("Full address copied to clipboard", "ok");
          } catch (e) {
            W.ui.toast("Failed to copy address", "warn");
          }
        };
      }
    }
  }
  // ── Exports ───────────────────────────────────────────
  W.web3 = {
    validateAddress,
    getEVMBalance,
    getSolBalance,
    switchChain,
    requestSecureAction,
    connectWallet,
    render,
  };
})();

console.log("[Web3] Module loaded (secure & private).");
