// js/features/gems.js – Gem Agent: Token Hunter

window.W = window.W || {};

W.gems = (() => {
  // ── Constants ─────────────────────────────────────────
  const DEXSCREENER_API = "https://api.dexscreener.com";
  const PROXIES = [(u) => u];

  // Only chains with a working Token Shield verification path.
  // Constitution §3.3: DISCOVERABLE_CHAINS ⊆ VERIFIED_CHAINS.
  // Adding a chain here without adding it to shield.js's CHAINS
  // violates the constitution. The parity test in test/unit/gems.test.js
  // enforces this.
  const CHAINS = {
    solana: "🟣",
    ethereum: "🔷",
    base: "🔵",
    bsc: "🟡",
    arbitrum: "🔺",
    polygon: "🟪",
    avalanche: "❄️",
  };

  // Bump this whenever score()'s weights/logic change. Alerts and cards
  // display it so a score from an old version is never confused with one
  // from a newer, differently-weighted model.
  const SCORE_VERSION = "gem-v1";

  // ── Helpers ────────────────────────────────────────────
  function escapeHTML(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function chainTag(chain) {
    return `<span class="tag rank">${CHAINS[chain] || "⛓️"} ${chain}</span>`;
  }

  function kfmt(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
    return (n || 0).toFixed(0);
  }

  function ageText(hours) {
    if (hours < 1) return "<1h";
    if (hours < 48) return Math.round(hours) + "h";
    return Math.round(hours / 24) + "d";
  }

  // ── API call with proxy fallback ──────────────────────
  async function fetchDexScreener(url) {
    let lastErr;
    for (const proxy of PROXIES) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 9000);
      try {
        const resp = await fetch(proxy(url), { signal: controller.signal });
        clearTimeout(timeout);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return await resp.json();
      } catch (e) {
        lastErr = e;
        clearTimeout(timeout);
      }
    }
    throw lastErr || new Error("All proxies failed");
  }

  // ── Scoring Algorithm ──────────────────────────────────
  function score(pair) {
    const liq = (pair.liquidity && pair.liquidity.usd) || 0;
    const vol = (pair.volume && pair.volume.h24) || 0;
    const ageH = pair.pairCreatedAt
      ? (Date.now() - pair.pairCreatedAt) / 36e5
      : 0;
    const c = pair.priceChange || {};
    const h1 = c.h1 || 0,
      h6 = c.h6 || 0,
      h24 = c.h24 || 0;

    let s = 0;
    const reasons = [];

    // Liquidity
    if (liq >= 100e3 && liq <= 10e6) {
      s += 25;
      reasons.push("Healthy liquidity ($" + kfmt(liq) + ")");
    } else if (liq >= 30e3) {
      s += 12;
      reasons.push("Liquidity on the thin side");
    } else {
      s -= 20;
      reasons.push("⚠️ Micro liquidity — rug risk");
    }

    // Volume / liquidity ratio
    const vl = liq ? vol / liq : 0;
    if (vl >= 1 && vl <= 30) {
      s += 20;
      reasons.push("Real interest — volume " + vl.toFixed(1) + "× liquidity");
    } else if (vl > 30) {
      s += 5;
      reasons.push("⚠️ Volume looks washed");
    } else {
      reasons.push("Low trading interest so far");
    }

    // Momentum
    if (h24 > 20 && h6 > 0) {
      s += 20;
      reasons.push("Strong momentum +" + h24.toFixed(0) + "% 24h");
    } else if (h24 < -30) {
      s -= 15;
      reasons.push("Dumping hard " + h24.toFixed(0) + "% 24h");
    } else {
      s += 8;
    }

    // Age
    if (ageH >= 6 && ageH <= 336) {
      s += 20;
      reasons.push("Age " + ageText(ageH) + " — past infancy, still early");
    } else if (ageH < 6) {
      s += 5;
      reasons.push("⚠️ Brand new (<6h) — extreme risk");
    } else {
      s += 10;
    }

    // Early buying pressure
    if (h1 > 0 && h6 > 0) {
      s += 15;
      reasons.push("Buyers stepping in (1h & 6h green)");
    }

    s = Math.max(0, Math.min(100, s));

    // Non-directive classifications. Weaver does not issue trading
    // directives. Constitution §2.4.
    const verdict =
      s >= 70
        ? ["🌱 Strong opportunity signals", "strong-opportunity"]
        : s >= 50
          ? ["🔥 Emerging opportunity", "emerging-opportunity"]
          : s >= 30
            ? ["⚠️ Speculative / mixed", "speculative"]
            : ["🚩 Weak opportunity signals", "weak-opportunity"];

    return {
      score: s,
      reasons,
      verdict,
      liq,
      vol,
      ageH,
      h1,
      h6,
      h24,
      scoreVersion: SCORE_VERSION,
    };
  }

  // ── Scan ──────────────────────────────────────────────
  let auto = false,
    timer = null;
  let seen = {};
  let shieldCache = {};

  // Ask Token Shield for a risk assessment before emitting an alert.
  // Chains not in Shield's CHAINS return { unsupported: true }; this
  // is honest degradation, not a silent skip.
  async function checkShield(addr, chainKey, identity = {}) {
    if (shieldCache[addr]) {
      W.shield?.rememberEvidence?.(
        { ...identity, address: addr, chain: chainKey },
        shieldCache[addr],
      );
      return shieldCache[addr];
    }
    if (!W.shield || !W.shield.CHAINS[chainKey]) {
      const result = { unsupported: true };
      shieldCache[addr] = result;
      return result;
    }
    try {
      const assessment = await W.shield.check(addr, chainKey);
      const result = assessment
        ? { ...assessment, ok: true }
        : { noData: true };
      shieldCache[addr] = result;
      W.shield?.rememberEvidence?.(
        { ...identity, address: addr, chain: chainKey },
        result,
      );
      return result;
    } catch (e) {
      const result = { error: true, message: e.message };
      shieldCache[addr] = result;
      return result;
    }
  }

  function shieldSummary(s) {
    if (!s) return "🛡️ Shield: not checked";
    if (s.unsupported) return "🛡️ Shield: not available for this chain";
    if (s.error) return "🛡️ Shield: check failed — verify manually";
    if (s.noData) return "🛡️ Shield: no security data found";
    return `🛡️ Shield: ${s.riskLevel[0]} (${s.riskScore}/100 identified-risk score, ${s.scoreVersion})`;
  }

  async function scan(view) {
    const body = view.querySelector("#g-body");
    if (!body) return;
    body.innerHTML = W.ui.spinner();

    try {
      const [boosts, profiles] = await Promise.allSettled([
        fetchDexScreener(DEXSCREENER_API + "/token-boosts/latest/v1"),
        fetchDexScreener(DEXSCREENER_API + "/token-profiles/latest/v1"),
      ]);

      const map = new Map();
      if (boosts.status === "fulfilled" && boosts.value) {
        boosts.value.forEach((b) =>
          map.set(b.tokenAddress, b.totalBoosts || 1),
        );
      }
      if (profiles.status === "fulfilled" && profiles.value) {
        profiles.value.forEach((p) => {
          if (!map.has(p.tokenAddress)) map.set(p.tokenAddress, 0);
        });
      }

      const addresses = [...map.keys()].slice(0, 30);
      if (!addresses.length) throw new Error("No candidates");

      const pairs = await fetchDexScreener(
        DEXSCREENER_API + "/latest/dex/tokens/" + addresses.join(","),
      );
      const byToken = {};
      (Array.isArray(pairs) ? pairs : []).forEach((p) => {
        const a = p.baseToken?.address;
        if (!a) return;
        if (
          !byToken[a] ||
          (p.liquidity?.usd || 0) > (byToken[a].liquidity?.usd || 0)
        ) {
          byToken[a] = p;
        }
      });

      const minScore = parseFloat(view.querySelector("#g-min")?.value) || 0;
      const results = Object.values(byToken)
        .map((p) => ({ pair: p, analysis: score(p) }))
        .filter((g) => g.analysis.score >= minScore)
        .sort((a, b) => b.analysis.score - a.analysis.score)
        .slice(0, 24);

      for (const g of results) {
        const addr = g.pair.baseToken.address;
        if (g.analysis.score >= 70 && !seen[addr]) {
          const shield = await checkShield(addr, g.pair.chainId, {
            symbol: g.pair.baseToken.symbol,
            name: g.pair.baseToken.name,
          });
          const reasonLines = (g.analysis.reasons || [])
            .slice(0, 4)
            .map((r) => "• " + r)
            .join("\n");
          const msg =
            `🤖 <b>Gem detected:</b> ${g.pair.baseToken.symbol} on ${g.pair.chainId} — score ${g.analysis.score} (${g.analysis.scoreVersion})\n` +
            (reasonLines ? reasonLines + "\n" : "") +
            shieldSummary(shield);
          W.ui.toast(
            `Gem detected: ${g.pair.baseToken.symbol} — score ${g.analysis.score}`,
            "ok",
            6000,
          );
          if (W.tg) W.tg.notify("gem:" + addr, msg);
        }
        seen[addr] = 1;
      }

      view.querySelector("#g-stats").innerHTML = `
        <div class="card stat"><div class="stat-label">Candidates scanned</div><div class="stat-big">${addresses.length}</div></div>
        <div class="card stat"><div class="stat-label">Chains covered</div><div class="stat-big">${new Set(results.map((g) => g.pair.chainId)).size}</div></div>
        <div class="card stat"><div class="stat-label">Gems ≥ ${minScore}</div><div class="stat-big">${results.length}</div></div>
      `;

      if (results.length) {
        body.innerHTML = `<div class="grid-2">${results
          .map((g) => {
            const p = g.pair,
              a = g.analysis,
              t = p.baseToken;
            const addr = t.address;
            const shield = shieldCache[addr];
            const shieldSection = shield
              ? `<div class="kv-row"><span class="muted">Security</span><span>${escapeHTML(shieldSummary(shield))}</span></div>`
              : `<button class="btn tiny mt" data-shield-check data-addr="${escapeHTML(addr)}" data-symbol="${escapeHTML(t.symbol)}" data-chain="${escapeHTML(p.chainId)}">🛡️ Verify Security</button>`;
            return `
            <div class="card" data-gem-card="${escapeHTML(addr)}">
              <div class="watch-head">
                <div>
                  <b>${escapeHTML(t.symbol)}</b> <span class="muted small">${escapeHTML(t.name)}</span><br>
                  ${chainTag(p.chainId)} <span class="muted small">age ${ageText(a.ageH)}</span>
                </div>
                <div class="text-right">
                  <span class="tag ${a.verdict[1]}" style="font-size:12px;padding:5px 10px;">${a.verdict[0]}</span>
                  <div class="alt-num" style="font-size:26px;">${a.score}</div>
                  <div class="muted" style="font-size:10px;">${a.scoreVersion}</div>
                </div>
              </div>
              <div class="meter-bar"><div style="width:${a.score}%; background: var(--grad);"></div></div>
              <div class="kv-row"><span class="muted">Price</span><span>$${p.priceUsd}</span></div>
              <div class="kv-row"><span class="muted">Liquidity / 24h Vol</span><span>$${kfmt(a.liq)} / $${kfmt(a.vol)}</span></div>
              <div class="kv-row"><span class="muted">1h / 6h / 24h</span><span>${W.fmt.pct(a.h1)} ${W.fmt.pct(a.h6)} ${W.fmt.pct(a.h24)}</span></div>
              <div class="shield-slot">${shieldSection}</div>
              <ul class="tx-list">${a.reasons
                .slice(0, 4)
                .map((r) => `<li>${escapeHTML(r)}</li>`)
                .join("")}</ul>
              <a class="btn tiny mt" href="#/token/${encodeURIComponent(t.symbol)}">📈 Analyze ${escapeHTML(t.symbol)}</a>
              <a class="btn tiny mt" target="_blank" href="${p.url || "https://dexscreener.com/" + p.chainId + "/" + p.pairAddress}">📊 Open in DEX Screener ↗</a>
            </div>
          `;
          })
          .join("")}</div>`;

        body.querySelectorAll("[data-shield-check]").forEach((btn) => {
          btn.onclick = async () => {
            btn.textContent = "Checking…";
            btn.disabled = true;
            const shield = await checkShield(
              btn.dataset.addr,
              btn.dataset.chain,
              { symbol: btn.dataset.symbol },
            );
            const slot = btn.closest(".shield-slot");
            if (slot) {
              slot.innerHTML = `<div class="kv-row"><span class="muted">Security</span><span>${escapeHTML(shieldSummary(shield))}</span></div>`;
            }
          };
        });
      } else {
        body.innerHTML = W.ui.empty(
          "🤖",
          "No gems above the threshold right now",
          "Lower the min score or wait for the next auto-scan",
        );
      }
    } catch (e) {
      body.innerHTML = `<p class="muted">Gem scan failed: ${escapeHTML(e.message)} — DEX Screener unreachable on this network (try ⟳ or another network).</p>`;
    }
  }

  // ── Render ─────────────────────────────────────────────
  async function render(view) {
    const chainList = Object.keys(CHAINS).join(", ");
    view.innerHTML = `
      <div class="card">
        <div class="watch-head">
          <h3>🤖 Gem Agent — new-token scanner</h3>
          <div class="qa">
            <label class="m-0">Min score
              <select id="g-min" class="w-auto">
                <option value="0">0</option>
                <option value="40" selected>40</option>
                <option value="60">60</option>
                <option value="70">70</option>
              </select>
            </label>
            <label class="small m-0">
              <input type="checkbox" id="g-auto" ${auto ? "checked" : ""} class="w-auto">
              Auto-scan 5 min
            </label>
            <button class="btn primary" id="g-go">▶ Scan now</button>
          </div>
        </div>
        <p class="muted small">The agent crawls DEX Screener's latest boosted & newly-profiled tokens on chains with Token Shield verification (<b>${escapeHTML(chainList)}</b>), pulls their pairs and scores potential: liquidity sweet-spot, volume÷liquidity, momentum, age & early buying pressure. Memecoins can go to zero — not financial advice.</p>
      </div>
      <div class="cards" id="g-stats"></div>
      <div id="g-body">${W.ui.spinner()}</div>
    `;

    view.querySelector("#g-go").onclick = () => scan(view);
    view.querySelector("#g-min").onchange = () => scan(view);
    view.querySelector("#g-auto").onchange = (e) => {
      auto = e.target.checked;
      clearInterval(timer);
      if (auto) timer = setInterval(() => scan(view), 5 * 60 * 1000);
      W.ui.toast(
        auto ? "🤖 Agent armed — rescanning every 5 min" : "🤖 Agent paused",
        "info",
      );
    };
    if (auto && !timer) timer = setInterval(() => scan(view), 5 * 60 * 1000);
    await scan(view);
  }

  return { render, scan, checkShield, CHAINS, SCORE_VERSION };
})();

console.log("[Gems] Module loaded.");
