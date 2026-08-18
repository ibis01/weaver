// ================================================================
// js/features/shield.js – Token Shield (Contract Security Auditor)
// ================================================================

window.W = window.W || {};

W.shield = (() => {
  // ── Constants ─────────────────────────────────────────
  const GOPLUS_API = "https://api.gopluslabs.io/api/v1/token_security";
  const CACHE_TTL = 300000; // 5 minutes

  const CHAINS = {
    ethereum: { id: "1", name: "Ethereum", icon: "⟠" },
    bsc: { id: "56", name: "BSC", icon: "🟡" },
    base: { id: "8453", name: "Base", icon: "🔵" },
    arbitrum: { id: "42161", name: "Arbitrum", icon: "🔷" },
    polygon: { id: "137", name: "Polygon", icon: "🟣" },
    avalanche: { id: "43114", name: "Avalanche", icon: "❄️" },
    optimism: { id: "10", name: "Optimism", icon: "🔴" },
    fantom: { id: "250", name: "Fantom", icon: "🔷" },
    cronos: { id: "25", name: "Cronos", icon: "🟢" },
    gnosis: { id: "100", name: "Gnosis", icon: "🟣" },
  };

  // ── Helpers ────────────────────────────────────────────

  function escapeHTML(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function shortAddr(addr) {
    if (!addr) return "—";
    return addr.slice(0, 6) + "…" + addr.slice(-4);
  }

  function formatPercent(val) {
    const num = parseFloat(val);
    if (isNaN(num)) return "—";
    return num.toFixed(2) + "%";
  }

  // ── Cache ──────────────────────────────────────────────

  function getCacheKey(chainId, address) {
    return `shield_${chainId}_${address.toLowerCase()}`;
  }

  function getCached(chainId, address) {
    const key = getCacheKey(chainId, address);
    const cached = W.store.get(key, null);
    if (!cached) return null;
    if (Date.now() - cached.timestamp > CACHE_TTL) {
      W.store.delete(key);
      return null;
    }
    return cached.data;
  }

  function setCache(chainId, address, data) {
    const key = getCacheKey(chainId, address);
    W.store.set(key, { data, timestamp: Date.now() });
  }

  // ── Validate Address ──────────────────────────────────

  function isValidAddress(address, chain) {
    if (!address || typeof address !== "string") return false;
    // EVM addresses: 0x + 40 hex chars
    if (chain !== "solana") {
      return /^0x[a-fA-F0-9]{40}$/i.test(address);
    }
    // Solana: base58
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  }

  // ── Fetch from GoPlus ─────────────────────────────────

  async function fetchTokenSecurity(chainId, address) {
    // Check cache first
    const cached = getCached(chainId, address);
    if (cached) return cached;

    const url = `${GOPLUS_API}/${chainId}?contract_addresses=${address.toLowerCase()}`;

    // Use proxy fallbacks
    const proxies = [
      (u) => u,
      (u) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
      (u) => "https://corsproxy.io/?url=" + encodeURIComponent(u),
      (u) => "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(u),
    ];

    let lastError = null;
    for (const proxy of proxies) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(proxy(url), {
          signal: controller.signal,
          headers: { "User-Agent": "WeaverBot/1.0" },
        });
        clearTimeout(timeout);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (data.code !== 1) {
          throw new Error(data.message || "API error");
        }
        // Cache and return
        setCache(chainId, address, data);
        return data;
      } catch (e) {
        lastError = e;
        console.warn("[Shield] Proxy failed:", e.message);
      }
    }
    throw lastError || new Error("All proxies failed");
  }

  // ── Parse and Render Results ──────────────────────────

  function renderResults(data, address, chainKey) {
    const chain = CHAINS[chainKey];
    const result = data.result && data.result[address.toLowerCase()];
    if (!result) {
      return `
        <div class="card">
          ${W.ui.empty("🛡️", "No data found", "Token might be too new or not a standard ERC-20/BEP-20 on this chain.")}
        </div>
      `;
    }

    // ── Extract flags ──────────────────────────────────
    const isHoneypot = result.is_honeypot === "1";
    const isMintable = result.is_mintable === "1";
    const isProxy = result.is_proxy === "1";
    const isOwnerRenounced =
      result.owner_change === "1" ||
      result.owner === "0x0000000000000000000000000000000000000000";
    const isLpLocked = (result.lp_holders || []).some(
      (lp) => lp.is_locked === 1,
    );

    const buyTax = (parseFloat(result.buy_tax) * 100).toFixed(1);
    const sellTax = (parseFloat(result.sell_tax) * 100).toFixed(1);
    const holderCount = result.holder_count || 0;
    const totalSupply = result.total_supply
      ? parseFloat(result.total_supply).toLocaleString(undefined, {
          maximumFractionDigits: 0,
        })
      : "Unknown";

    // ── Risk scoring ──────────────────────────────────
    let riskScore = 0;
    const risks = [];

    if (isHoneypot) {
      riskScore += 50;
      risks.push("🚨 Honeypot (cannot sell)");
    }
    if (isMintable) {
      riskScore += 20;
      risks.push("⚠️ Mintable (infinite supply)");
    }
    if (isProxy) {
      riskScore += 15;
      risks.push("⚠️ Proxy contract (hidden logic)");
    }
    if (!isLpLocked) {
      riskScore += 15;
      risks.push("⚠️ Liquidity not locked");
    }
    if (parseFloat(buyTax) > 5) {
      riskScore += 10;
      risks.push(`⚠️ High buy tax (${buyTax}%)`);
    }
    if (parseFloat(sellTax) > 5) {
      riskScore += 10;
      risks.push(`⚠️ High sell tax (${sellTax}%)`);
    }
    if (!isOwnerRenounced) {
      riskScore += 5;
      risks.push("⚠️ Owner not renounced");
    }

    const riskLevel =
      riskScore >= 40
        ? ["🚨 EXTREME RUG RISK", "sell"]
        : riskScore >= 20
          ? ["⚠️ CAUTION", "triggered"]
          : ["✅ LOOKS SAFE", "buy"];

    // ── Top holders ──────────────────────────────────
    const topHolders = (result.holders || []).slice(0, 5);
    const lpHolders = (result.lp_holders || []).slice(0, 3);

    // ── Build HTML ──────────────────────────────────
    return `
      <div class="card" style="border-color: ${riskScore >= 40 ? "var(--down)" : riskScore >= 20 ? "var(--warn)" : "var(--up)"}; box-shadow: 0 0 40px ${riskScore >= 40 ? "rgba(255,92,122,.2)" : "transparent"};">
        <div class="watch-head">
          <div>
            <h2>${escapeHTML(result.token_name || "Unknown")} <span class="muted">${escapeHTML(result.token_symbol || "")}</span></h2>
            <p class="muted small">${chain.icon} ${chain.name} · ${holderCount} Holders · Supply: ${totalSupply}</p>
          </div>
          <div style="text-align:right;">
            <span class="tag ${riskLevel[1]}" style="font-size:14px;padding:8px 16px;">${riskLevel[0]}</span>
            <div class="muted small">Risk Score: ${riskScore}/100</div>
          </div>
        </div>
        ${
          risks.length
            ? `
          <div class="mt">
            ${risks.map((r) => `<span class="tag ${r.includes("Honeypot") ? "sell" : "triggered"}">${r}</span>`).join(" ")}
          </div>
        `
            : ""
        }
      </div>

      <div class="grid-2">
        <div class="card">
          <h3>🚨 Red Flags</h3>
          <div class="kv-row"><span>Honeypot (Cannot Sell)</span> <b class="${isHoneypot ? "down" : "up"}">${isHoneypot ? "YES 🚨" : "NO ✅"}</b></div>
          <div class="kv-row"><span>Mintable (Infinite Supply)</span> <b class="${isMintable ? "down" : "up"}">${isMintable ? "YES ⚠️" : "NO ✅"}</b></div>
          <div class="kv-row"><span>Proxy Contract (Hidden Logic)</span> <b class="${isProxy ? "down" : "up"}">${isProxy ? "YES ⚠️" : "NO ✅"}</b></div>
          <div class="kv-row"><span>Owner Renounced</span> <b class="${isOwnerRenounced ? "up" : "down"}">${isOwnerRenounced ? "YES ✅" : "NO ⚠️"}</b></div>
          <div class="kv-row"><span>Liquidity Locked</span> <b class="${isLpLocked ? "up" : "down"}">${isLpLocked ? "YES ✅" : "NO 🚨"}</b></div>
        </div>
        <div class="card">
          <h3>💰 Taxes & Fees</h3>
          <div class="kv-row"><span>Buy Tax</span> <b style="color: ${parseFloat(buyTax) > 5 ? "var(--down)" : "var(--up)"};">${buyTax}%</b></div>
          <div class="kv-row"><span>Sell Tax</span> <b style="color: ${parseFloat(sellTax) > 5 ? "var(--down)" : "var(--up)"};">${sellTax}%</b></div>
          <div class="meter-label mt">Tax Severity</div>
          <div class="meter-bar">
            <div style="width: ${Math.min(100, (parseFloat(buyTax) + parseFloat(sellTax)) * 2)}%; background: ${Math.max(parseFloat(buyTax), parseFloat(sellTax)) > 5 ? "var(--down)" : "var(--up)"};"></div>
          </div>
          <p class="muted small mt">Taxes > 5% are often used to drain buyer funds. 0/0 is ideal.</p>
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <h3>🐋 Top Holders</h3>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Address</th><th>Tag</th><th>Supply %</th><th>Status</th></tr></thead>
              <tbody>
                ${topHolders
                  .map(
                    (h) => `
                  <tr>
                    <td><code>${shortAddr(h.address)}</code></td>
                    <td>${h.tag ? `<span class="tag rank">${escapeHTML(h.tag)}</span>` : '<span class="muted">—</span>'}</td>
                    <td><b>${(parseFloat(h.percent) * 100).toFixed(2)}%</b></td>
                    <td>${h.is_contract === 1 ? '<span class="tag">Contract</span>' : h.is_locked === 1 ? '<span class="tag buy">Locked</span>' : '<span class="tag neutral">Wallet</span>'}</td>
                  </tr>
                `,
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        </div>
        <div class="card">
          <h3>🔄 LP Holders</h3>
          ${
            lpHolders.length
              ? `
            <div class="table-wrap">
              <table>
                <thead><tr><th>Address</th><th>LP Share</th><th>Locked</th></tr></thead>
                <tbody>
                  ${lpHolders
                    .map(
                      (lp) => `
                    <tr>
                      <td><code>${shortAddr(lp.address)}</code></td>
                      <td>${(parseFloat(lp.percent) * 100).toFixed(2)}%</td>
                      <td>${lp.is_locked === 1 ? '<span class="tag buy">🔒 Locked</span>' : '<span class="tag sell">⚠️ Unlocked</span>'}</td>
                    </tr>
                  `,
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
          `
              : '<p class="muted small">No LP holders found.</p>'
          }
          <p class="muted small mt">Locked liquidity reduces rug-pull risk.</p>
        </div>
      </div>
    `;
  }

  // ── Scan Function ─────────────────────────────────────

  async function scan(addr, chainKey, view) {
    const body = view.querySelector("#sh-body");
    if (!body) return;
    body.innerHTML = W.ui.spinner();

    const chain = CHAINS[chainKey];
    if (!chain) {
      body.innerHTML = `<p class="muted">Unsupported chain: ${chainKey}</p>`;
      return;
    }

    // Validate address
    if (!isValidAddress(addr, chainKey)) {
      body.innerHTML = W.ui.empty(
        "🚫",
        "Invalid address",
        `Please enter a valid ${chain.name} address.`,
      );
      return;
    }

    try {
      const data = await fetchTokenSecurity(chain.id, addr);
      const result = data.result && data.result[addr.toLowerCase()];

      if (!result) {
        body.innerHTML = W.ui.empty(
          "🛡️",
          "No security data found",
          "Token might be too new, not a standard ERC-20/BEP-20, or not on this chain.",
        );
        return;
      }

      body.innerHTML = renderResults(data, addr, chainKey);
    } catch (e) {
      console.error("[Shield] Scan error:", e);
      body.innerHTML = W.ui.empty(
        "⚠️",
        "Scan failed",
        `Error: ${escapeHTML(e.message)}. Try again later or use a different chain.`,
      );
    }
  }

  // ── Render ─────────────────────────────────────────────

  async function render(view) {
    if (!view) {
      console.warn("[Shield] No view element provided");
      return;
    }

    view.innerHTML = `
      <div class="card">
        <h3>🛡️ Token Shield — Contract Security Auditor</h3>
        <p class="muted small">Paste any EVM contract address to instantly check for honeypots, hidden mints, proxy contracts, and malicious taxes. Powered by GoPlus Security.</p>
        <div class="alert-form mt">
          <label>
            Chain
            <select id="sh-chain">
              ${Object.entries(CHAINS)
                .map(
                  ([k, v]) => `
                <option value="${k}">${v.icon} ${v.name}</option>
              `,
                )
                .join("")}
            </select>
          </label>
          <label>
            Contract Address
            <input id="sh-addr" placeholder="0x..." value="">
          </label>
          <button class="btn primary" id="sh-go">Audit Token</button>
        </div>
        <div class="qa mt">
          <button class="btn tiny" id="sh-examples">📋 Examples</button>
        </div>
      </div>
      <div id="sh-body"></div>
    `;

    // ── Examples ──────────────────────────────────────
    const examples = {
      "0xdac17f958d2ee523a2206206994597c13d831ec7": "USDT",
      "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "USDC",
      "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984": "UNI",
      "0x514910771af9ca656af840dff83e8264ecf986ca": "LINK",
    };

    view.querySelector("#sh-examples").onclick = () => {
      const list = Object.entries(examples)
        .map(
          ([addr, name]) =>
            `<div class="chip" data-addr="${addr}">${name}</div>`,
        )
        .join("");
      const m = W.ui.modal({
        title: "Example Contracts",
        body: `<div class="qa">${list}</div>`,
        footer: `<button class="btn ghost" onclick="this.closest('.modal').parentElement.innerHTML=''">Close</button>`,
      });
      m.el.querySelectorAll("[data-addr]").forEach((chip) => {
        chip.onclick = () => {
          const input = view.querySelector("#sh-addr");
          if (input) input.value = chip.dataset.addr;
          m.close();
          view.querySelector("#sh-go").click();
        };
      });
    };

    // ── Scan button ──────────────────────────────────
    view.querySelector("#sh-go").onclick = () => {
      const addr = view.querySelector("#sh-addr").value.trim();
      const chain = view.querySelector("#sh-chain").value;
      if (!addr) return W.ui.toast("Enter a contract address", "warn");
      scan(addr, chain, view);
    };

    // ── Enter key support ────────────────────────────
    view.querySelector("#sh-addr").addEventListener("keydown", (e) => {
      if (e.key === "Enter") view.querySelector("#sh-go").click();
    });

    // ── Auto-scan URL param (optional) ──────────────
    const params = new URLSearchParams(window.location.search);
    const autoAddr = params.get("address");
    const autoChain = params.get("chain") || "ethereum";
    if (autoAddr && isValidAddress(autoAddr, autoChain)) {
      view.querySelector("#sh-addr").value = autoAddr;
      view.querySelector("#sh-chain").value = autoChain;
      scan(autoAddr, autoChain, view);
    }
  }

  // ── Exports ────────────────────────────────────────────
  return {
    render,
    scan,
    fetchTokenSecurity,
    CHAINS,
  };
})();

console.log("[Shield] Module loaded.");
