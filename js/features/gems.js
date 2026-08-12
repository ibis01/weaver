window.W = window.W || {};

W.gems = (() => {
  const DS = "https://api.dexscreener.com";
  const PROX = [
    (u) => u,
    (u) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
    (u) => "https://corsproxy.io/?url=" + encodeURIComponent(u),
    (u) => "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(u),
  ];
  async function via(url) {
    let lastErr;
    for (const w of PROX) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 9000);
      try {
        const r = await fetch(w(url), { signal: ctrl.signal });
        clearTimeout(t);
        if (!r.ok) throw new Error("HTTP " + r.status);
        return await r.json();
      } catch (e) {
        lastErr = e;
        clearTimeout(t);
      }
    }
    throw lastErr || new Error("unreachable");
  }

  const CHAINS = {
    solana: "🟣",
    ethereum: "🔷",
    base: "🔵",
    bsc: "🟡",
    arbitrum: "🔺",
    polygon: "🟪",
    avalanche: "❄️",
    ton: "💎",
    blast: "💥",
  };
  const chainTag = (c) =>
    `<span class="tag rank">${CHAINS[c] || "⛓️"} ${c}</span>`;
  const kfmt = (n) =>
    n >= 1e9
      ? (n / 1e9).toFixed(1) + "B"
      : n >= 1e6
        ? (n / 1e6).toFixed(1) + "M"
        : n >= 1e3
          ? (n / 1e3).toFixed(1) + "K"
          : (n || 0).toFixed(0);
  const ageTxt = (h) =>
    h < 1 ? "<1h" : h < 48 ? Math.round(h) + "h" : Math.round(h / 24) + "d";

  /* the "AI": heuristic potential scoring */
  function score(p) {
    const liq = (p.liquidity && p.liquidity.usd) || 0,
      vol = (p.volume && p.volume.h24) || 0;
    const ageH = p.pairCreatedAt ? (Date.now() - p.pairCreatedAt) / 36e5 : 0;
    const c = p.priceChange || {},
      h1 = c.h1 || 0,
      h6 = c.h6 || 0,
      h24 = c.h24 || 0;
    let s = 0;
    const why = [];
    if (liq >= 100e3 && liq <= 10e6) {
      s += 25;
      why.push("Healthy liquidity ($" + kfmt(liq) + ")");
    } else if (liq >= 30e3) {
      s += 12;
      why.push("Liquidity on the thin side");
    } else {
      s -= 20;
      why.push("⚠️ Micro liquidity — rug risk");
    }
    const vl = liq ? vol / liq : 0;
    if (vl >= 1 && vl <= 30) {
      s += 20;
      why.push("Real interest — volume " + vl.toFixed(1) + "× liquidity");
    } else if (vl > 30) {
      s += 5;
      why.push("⚠️ Volume looks washed");
    } else why.push("Low trading interest so far");
    if (h24 > 20 && h6 > 0) {
      s += 20;
      why.push("Strong momentum +" + h24.toFixed(0) + "% 24h");
    } else if (h24 < -30) {
      s -= 15;
      why.push("Dumping hard " + h24.toFixed(0) + "% 24h");
    } else s += 8;
    if (ageH >= 6 && ageH <= 336) {
      s += 20;
      why.push("Age " + ageTxt(ageH) + " — past infancy, still early");
    } else if (ageH < 6) {
      s += 5;
      why.push("⚠️ Brand new (<6h) — extreme risk");
    } else s += 10;
    if (h1 > 0 && h6 > 0) {
      s += 15;
      why.push("Buyers stepping in (1h & 6h green)");
    }
    s = Math.max(0, Math.min(100, s));
    const verdict =
      s >= 70
        ? ["🌱 High-potential gem", "buy"]
        : s >= 50
          ? ["🔥 Heating up", "live"]
          : s >= 30
            ? ["⚠️ Degen play", "triggered"]
            : ["🚩 Avoid", "sell"];
    return { s, why, verdict, liq, vol, ageH, h1, h6, h24 };
  }

  let auto = false,
    seen = {},
    timer = null;

  async function scan(view) {
    const body = view.querySelector("#g-body");
    body.innerHTML = W.ui.spinner();
    try {
      const [boosts, profiles] = await Promise.allSettled([
        via(DS + "/token-boosts/latest/v1"),
        via(DS + "/token-profiles/latest/v1"),
      ]);
      const map = new Map();
      (boosts.status === "fulfilled" ? boosts.value : []).forEach((b) =>
        map.set(b.tokenAddress, b.totalBoosts || 1),
      );
      (profiles.status === "fulfilled" ? profiles.value : []).forEach((p) => {
        if (!map.has(p.tokenAddress)) map.set(p.tokenAddress, 0);
      });

      const addrs = [...map.keys()].slice(0, 30);
      if (!addrs.length) throw new Error("no candidates");
      const pairs = await via(DS + "/latest/dex/tokens/" + addrs.join(","));
      const byTok = {};
      (Array.isArray(pairs) ? pairs : []).forEach((p) => {
        const a = p.baseToken && p.baseToken.address;
        if (!a) return;
        if (
          !byTok[a] ||
          ((p.liquidity && p.liquidity.usd) || 0) >
            ((byTok[a].liquidity && byTok[a].liquidity.usd) || 0)
        )
          byTok[a] = p;
      });

      const minScore = parseFloat(view.querySelector("#g-min").value) || 0;
      const gems = Object.values(byTok)
        .map((p) => ({ p, r: score(p) }))
        .filter((g) => g.r.s >= minScore)
        .sort((x, y) => y.r.s - x.r.s)
        .slice(0, 24);

      gems.forEach((g) => {
        const a = g.p.baseToken.address;
        if (g.r.s >= 70 && !seen[a]) {
          W.ui.toast(
            "🤖 Agent found a gem: <b>" +
              g.p.baseToken.symbol +
              "</b> on " +
              g.p.chainId +
              " — score " +
              g.r.s,
            "ok",
            6000,
          );
          if (W.tg)
            W.tg.notify(
              "gem:" + a,
              `🌱 <b>Gem detected:</b> ${g.p.baseToken.symbol} on ${g.p.chainId} — score ${g.r.s}/100\n💧 Liquidity $${(g.r.liq / 1e3).toFixed(0)}K · 24h ${g.r.h24 >= 0 ? "+" : ""}${g.r.h24.toFixed(0)}%\n📊 ${g.p.url || ""}`,
            );
        }
        seen[a] = 1;
      });
      view.querySelector("#g-stats").innerHTML = `
        <div class="card stat"><div class="stat-label">Candidates scanned</div><div class="stat-big">${addrs.length}</div></div>
        <div class="card stat"><div class="stat-label">Chains covered</div><div class="stat-big">${new Set(gems.map((g) => g.p.chainId)).size}</div></div>
        <div class="card stat"><div class="stat-label">Gems ≥ ${minScore}</div><div class="stat-big">${gems.length}</div></div>`;

      body.innerHTML = gems.length
        ? `<div class="grid-2">${gems
            .map((g) => {
              const p = g.p,
                r = g.r,
                t = p.baseToken;
              return `<div class="card">
          <div class="watch-head"><div><b>${t.symbol}</b> <span class="muted small">${t.name}</span><br>${chainTag(p.chainId)} <span class="muted small">age ${ageTxt(r.ageH)}</span></div>
          <div style="text-align:right"><span class="tag ${r.verdict[1]}" style="font-size:12px;padding:5px 10px">${r.verdict[0]}</span><div class="alt-num" style="font-size:26px">${r.s}</div></div></div>
          <div class="meter-bar"><div style="width:${r.s}%"></div></div>
          <div class="kv-row"><span class="muted">Price</span><span>$${p.priceUsd}</span></div>
          <div class="kv-row"><span class="muted">Liquidity / 24h Vol</span><span>$${kfmt(r.liq)} / $${kfmt(r.vol)}</span></div>
          <div class="kv-row"><span class="muted">1h / 6h / 24h</span><span>${W.fmt.pct(r.h1)} ${W.fmt.pct(r.h6)} ${W.fmt.pct(r.h24)}</span></div>
          <ul class="tx-list">${r.why
            .slice(0, 4)
            .map((w) => "<li>" + w + "</li>")
            .join("")}</ul>
          <a class="btn tiny mt" target="_blank" href="${p.url || "https://dexscreener.com/" + p.chainId + "/" + p.pairAddress}">📊 Open in DEX Screener ↗</a>
        </div>`;
            })
            .join("")}</div>`
        : W.ui.empty(
            "🤖",
            "No gems above the threshold right now",
            "Lower the min score or wait for the next auto-scan",
          );
    } catch (e) {
      body.innerHTML = `<p class="muted">Gem scan failed: ${e.message} — DEX Screener unreachable on this network (try ⟳ or another network).</p>`;
    }
  }

  async function render(view) {
    view.innerHTML = `
      <div class="card">
        <div class="watch-head"><h3>🤖 Gem Agent — autonomous new-token hunter</h3>
          <div class="qa">
            <label style="margin:0">Min score<select id="g-min" style="width:auto"><option>0</option><option selected>40</option><option>60</option><option>70</option></select></label>
            <label class="small" style="margin:0"><input type="checkbox" id="g-auto" ${auto ? "checked" : ""} style="width:auto"> Auto-scan 5 min</label>
            <button class="btn primary" id="g-go">▶ Scan now</button>
          </div>
        </div>
        <p class="muted small">The agent crawls DEX Screener's latest boosted & newly-profiled tokens on <b>every chain</b>, pulls their pairs and scores potential: liquidity sweet-spot, volume÷liquidity, momentum, age & early buying pressure. Memecoins can go to zero — not financial advice.</p>
      </div>
      <div class="cards" id="g-stats"></div>
      <div id="g-body">${W.ui.spinner()}</div>`;
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

  return { render };
})();
