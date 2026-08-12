window.W = window.W || {};

W.shield = (() => {
  const API = "https://api.gopluslabs.io/api/v1/token_security";
  const CHAINS = {
    ethereum: { id: "1", name: "Ethereum" },
    bsc: { id: "56", name: "BSC" },
    base: { id: "8453", name: "Base" },
    arbitrum: { id: "42161", name: "Arbitrum" },
    polygon: { id: "137", name: "Polygon" },
    solana: { id: "solana", name: "Solana" }, // GoPlus handles solana slightly differently, but we'll focus on EVM for deep audit
    avalanche: { id: "43114", name: "Avalanche" },
  };

  const PROX = [
    (u) => u,
    (u) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
  ];
  async function via(url) {
    for (const w of PROX) {
      try {
        const r = await fetch(w(url), { signal: AbortSignal.timeout(8000) });
        if (r.ok) return await r.json();
      } catch (e) {}
    }
    throw new Error("Security API unreachable");
  }

  function verdictBar(label, val, isBad) {
    const pct = Math.min(100, Math.abs(val) * 10);
    const color = isBad ? "var(--down)" : "var(--up)";
    return `<div class="meter"><div class="meter-label">${label} <b style="color:${color}">${val}%</b></div>
      <div class="meter-bar"><div style="width:${pct}%; background:${color}; box-shadow:0 0 12px ${color}"></div></div></div>`;
  }

  async function scan(addr, chainKey, view) {
    const body = view.querySelector("#sh-body");
    body.innerHTML = W.ui.spinner();
    const chain = CHAINS[chainKey];
    if (!chain) {
      body.innerHTML = '<p class="muted">Unsupported chain.</p>';
      return;
    }

    try {
      const url = `${API}/${chain.id}?contract_addresses=${addr.toLowerCase()}`;
      const data = await via(url);
      const result = data.result && data.result[addr.toLowerCase()];

      if (!result) {
        body.innerHTML = W.ui.empty(
          "🛡️",
          "No data found",
          "Check the address and chain. Token might be too new or not an ERC-20/BEP-20.",
        );
        return;
      }

      const isHoneypot = result.is_honeypot === "1";
      const isMintable = result.is_mintable === "1";
      const isProxy = result.is_proxy === "1";
      const buyTax = (parseFloat(result.buy_tax) * 100).toFixed(1);
      const sellTax = (parseFloat(result.sell_tax) * 100).toFixed(1);
      const holderCount = result.holder_count || 0;
      const totalSupply = result.total_supply
        ? parseFloat(result.total_supply).toLocaleString(undefined, {
            maximumFractionDigits: 0,
          })
        : "Unknown";

      const topHolders = (result.holders || []).slice(0, 5);
      const lpHolders = (result.lp_holders || []).slice(0, 3);
      const isLpLocked = lpHolders.some((lp) => lp.is_locked === 1);

      const riskScore =
        (isHoneypot ? 50 : 0) +
        (isMintable ? 15 : 0) +
        (isProxy ? 10 : 0) +
        (parseFloat(buyTax) > 5 ? 10 : 0) +
        (parseFloat(sellTax) > 5 ? 15 : 0);
      const riskLevel =
        riskScore >= 40
          ? ["🚨 EXTREME RUG RISK", "sell"]
          : riskScore >= 15
            ? ["⚠️ CAUTION", "triggered"]
            : ["✅ LOOKS SAFE", "buy"];

      body.innerHTML = `
        <div class="card" style="border-color: ${riskScore >= 40 ? "var(--down)" : riskScore >= 15 ? "var(--warn)" : "var(--up)"}; box-shadow: 0 0 30px ${riskScore >= 40 ? "rgba(255,92,122,.2)" : "transparent"}">
          <div class="watch-head">
            <div><h2>${result.token_name || "Unknown"} <span class="muted">${result.token_symbol || ""}</span></h2>
            <p class="muted small">${chain.name} · ${holderCount} Holders · Supply: ${totalSupply}</p></div>
            <div style="text-align:right"><span class="tag ${riskLevel[1]}" style="font-size:14px;padding:8px 16px">${riskLevel[0]}</span></div>
          </div>
        </div>

        <div class="grid-2">
          <div class="card">
            <h3>🚨 Red Flags</h3>
            <div class="kv-row"><span>Honeypot (Cannot Sell)</span> <b class="${isHoneypot ? "down" : "up"}">${isHoneypot ? "YES 🚨" : "NO ✅"}</b></div>
            <div class="kv-row"><span>Mintable (Infinite Supply)</span> <b class="${isMintable ? "down" : "up"}">${isMintable ? "YES ⚠️" : "NO ✅"}</b></div>
            <div class="kv-row"><span>Proxy Contract (Hidden Logic)</span> <b class="${isProxy ? "down" : "up"}">${isProxy ? "YES ⚠️" : "NO ✅"}</b></div>
            <div class="kv-row"><span>Liquidity Locked</span> <b class="${isLpLocked ? "up" : "down"}">${isLpLocked ? "YES ✅" : "NO 🚨"}</b></div>
          </div>
          <div class="card">
            <h3>💰 Taxes & Fees</h3>
            ${verdictBar("Buy Tax", buyTax, parseFloat(buyTax) > 5)}
            ${verdictBar("Sell Tax", sellTax, parseFloat(sellTax) > 5)}
            <p class="muted small mt">Taxes > 5% are often used to drain buyer funds. 0/0 is ideal.</p>
          </div>
        </div>

        <div class="card">
          <h3>🐋 Top Holders</h3>
          <div class="table-wrap"><table>
            <thead><tr><th>Address</th><th>Tag</th><th>Supply %</th><th>Status</th></tr></thead>
            <tbody>${topHolders
              .map(
                (h) => `<tr>
              <td><code>${W.fmt.addr(h.address)}</code></td>
              <td>${h.tag ? `<span class="tag rank">${h.tag}</span>` : '<span class="muted">—</span>'}</td>
              <td><b>${(parseFloat(h.percent) * 100).toFixed(2)}%</b></td>
              <td>${h.is_contract === 1 ? '<span class="tag">Contract</span>' : h.is_locked === 1 ? '<span class="tag buy">Locked</span>' : '<span class="tag neutral">Wallet</span>'}</td>
            </tr>`,
              )
              .join("")}</tbody>
          </table></div>
        </div>`;
    } catch (e) {
      body.innerHTML = `<p class="muted">Scan failed: ${e.message}</p>`;
    }
  }

  async function render(view) {
    view.innerHTML = `
      <div class="card">
        <h3>🛡️ Token Shield — Contract Security Auditor</h3>
        <p class="muted small">Paste any EVM contract address to instantly check for honeypots, hidden mints, proxy contracts, and malicious taxes. Powered by GoPlus Security.</p>
        <div class="alert-form mt">
          <label>Chain<select id="sh-chain">${Object.entries(CHAINS)
            .map(([k, v]) => `<option value="${k}">${v.name}</option>`)
            .join("")}</select></label>
          <label>Contract Address<input id="sh-addr" placeholder="0x..."></label>
          <button class="btn primary" id="sh-go">Audit Token</button>
        </div>
      </div>
      <div id="sh-body"></div>`;

    view.querySelector("#sh-go").onclick = () => {
      const addr = view.querySelector("#sh-addr").value.trim();
      const chain = view.querySelector("#sh-chain").value;
      if (!addr.startsWith("0x") || addr.length !== 42)
        return W.ui.toast("Enter a valid 0x contract address", "warn");
      scan(addr, chain, view);
    };
  }

  return { render };
})();
