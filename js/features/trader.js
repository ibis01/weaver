// ================================================================
// js/features/trader.js – AI Trading Assistant
// ================================================================

window.W = window.W || {};

W.trader = (() => {
  // ── Helpers: Technical Indicators ─────────────────────

  // Simple Moving Average
  function sma(data, period) {
    const result = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        result.push(null);
      } else {
        const slice = data.slice(i - period + 1, i + 1);
        const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
        result.push(avg);
      }
    }
    return result;
  }

  // Relative Strength Index (RSI)
  function rsi(data, period = 14) {
    const result = new Array(data.length).fill(null);
    let gain = 0,
      loss = 0;

    // First calculate initial average gain/loss
    for (let i = 1; i <= period; i++) {
      const diff = data[i] - data[i - 1];
      if (diff >= 0) gain += diff;
      else loss += Math.abs(diff);
    }
    gain /= period;
    loss /= period;
    if (gain + loss === 0) return result;
    result[period] = 100 - 100 / (1 + gain / loss);

    // Smooth with Wilder's method
    for (let i = period + 1; i < data.length; i++) {
      const diff = data[i] - data[i - 1];
      if (diff >= 0) {
        gain = (gain * (period - 1) + diff) / period;
        loss = (loss * (period - 1)) / period;
      } else {
        gain = (gain * (period - 1)) / period;
        loss = (loss * (period - 1) + Math.abs(diff)) / period;
      }
      if (gain + loss === 0) {
        result[i] = 50;
      } else {
        result[i] = 100 - 100 / (1 + gain / loss);
      }
    }
    return result;
  }

  // ── Signal Engine ─────────────────────────────────────

  function signalOf(score) {
    if (score >= 4) return ["STRONG BUY", "buy"];
    if (score >= 2) return ["BUY", "buy"];
    if (score <= -4) return ["STRONG SELL", "sell"];
    if (score <= -2) return ["SELL", "sell"];
    return ["HOLD", "neutral"];
  }

  function advice(label) {
    const map = {
      "STRONG BUY": "Deep value zone — DCA-friendly for long-term holders.",
      BUY: "Constructive setup — accumulating is reasonable.",
      HOLD: "No statistical edge right now — hold and wait.",
      SELL: "Consider taking partial profits / tightening stops.",
      "STRONG SELL": "Risk-off — review position size seriously.",
    };
    return map[label] || "No clear signal.";
  }

  // ── Main Analysis Function ────────────────────────────

  async function analyze(id, fg) {
    if (!id) throw new Error("No coin ID provided");
    if (!fg) throw new Error("No Fear & Greed data provided");

    // Fetch coin data and chart
    const [coin, chart] = await Promise.all([
      W.api.coin(id),
      W.api.chart(id, 90),
    ]);

    if (!coin || !chart) throw new Error("No data available for this coin");

    // Extract prices
    const prices = (chart.prices || []).map((p) => p[1]);
    if (prices.length < 50) {
      throw new Error("Insufficient historical data for analysis");
    }

    const last = prices[prices.length - 1];

    // ── Indicators ──────────────────────────────────────
    const sma20 = sma(prices, 20);
    const sma50 = sma(prices, 50);
    const rsiValues = rsi(prices, 14);

    const currentSMA20 = sma20[sma20.length - 1];
    const currentSMA50 = sma50[sma50.length - 1];
    const currentRSI = rsiValues[rsiValues.length - 1] ?? 50;

    const md = coin.market_data || {};
    const p7 = md.price_change_percentage_7d ?? 0;
    const p30 = md.price_change_percentage_30d ?? 0;

    // ── Scoring ──────────────────────────────────────────
    let score = 0;
    const reasons = [];

    // 1. Trend: price vs SMA20 vs SMA50
    if (last > currentSMA20 && currentSMA20 > currentSMA50) {
      score += 2;
      reasons.push([
        "up",
        "Uptrend — price > SMA20 > SMA50 (bullish alignment)",
      ]);
    } else if (last > currentSMA50) {
      score += 1;
      reasons.push(["up", "Price holding above the 50-day average"]);
    } else if (last < currentSMA20 && currentSMA20 < currentSMA50) {
      score -= 2;
      reasons.push([
        "down",
        "Downtrend — price < SMA20 < SMA50 (bearish alignment)",
      ]);
    } else if (last < currentSMA50) {
      score -= 1;
      reasons.push(["down", "Price below the 50-day average"]);
    } else {
      reasons.push(["neutral", "Price trading near key moving averages"]);
    }

    // 2. RSI
    if (currentRSI < 30) {
      score += 2;
      reasons.push([
        "up",
        `RSI ${currentRSI.toFixed(0)} — oversold, historically a buy zone`,
      ]);
    } else if (currentRSI > 70) {
      score -= 2;
      reasons.push([
        "down",
        `RSI ${currentRSI.toFixed(0)} — overbought, elevated pullback risk`,
      ]);
    } else if (currentRSI < 45) {
      score += 0.5;
      reasons.push([
        "neutral",
        `RSI ${currentRSI.toFixed(0)} — mildly oversold`,
      ]);
    } else if (currentRSI > 60) {
      score -= 0.5;
      reasons.push([
        "neutral",
        `RSI ${currentRSI.toFixed(0)} — mildly overbought`,
      ]);
    } else {
      reasons.push([
        "neutral",
        `RSI ${currentRSI.toFixed(0)} — neutral momentum`,
      ]);
    }

    // 3. 7‑day momentum
    if (p7 > 5) {
      score += 1;
      reasons.push(["up", `7-day momentum +${p7.toFixed(1)}% (strong)`]);
    } else if (p7 > 0) {
      score += 0.5;
      reasons.push(["up", `7-day momentum +${p7.toFixed(1)}%`]);
    } else if (p7 < -5) {
      score -= 1;
      reasons.push(["down", `7-day momentum ${p7.toFixed(1)}% (weak)`]);
    } else {
      reasons.push(["neutral", `7-day momentum ${p7.toFixed(1)}%`]);
    }

    // 4. 30‑day momentum
    if (p30 > 10) {
      score += 1;
      reasons.push(["up", `30-day momentum +${p30.toFixed(1)}% (strong)`]);
    } else if (p30 > 0) {
      score += 0.5;
      reasons.push(["up", `30-day momentum +${p30.toFixed(1)}%`]);
    } else if (p30 < -10) {
      score -= 1;
      reasons.push(["down", `30-day momentum ${p30.toFixed(1)}% (weak)`]);
    } else {
      reasons.push(["neutral", `30-day momentum ${p30.toFixed(1)}%`]);
    }

    // 5. Fear & Greed (contrarian)
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
    } else if (fgv <= 40) {
      score += 0.5;
      reasons.push(["neutral", `Fear & Greed ${fgv} — fear (cautious buying)`]);
    } else if (fgv >= 60) {
      score -= 0.5;
      reasons.push([
        "neutral",
        `Fear & Greed ${fgv} — greed (cautious selling)`,
      ]);
    } else {
      reasons.push([
        "neutral",
        `Fear & Greed ${fgv} — neutral ${fg.value_classification || ""}`,
      ]);
    }

    // ── Result ──────────────────────────────────────────
    const [signal, cssClass] = signalOf(score);
    const confidence = Math.min(100, (Math.abs(score) / 8) * 100);

    return {
      coin,
      last,
      currentRSI,
      currentSMA20,
      currentSMA50,
      p7,
      p30,
      score,
      reasons,
      signal,
      cssClass,
      confidence,
      advice: advice(signal),
    };
  }

  // ── UI: Result Card ───────────────────────────────────

  function resultCard(a) {
    const [label, cls] = [a.signal, a.cssClass];
    const conf = a.confidence;

    const reasonsHTML = a.reasons
      .map(([t, txt]) => {
        const emoji = t === "up" ? "＋" : t === "down" ? "−" : "•";
        const tagClass = t === "up" ? "buy" : t === "down" ? "sell" : "neutral";
        return `<li><span class="tag ${tagClass}">${emoji}</span> ${txt}</li>`;
      })
      .join("");

    return `
      <div class="card">
        <div class="coin-head">
          <img class="coin-lg" src="${a.coin.image?.large || ""}" alt="${a.coin.name}">
          <div>
            <h2>${a.coin.name} <span class="muted">${a.coin.symbol.toUpperCase()}</span></h2>
            <div class="coin-price">
              <span class="tag ${cls}" style="font-size:14px;padding:6px 14px;">${label}</span>
              <span class="muted small ml">Weaver score ${a.score > 0 ? "+" : ""}${a.score.toFixed(1)}/8 · confidence ${conf.toFixed(0)}%</span>
            </div>
          </div>
        </div>
        <div class="meter-bar mt"><div style="width:${conf}%; background: ${conf >= 70 ? "var(--up)" : conf >= 40 ? "var(--warn)" : "var(--down)"}; box-shadow: 0 0 20px ${conf >= 70 ? "var(--up)" : conf >= 40 ? "var(--warn)" : "var(--down)"};"></div></div>
        <div class="cards mt">
          <div class="card stat">
            <div class="stat-label">RSI (14)</div>
            <div class="stat-big">${a.currentRSI.toFixed(0)}</div>
          </div>
          <div class="card stat">
            <div class="stat-label">SMA 20 / 50</div>
            <div class="stat-big small">${W.fmt.price(a.currentSMA20)} / ${W.fmt.price(a.currentSMA50)}</div>
          </div>
          <div class="card stat">
            <div class="stat-label">Price</div>
            <div class="stat-big">${W.fmt.price(a.last)}</div>
          </div>
        </div>
        <ul class="tx-list">${reasonsHTML}</ul>
        <div class="ai-brief mt">
          🤖 <b>Weaver:</b> ${a.advice}
          <span class="muted small">Rule-based technical analysis — not financial advice.</span>
        </div>
      </div>
    `;
  }

  // ── Render ─────────────────────────────────────────────

  async function render(view) {
    if (!view) {
      console.warn("[Trader] No view element provided");
      return;
    }

    view.innerHTML = `
      <div class="card">
        <h3>⚡ AI Trading Assistant</h3>
        <p class="muted small">RSI-14 + SMA 20/50 trend + momentum + Fear&Greed contrarian filter → Weaver Score → signal.</p>
        <div class="qa mt">
          <div id="t-picker" style="min-width:260px;"></div>
          <button class="btn primary" id="t-go">Analyze</button>
        </div>
        <div class="qa mt" id="t-quick"></div>
      </div>
      <div id="t-result"></div>
      <div class="card">
        <h3>📡 Holdings Signals (auto-scan)</h3>
        <div id="t-hold">${W.ui.spinner()}</div>
      </div>
    `;

    // ── Coin picker ──────────────────────────────────────
    let picked = null;
    if (W.ui.coinPicker) {
      W.ui.coinPicker(view.querySelector("#t-picker"), (p) => (picked = p));
    } else {
      console.warn("[Trader] coinPicker not available");
    }

    // ── Run analysis for a coin ─────────────────────────
    const run = async (id) => {
      const resultContainer = view.querySelector("#t-result");
      if (!resultContainer) return;
      resultContainer.innerHTML = W.ui.spinner();

      try {
        const fg = await W.api.fearGreed();
        const result = await analyze(id, fg);
        resultContainer.innerHTML = resultCard(result);
      } catch (e) {
        resultContainer.innerHTML = `<p class="muted">${e.message}</p>`;
      }
    };

    // ── Go button ────────────────────────────────────────
    view.querySelector("#t-go").onclick = () => {
      if (!picked) return W.ui.toast("Pick a coin first", "warn");
      run(picked.id);
    };

    // ── Quick picks ──────────────────────────────────────
    const holdings = W.portfolio ? W.portfolio.all() : [];
    const quickIds = [
      "bitcoin",
      "ethereum",
      "solana",
      ...holdings.slice(0, 3).map((h) => h.coinId),
    ].filter((id, idx, arr) => arr.indexOf(id) === idx);

    const quickContainer = view.querySelector("#t-quick");
    if (quickContainer && quickIds.length) {
      quickContainer.innerHTML = quickIds
        .map((id) => `<button class="chip" data-q="${id}">${id}</button>`)
        .join("");
      quickContainer.querySelectorAll("[data-q]").forEach((btn) => {
        btn.onclick = () => run(btn.dataset.q);
      });
    }

    // ── Holdings auto-scan ──────────────────────────────
    try {
      const fg = await W.api.fearGreed();
      const holds = holdings.slice(0, 5);
      const holdContainer = view.querySelector("#t-hold");
      if (!holdContainer) return;

      if (!holds.length) {
        holdContainer.innerHTML = '<p class="muted small">No holdings yet.</p>';
        return;
      }

      const results = [];
      for (const h of holds) {
        try {
          const r = await analyze(h.coinId, fg);
          results.push(r);
        } catch (e) {
          console.warn("[Trader] Auto-scan error for", h.coinId, e);
        }
      }

      if (!results.length) {
        holdContainer.innerHTML =
          '<p class="muted small">Could not analyze holdings.</p>';
        return;
      }

      holdContainer.innerHTML = `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Asset</th>
                <th>Signal</th>
                <th>RSI</th>
                <th>Trend</th>
                <th>Weaver says</th>
              </tr>
            </thead>
            <tbody>
              ${results
                .map(
                  (a) => `
                <tr>
                  <td class="coin-cell">
                    <img src="${a.coin.image?.small || ""}" alt="${a.coin.name}" style="width:20px;height:20px;border-radius:50%;">
                    <b>${a.coin.name}</b>
                  </td>
                  <td><span class="tag ${a.cssClass}">${a.signal}</span></td>
                  <td>${a.currentRSI.toFixed(0)}</td>
                  <td>${a.last > a.currentSMA50 ? '<span class="up">Above SMA50</span>' : '<span class="down">Below SMA50</span>'}</td>
                  <td class="muted small">${a.advice}</td>
                </tr>
              `,
                )
                .join("")}
            </tbody>
          </table>
        </div>
      `;
    } catch (e) {
      const holdContainer = view.querySelector("#t-hold");
      if (holdContainer)
        holdContainer.innerHTML = `<p class="muted small">${e.message}</p>`;
    }
  }

  // ── Exports ────────────────────────────────────────────
  return {
    render,
    analyze,
    sma,
    rsi,
    signalOf,
    advice,
  };
})();

console.log("[Trader] Module loaded.");
