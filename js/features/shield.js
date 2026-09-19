// ================================================================
// js/features/shield.js – Token Shield (Contract Security Auditor)
// ================================================================

window.W = window.W || {};

W.shield = (() => {
  // ── Constants ─────────────────────────────────────────
  const GOPLUS_API = "https://api.gopluslabs.io/api/v1/token_security";
  const GOPLUS_SOLANA_API =
    "https://api.gopluslabs.io/api/v1/solana/token_security";
  const CACHE_TTL = 300000; // 5 minutes

  // Authoritative threshold for "identified high-risk". Do not duplicate
  // this value elsewhere in the codebase. Consumers that need a
  // high-risk decision MUST call W.shield.isHighRisk() rather than
  // re-implementing the comparison.
  const RISK_THRESHOLD = 40;

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
    solana: { id: "solana", name: "Solana", icon: "🟣" },
  };

  // Bumped whenever the corresponding risk-scoring weights/logic change.
  // EVM and Solana are versioned separately since they score different
  // fields entirely — see Weaver Constitution §3.8.
  const SHIELD_SCORE_VERSION_EVM = "shield-evm-v1";
  const SHIELD_SCORE_VERSION_SOLANA = "shield-solana-v1";
  const evidenceRegistry = new Map();

  function evidenceKeys(identity = {}) {
    return [identity.coingeckoId, identity.symbol, identity.address]
      .filter((value) => typeof value === "string" && value.trim())
      .map((value) => value.trim().toLowerCase());
  }

  function rememberEvidence(identity, assessment) {
    if (
      !assessment ||
      assessment.error ||
      assessment.noData ||
      assessment.unsupported
    )
      return null;
    const record = {
      ...assessment,
      address: identity.address || null,
      chain: identity.chain || identity.chainKey || null,
      source: "goplus",
      observedAt: identity.observedAt || Date.now(),
    };
    evidenceKeys(identity).forEach((key) => evidenceRegistry.set(key, record));
    return record;
  }

  function getEvidence(identity) {
    for (const key of evidenceKeys(identity)) {
      const record = evidenceRegistry.get(key);
      if (record) return { ...record };
    }
    return null;
  }

  // ── Authoritative high-risk predicate ─────────────────
  // Returns true only when the assessment carries a finite riskScore
  // that meets or exceeds RISK_THRESHOLD.
  //
  // Missing, malformed, errored, noData, or unsupported assessments are
  // NEVER high risk. Callers must not treat "not high risk" as "safe" —
  // the correct interpretation is "not identified as high risk".
  function isHighRisk(assessment) {
    if (!assessment) return false;
    if (assessment.error || assessment.noData || assessment.unsupported) {
      return false;
    }
    const score = Number(assessment.riskScore);
    return Number.isFinite(score) && score >= RISK_THRESHOLD;
  }

  // ── Helpers ────────────────────────────────────────────

  // Bucket a percentage to the nearest 10 for the .meter-fill-N
  // classes in style.css. Kept local so this module has no
  // dependency on W.ui being fully populated. CSP-safe: width is
  // set via a class, not an inline style attribute.
  function pctBucket(n) {
    const v = Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
    return Math.round(v / 10) * 10;
  }

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
  // Solana addresses are case-sensitive base58 — never lowercase them.
  // EVM addresses are case-insensitive hex, so normalizing is safe there.

  function getCacheKey(chainId, address) {
    const norm = chainId === "solana" ? address : address.toLowerCase();
    return `shield_${chainId}_${norm}`;
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

  // ── Own CORS proxy (Cloudflare Worker) ─────────────────
  // Set this after deploying cf-worker/ (see cf-worker/README.md).
  // Left blank, Shield falls back to the first-party worker path,
  // so this can be filled in whenever without breaking anything.
  const WORKER_PROXY_BASE = "";

  async function fetchViaOwnWorker(kind, chainId, address) {
    if (!WORKER_PROXY_BASE) return null;
    const path =
      kind === "solana" ? "/goplus/solana" : `/goplus/evm/${chainId}`;
    const addrParam = kind === "solana" ? address : address.toLowerCase();
    const url = `${WORKER_PROXY_BASE}${path}?contract_addresses=${encodeURIComponent(addrParam)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data.code !== 1) throw new Error(data.message || "API error");
      return data;
    } finally {
      clearTimeout(timeout);
    }
  }

  // ── Fetch from GoPlus ─────────────────────────────────

  async function fetchTokenSecurity(chainId, address) {
    // Check cache first
    const cached = getCached(chainId, address);
    if (cached) return cached;

    // Prefer our own worker — reliable, no third-party dependency.
    try {
      const viaWorker = await fetchViaOwnWorker("evm", chainId, address);
      if (viaWorker) {
        setCache(chainId, address, viaWorker);
        return viaWorker;
      }
    } catch (e) {
      console.warn(
        "[Shield] Own worker failed, using direct provider:",
        e.message,
      );
    }

    const url = `${GOPLUS_API}/${chainId}?contract_addresses=${address.toLowerCase()}`;

    // Use direct provider only
    const proxies = [(u) => u];

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

  // ── Fetch from GoPlus (Solana) ─────────────────────────
  // Solana uses a separate GoPlus endpoint with a different response
  // schema (mint/freeze/close authorities instead of honeypot/proxy/tax
  // fields) — see renderSolanaResults below.

  async function fetchSolanaTokenSecurity(address) {
    const cached = getCached("solana", address);
    if (cached) return cached;

    // Prefer our own worker — reliable, no third-party dependency.
    try {
      const viaWorker = await fetchViaOwnWorker("solana", null, address);
      if (viaWorker) {
        setCache("solana", address, viaWorker);
        return viaWorker;
      }
    } catch (e) {
      console.warn(
        "[Shield] Own worker failed, using direct provider:",
        e.message,
      );
    }

    // Address case matters for Solana — never lowercase it.
    const url = `${GOPLUS_SOLANA_API}?contract_addresses=${address}`;

    const proxies = [(u) => u];

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
        setCache("solana", address, data);
        return data;
      } catch (e) {
        lastError = e;
        console.warn("[Shield] Solana proxy failed:", e.message);
      }
    }
    throw lastError || new Error("All proxies failed");
  }

  // ── Parse and Render Results ──────────────────────────

  // ── Risk Assessment (pure — no DOM, reusable by other modules) ────

  function assessEvmRisk(result) {
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
      riskScore >= RISK_THRESHOLD
        ? ["🔴 High identified risk indicators", "high-risk"]
        : riskScore >= 20
          ? ["🟡 Risk indicators detected", "caution"]
          : ["🟢 No identified risk indicators", "no-identified-risk"];

    return {
      riskScore,
      risks,
      riskLevel,
      scoreVersion: SHIELD_SCORE_VERSION_EVM,
      flags: { isHoneypot, isMintable, isProxy, isOwnerRenounced, isLpLocked },
      buyTax,
      sellTax,
    };
  }

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

    const assessment = assessEvmRisk(result);
    const { riskScore, risks, riskLevel } = assessment;
    const isHoneypot = assessment.flags.isHoneypot;
    const isMintable = assessment.flags.isMintable;
    const isProxy = assessment.flags.isProxy;
    const isOwnerRenounced = assessment.flags.isOwnerRenounced;
    const isLpLocked = assessment.flags.isLpLocked;
    const buyTax = assessment.buyTax;
    const sellTax = assessment.sellTax;
    const holderCount = result.holder_count || 0;
    const totalSupply = result.total_supply
      ? parseFloat(result.total_supply).toLocaleString(undefined, {
          maximumFractionDigits: 0,
        })
      : "Unknown";

    // ── Top holders ──────────────────────────────────
    const topHolders = (result.holders || []).slice(0, 5);
    const lpHolders = (result.lp_holders || []).slice(0, 3);

    // ── Build HTML ──────────────────────────────────
    return `
      <div class="card ${riskScore >= RISK_THRESHOLD ? "risk-card-high" : riskScore >= 20 ? "risk-card-mid" : "risk-card-low"}">
        <div class="watch-head">
          <div>
            <h2>${escapeHTML(result.token_name || "Unknown")} <span class="muted">${escapeHTML(result.token_symbol || "")}</span></h2>
            <p class="muted small">${chain.icon} ${chain.name} · ${holderCount} Holders · Supply: ${totalSupply}</p>
          </div>
         <div class="text-right">
              <span class="tag tag-xl ${riskLevel[1]}">${riskLevel[0]}</span>
              <div class="muted small">Risk Score: ${riskScore}/100</div>
            <div class="muted text-2xs">${SHIELD_SCORE_VERSION_EVM}</div>
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
          <div class="kv-row"><span>Buy Tax</span> <b class="${parseFloat(buyTax) > 5 ? "text-down" : "text-up"}">${buyTax}%</b></div>
          <div class="kv-row"><span>Sell Tax</span> <b class="${parseFloat(sellTax) > 5 ? "text-down" : "text-up"}">${sellTax}%</b></div>
          <div class="meter-label mt">Tax Severity</div>
          <div class="meter-bar">
            <div class="meter-fill meter-fill-${pctBucket(Math.min(100, (parseFloat(buyTax) + parseFloat(sellTax)) * 2))} ${Math.max(parseFloat(buyTax), parseFloat(sellTax)) > 5 ? "meter-fill-down" : "meter-fill-up"}"></div>
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

  // ── Parse and Render Results (Solana) ──────────────────
  // GoPlus's Solana schema is different from EVM: authority-based flags
  // (mint/freeze/close/metadata) instead of honeypot/proxy/tax fields.
  // This is a beta API on GoPlus's side, so field shapes are read
  // defensively — an unexpected shape degrades to "unknown", never to
  // a false "safe".

  function readSolanaFlag(field) {
    if (field == null) return { active: null, authority: null };
    if (typeof field === "object") {
      const status = field.status;
      const active =
        status === "1" || status === 1 || status === true
          ? true
          : status === "0" || status === 0 || status === false
            ? false
            : null;
      const authority =
        field.authority?.address ||
        field.metadata_upgrade_authority?.address ||
        null;
      return { active, authority };
    }
    const active =
      field === "1" || field === 1 || field === true
        ? true
        : field === "0" || field === 0 || field === false
          ? false
          : null;
    return { active, authority: null };
  }

  function assessSolanaRisk(result) {
    const mintable = readSolanaFlag(result.mintable);
    const freezable = readSolanaFlag(result.freezable);
    const closable = readSolanaFlag(result.closable);
    const metadataMutable = readSolanaFlag(result.metadata_mutable);
    const balanceMutable = readSolanaFlag(result.balance_mutable_authority);
    const transferFeePct =
      parseFloat(result.transfer_fee?.pct ?? result.transfer_fee ?? 0) || 0;
    const isTrusted =
      result.trusted_token === "1" || result.trusted_token === 1;

    let riskScore = 0;
    const risks = [];

    if (freezable.active) {
      riskScore += 30;
      risks.push(
        "🚨 Freeze authority active (holders can be blocked from trading)",
      );
    }
    if (balanceMutable.active) {
      riskScore += 25;
      risks.push("🚨 Balance can be modified by an authority");
    }
    if (mintable.active) {
      riskScore += 20;
      risks.push("⚠️ Mint authority active (supply can be inflated)");
    }
    if (closable.active) {
      riskScore += 15;
      risks.push("⚠️ Mint account can be closed by an authority");
    }
    if (metadataMutable.active) {
      riskScore += 10;
      risks.push("⚠️ Token metadata can still be changed");
    }
    if (transferFeePct > 0) {
      riskScore += transferFeePct > 5 ? 15 : 5;
      risks.push(`⚠️ Transfer fee: ${transferFeePct}%`);
    }

    const riskLevel =
      riskScore >= RISK_THRESHOLD
        ? ["🔴 High identified risk indicators", "high-risk"]
        : riskScore >= 20
          ? ["🟡 Risk indicators detected", "caution"]
          : ["🟢 No identified risk indicators", "no-identified-risk"];

    return {
      riskScore,
      risks,
      riskLevel,
      scoreVersion: SHIELD_SCORE_VERSION_SOLANA,
      flags: { mintable, freezable, closable, metadataMutable, balanceMutable },
      transferFeePct,
      isTrusted,
    };
  }

  function renderSolanaResults(data, address) {
    const chain = CHAINS.solana;
    const result = data.result && data.result[address];
    if (!result) {
      return `
        <div class="card">
          ${W.ui.empty("🛡️", "No data found", "Token might be too new or not indexed yet.")}
        </div>
      `;
    }

    const assessment = assessSolanaRisk(result);
    const { riskScore, risks, riskLevel } = assessment;
    const { mintable, freezable, closable, metadataMutable, balanceMutable } =
      assessment.flags;
    const transferFeePct = assessment.transferFeePct;
    const isTrusted = assessment.isTrusted;

    const holderCount = result.holder_count || 0;
    const totalSupply = result.total_supply
      ? parseFloat(result.total_supply).toLocaleString(undefined, {
          maximumFractionDigits: 0,
        })
      : "Unknown";

    const flagBadge = (flag, activeLabel, safeLabel) => {
      if (flag.active === null) return `<b class="muted">UNKNOWN</b>`;
      return flag.active
        ? `<b class="down">${activeLabel}</b>`
        : `<b class="up">${safeLabel}</b>`;
    };

    return `
     <div class="card ${riskScore >= RISK_THRESHOLD ? "risk-card-high" : riskScore >= 20 ? "risk-card-mid" : "risk-card-low"}">
        <div class="watch-head">
          <div>
            <h2>${escapeHTML(result.token_name || "Unknown")} <span class="muted">${escapeHTML(result.token_symbol || "")}</span></h2>
            <p class="muted small">${chain.icon} ${chain.name} · ${holderCount} Holders · Supply: ${totalSupply}${isTrusted ? ' · <span class="tag buy">✓ Trusted</span>' : ""}</p>
          </div>
             <div class="text-right">
             <span class="tag tag-xl ${riskLevel[1]}">${riskLevel[0]}</span>
              <div class="muted small">Risk Score: ${riskScore}/100</div>
            <div class="muted text-2xs">${SHIELD_SCORE_VERSION_SOLANA}</div>
          </div>
        </div>
        ${
          risks.length
            ? `
          <div class="mt">
            ${risks.map((r) => `<span class="tag ${r.includes("🚨") ? "sell" : "triggered"}">${r}</span>`).join(" ")}
          </div>
        `
            : ""
        }
      </div>

      <div class="grid-2">
        <div class="card">
          <h3>🚨 Authority Flags</h3>
          <div class="kv-row"><span>Mint Authority Active</span> ${flagBadge(mintable, "YES ⚠️", "NO ✅")}</div>
          <div class="kv-row"><span>Freeze Authority Active</span> ${flagBadge(freezable, "YES 🚨", "NO ✅")}</div>
          <div class="kv-row"><span>Balance Mutable</span> ${flagBadge(balanceMutable, "YES 🚨", "NO ✅")}</div>
          <div class="kv-row"><span>Closable</span> ${flagBadge(closable, "YES ⚠️", "NO ✅")}</div>
          <div class="kv-row"><span>Metadata Mutable</span> ${flagBadge(metadataMutable, "YES ⚠️", "NO ✅")}</div>
        </div>
        <div class="card">
          <h3>💰 Transfer Fee</h3>
          <div class="kv-row"><span>Current Fee</span> <b class="${transferFeePct > 5 ? "text-down" : "text-up"}">${transferFeePct}%</b></div>
          <p class="muted small mt">Solana Token-2022 tokens can charge a fee on every transfer. 0% is ideal.</p>
          <p class="muted small mt">⚠️ This audit uses GoPlus's Solana Token Security API, which is in beta — cross-check important findings on <a href="https://solscan.io/token/${escapeHTML(address)}" target="_blank" rel="noopener noreferrer">Solscan</a> or RugCheck before trading.</p>
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
      if (chainKey === "solana") {
        const data = await fetchSolanaTokenSecurity(addr);
        const result = data.result && data.result[addr];

        if (!result) {
          body.innerHTML = W.ui.empty(
            "🛡️",
            "No security data found",
            "Token might be too new or not indexed by GoPlus yet.",
          );
          return;
        }

        body.innerHTML = renderSolanaResults(data, addr);
        return;
      }

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
        <p class="muted small">Paste any EVM or Solana token address to instantly check for honeypots, hidden mints, freeze authorities, and malicious taxes. Powered by GoPlus Security.</p>
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
            <input id="sh-addr" placeholder="0x... or a Solana mint address" value="">
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
      "0xdac17f958d2ee523a2206206994597c13d831ec7": {
        name: "USDT",
        chain: "ethereum",
      },
      "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": {
        name: "USDC",
        chain: "ethereum",
      },
      "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984": {
        name: "UNI",
        chain: "ethereum",
      },
      "0x514910771af9ca656af840dff83e8264ecf986ca": {
        name: "LINK",
        chain: "ethereum",
      },
      DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: {
        name: "BONK",
        chain: "solana",
      },
    };

    view.querySelector("#sh-examples").onclick = () => {
      const list = Object.entries(examples)
        .map(
          ([addr, info]) =>
            `<div class="chip" data-addr="${addr}" data-chain="${info.chain}">${info.name}</div>`,
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
          const chainSelect = view.querySelector("#sh-chain");
          if (input) input.value = chip.dataset.addr;
          if (chainSelect) chainSelect.value = chip.dataset.chain;
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

  // ── Unified Check (fetch + assess, no rendering) ────────
  // For other modules (e.g. Gem Agent) that need a risk verdict without
  // the HTML card — returns the same assessment shape scan() renders
  // from, or null if no data was found. Errors propagate to the caller
  // so they can be surfaced honestly rather than swallowed here.
  async function check(address, chainKey) {
    if (!isValidAddress(address, chainKey)) {
      throw new Error(`Invalid ${chainKey} address`);
    }
    if (chainKey === "solana") {
      const data = await fetchSolanaTokenSecurity(address);
      const result = data.result && data.result[address];
      if (!result) return null;
      return assessSolanaRisk(result);
    }
    const chain = CHAINS[chainKey];
    if (!chain) throw new Error(`Unsupported chain: ${chainKey}`);
    const data = await fetchTokenSecurity(chain.id, address);
    const result = data.result && data.result[address.toLowerCase()];
    if (!result) return null;
    return assessEvmRisk(result);
  }

  // ── Exports ────────────────────────────────────────────
  return {
    render,
    scan,
    check,
    assessEvmRisk,
    assessSolanaRisk,
    fetchTokenSecurity,
    fetchSolanaTokenSecurity,
    rememberEvidence,
    getEvidence,
    // Authoritative high-risk predicate and threshold. Consumers (e.g.
    // Gem Agent) MUST call isHighRisk() rather than duplicating the
    // numeric threshold.
    isHighRisk,
    RISK_THRESHOLD,
    CHAINS,
  };
})();

console.log("[Shield] Module loaded.");
