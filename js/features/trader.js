window.W = window.W || {};

W.trader = (() => {
  /* ── indicators ── */
  const sma = (a, n) =>
    a.map((_, i) =>
      i < n - 1
        ? null
        : a.slice(i - n + 1, i + 1).reduce((s, x) => s + x, 0) / n,
    );
  function rsi(a, n = 14) {
    const out = new Array(a.length).fill(null);
    let g = 0,
      l = 0;
    for (let i = 1; i < a.length; i++) {
      const d = a[i] - a[i - 1],
        up = Math.max(d, 0),
        dn = Math.max(-d, 0);
      if (i <= n) {
        g += up;
        l += dn;
        if (i === n) {
          g /= n;
          l /= n;
          out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
        }
      } else {
        g = (g * (n - 1) + up) / n;
        l = (l * (n - 1) + dn) / n;
        out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
      }
    }
    return out;
  }

  function signalOf(score) {
    if (score >= 4) return ["STRONG BUY", "buy"];
    if (score >= 2) return ["BUY", "buy"];
    if (score <= -4) return ["STRONG SELL", "sell"];
    if (score <= -2) return ["SELL", "sell"];
    return ["HOLD", "neutral"];
  }
  const advice = (s) =>
    ({
      "STRONG BUY": "Deep value zone — DCA-friendly for long-term holders.",
      BUY: "Constructive setup — accumulating is reasonable.",
      HOLD: "No statistical edge right now — hold and wait.",
      SELL: "Consider taking partial profits / tightening stops.",
      "STRONG SELL": "Risk-off — review position size seriously.",
    })[s];

  async function analyze(id, fg) {
    const [coin, chart] = await Promise.all([
      W.api.coin(id),
      W.api.chart(id, 90),
    ]);
    const prices = chart.prices.map((p) => p[1]);
    const s20 = sma(prices, 20),
      s50 = sma(prices, 50),
      R = rsi(prices);
    const last = prices.at(-1),
      sma20 = s20.at(-1),
      sma50 = s50.at(-1),
      r = R.at(-1) ?? 50;
    const md = coin.market_data;
    const p7 = md.price_change_percentage_7d ?? 0,
      p30 = md.price_change_percentage_30d ?? 0;

    let score = 0;
    const reasons = [];
    if (last > sma20 && sma20 > sma50) {
      score += 2;
      reasons.push([
        "up",
        "Uptrend — price > SMA20 > SMA50 (bullish alignment)",
      ]);
    } else if (last > sma50) {
      score += 1;
      reasons.push(["up", "Price holding above the 50-day average"]);
    } else if (last < sma20 && sma20 < sma50) {
      score -= 2;
      reasons.push([
        "down",
        "Downtrend — price < SMA20 < SMA50 (bearish alignment)",
      ]);
    } else {
      score -= 1;
      reasons.push(["down", "Price below the 50-day average"]);
    }

    if (r < 30) {
      score += 2;
      reasons.push([
        "up",
        `RSI ${r.toFixed(0)} — oversold, historically a buy zone`,
      ]);
    } else if (r > 70) {
      score -= 2;
      reasons.push([
        "down",
        `RSI ${r.toFixed(0)} — overbought, elevated pullback risk`,
      ]);
    } else reasons.push(["neutral", `RSI ${r.toFixed(0)} — neutral momentum`]);

    score += p7 > 0 ? 1 : -1;
    reasons.push([
      p7 > 0 ? "up" : "down",
      `7-day momentum ${p7 > 0 ? "+" : ""}${p7.toFixed(1)}%`,
    ]);
    score += p30 > 0 ? 1 : -1;
    reasons.push([
      p30 > 0 ? "up" : "down",
      `30-day momentum ${p30 > 0 ? "+" : ""}${p30.toFixed(1)}%`,
    ]);

    const fgv = +fg.value;
    if (fgv <= 25) {
      score += 1;
      reasons.push([
        "up",
        `Fear & Greed ${fgv} (extreme fear) — contrarian buy zone`,
      ]);
    } else if (fgv >= 75) {
      score -= 1;
      reasons.push([
        "down",
        `Fear & Greed ${fgv} (extreme greed) — contrarian caution`,
      ]);
    } else
      reasons.push([
        "neutral",
        `Fear & Greed ${fgv} — ${fg.value_classification}`,
      ]);

    return {
      coin,
      last,
      r,
      sma20,
      sma50,
      p7,
      p30,
      score,
      reasons,
      sig: signalOf(score),
    };
  }

  function resultCard(a) {
    const [label, cls] = a.sig;
    const conf = Math.min(100, (Math.abs(a.score) / 8) * 100);
    return `<div class="card">
      <div class="coin-head">
        <img class="coin-lg" src="${a.coin.image.large}">
        <div><h2>${a.coin.name} <span class="muted">${a.coin.symbol.toUpperCase()}</span></h2>
        <div class="coin-price"><span class="tag ${cls}" style="font-size:14px;padding:6px 14px">${label}</span>
        <span class="muted small ml">Weaver score ${a.score > 0 ? "+" : ""}${a.score}/8 · confidence ${conf.toFixed(0)}%</span></div></div>
      </div>
      <div class="meter-bar mt"><div style="width:${conf}%"></div></div>
      <div class="cards mt">
        <div class="card stat"><div class="stat-label">RSI (14)</div><div class="stat-big">${a.r.toFixed(0)}</div></div>
        <div class="card stat"><div class="stat-label">SMA 20 / 50</div><div class="stat-big small">${W.fmt.price(a.sma20)} / ${W.fmt.price(a.sma50)}</div></div>
        <div class="card stat"><div class="stat-label">Price</div><div class="stat-big">${W.fmt.price(a.last)}</div></div>
      </div>
      <ul class="tx-list">${a.reasons.map(([t, txt]) => `<li><span class="tag ${t === "up" ? "buy" : t === "down" ? "sell" : "neutral"}">${t === "up" ? "＋" : t === "down" ? "−" : "•"}</span> ${txt}</li>`).join("")}</ul>
      <div class="ai-brief mt">🤖 <b>Weaver:</b> ${advice(label)} <span class="muted small">Rule-based technical analysis — not financial advice.</span></div>
    </div>`;
  }

  async function render(view) {
    view.innerHTML = `
      <div class="card">
        <h3>⚡ AI Trading Assistant</h3>
        <p class="muted small">RSI-14 + SMA 20/50 trend + momentum + Fear&Greed contrarian filter → Weaver Score → signal.</p>
        <div class="qa mt"><div id="t-picker" style="min-width:260px"></div><button class="btn primary" id="t-go">Analyze</button></div>
        <div class="qa mt" id="t-quick"></div>
      </div>
      <div id="t-result"></div>
      <div class="card"><h3>📡 Holdings Signals (auto-scan)</h3><div id="t-hold">${W.ui.spinner()}</div></div>`;

    let picked = null;
    W.ui.coinPicker(view.querySelector("#t-picker"), (p) => (picked = p));
    const run = (id) => {
      view.querySelector("#t-result").innerHTML = W.ui.spinner();
      W.api
        .fearGreed()
        .then((fg) => analyze(id, fg))
        .then(
          (a) => (view.querySelector("#t-result").innerHTML = resultCard(a)),
        )
        .catch(
          (e) =>
            (view.querySelector("#t-result").innerHTML =
              `<p class="muted">${e.message}</p>`),
        );
    };
    view.querySelector("#t-go").onclick = () => {
      if (!picked) return W.ui.toast("Pick a coin", "warn");
      run(picked.id);
    };

    const quick = [
      "bitcoin",
      "ethereum",
      "solana",
      ...W.portfolio
        .all()
        .slice(0, 3)
        .map((h) => h.coinId),
    ];
    view.querySelector("#t-quick").innerHTML = [...new Set(quick)]
      .map((id) => `<button class="chip" data-q="${id}">${id}</button>`)
      .join("");
    view
      .querySelectorAll("[data-q]")
      .forEach((b) => (b.onclick = () => run(b.dataset.q)));

    /* holdings auto-scan */
    try {
      const fg = await W.api.fearGreed();
      if (!view.isConnected) return;
      const holds = W.portfolio.all().slice(0, 5);
      if (!holds.length) {
        view.querySelector("#t-hold").innerHTML =
          '<p class="muted small">No holdings yet.</p>';
        return;
      }
      const res = (
        await Promise.allSettled(holds.map((h) => analyze(h.coinId, fg)))
      )
        .filter((r) => r.status === "fulfilled")
        .map((r) => r.value);
      view.querySelector("#t-hold").innerHTML = `<div class="table-wrap"><table>
        <thead><tr><th>Asset</th><th>Signal</th><th>RSI</th><th>Trend</th><th>Weaver says</th></tr></thead>
        <tbody>${res
          .map(
            (a) => `<tr>
          <td class="coin-cell"><img src="${a.coin.image.small}"><b>${a.coin.name}</b></td>
          <td><span class="tag ${a.sig[1]}">${a.sig[0]}</span></td>
          <td>${a.r.toFixed(0)}</td>
          <td>${a.last > a.sma50 ? '<span class="up">Above SMA50</span>' : '<span class="down">Below SMA50</span>'}</td>
          <td class="muted small">${advice(a.sig[0])}</td></tr>`,
          )
          .join("")}</tbody></table></div>`;
    } catch (e) {
      view.querySelector("#t-hold").innerHTML =
        `<p class="muted small">${e.message}</p>`;
    }
  }

  return { render };
})();
