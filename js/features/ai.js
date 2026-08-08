window.W = window.W || {};

W.ai = (() => {
  const meter = (label, val) =>
    `<div class="meter"><div class="meter-label">${label} <b>${Math.round(val)}/100</b></div><div class="meter-bar"><div style="width:${Math.min(100, val)}%"></div></div></div>`;

  async function portfolioInsights() {
    const data = await W.dashboard.enrich();
    const rows = data.rows || [],
      totals = data.totals;
    if (!rows.length) return null;
    const top3 = rows.slice(0, 3).reduce((s, r) => s + r.value, 0);
    const concentration = totals.value ? (top3 / totals.value) * 100 : 0;
    const vol = rows.reduce((s, r) => s + Math.abs(r.p7 ?? 0), 0) / rows.length;
    const diversification = Math.min(
      100,
      rows.length * 12 + (100 - concentration) / 2,
    );
    const volScore = Math.min(100, vol * 4);
    const risk =
      concentration > 70 || volScore > 60
        ? "High"
        : concentration > 45 || volScore > 35
          ? "Medium"
          : "Low";
    const pnlTxt =
      totals.allTime >= 0
        ? `in profit (+${W.fmt.money(totals.allTime)})`
        : `at a loss (${W.fmt.money(totals.allTime)})`;
    const review = `Your portfolio of ${rows.length} asset${rows.length > 1 ? "s" : ""} is worth <b>${W.fmt.money(totals.value)}</b> and is currently ${pnlTxt}.
      Your top 3 positions make up ${concentration.toFixed(0)}% of the portfolio — ${concentration > 70 ? "this is very concentrated; consider diversifying to reduce single-asset risk." : concentration > 45 ? "moderately concentrated." : "nicely spread across assets."}
      Average 7-day swing across holdings is ${vol.toFixed(1)}%, giving a volatility score of ${volScore.toFixed(0)}/100. Overall risk level: <b>${risk}</b>.`;
    return { concentration, volScore, diversification, risk, review };
  }

  async function marketSummary() {
    const [g, fg, top] = await Promise.all([
      W.api.global(),
      W.api.fearGreed(),
      W.api.top(10),
    ]);
    const btc = g.data.market_cap_percentage.btc.toFixed(1);
    const movers = [...top].sort(
      (a, b) =>
        (b.price_change_percentage_24h_in_currency ?? 0) -
        (a.price_change_percentage_24h_in_currency ?? 0),
    );
    const best = movers[0],
      worst = movers[movers.length - 1];
    return `Total crypto market cap is <b>${W.fmt.money(g.data.total_market_cap[W.currency()], { compact: true })}</b> (${g.data.market_cap_change_percentage_24h_usd.toFixed(2)}% in 24h). Sentiment reads <b>${fg.value_classification}</b> (${fg.value}/100) and BTC dominance is ${btc}%. Among the top 10, ${best.name} leads (${(best.price_change_percentage_24h_in_currency ?? 0).toFixed(2)}%) while ${worst.name} lags (${(worst.price_change_percentage_24h_in_currency ?? 0).toFixed(2)}%).`;
  }

  async function ask(question) {
    const s = W.store.get("settings", {});
    if (s.aiKey && s.aiUrl) {
      try {
        const r = await fetch(s.aiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + s.aiKey,
          },
          body: JSON.stringify({
            model: s.aiModel || "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content:
                  "You are Weaver, a concise crypto assistant. Always note this is not financial advice.",
              },
              { role: "user", content: question },
            ],
          }),
        });
        const d = await r.json();
        return d.choices?.[0]?.message?.content || "No answer received.";
      } catch (e) {
        return "AI request failed: " + e.message;
      }
    }
    try {
      const coins = (
        await W.api.search(question.toLowerCase().replace(/[^a-z0-9 ]/g, ""))
      ).coins;
      if (coins.length) {
        const c = await W.api.coin(coins[0].id);
        const md = c.market_data;
        const cur = W.currency();
        return `📊 <b>${c.name}</b> is currently ${W.fmt.price(md.current_price[cur])} (rank #${c.market_cap_rank}), ${W.fmt.pct(md.price_change_percentage_24h)} in 24h, market cap ${W.fmt.money(md.market_cap[cur], { compact: true })}, all-time high ${W.fmt.price(md.ath[cur])}. ${(
          c.description?.en || ""
        )
          .replace(/<[^>]+>/g, " ")
          .split(". ")
          .slice(0, 2)
          .join(
            ". ",
          )}. <span class="muted small">— Add an AI API key in Settings for full conversational answers.</span>`;
      }
    } catch (e) {}
    return "I work best with live data! Mention a coin (e.g. “What is Solana?”), or add an AI API key in Settings for full conversational answers.";
  }

  async function render(view) {
    view.innerHTML = `
      <div class="grid-2">
        <div class="card"><h3>🤖 AI Portfolio Review</h3><div id="ai-review">${W.ui.spinner()}</div></div>
        <div class="card"><h3>🌍 AI Market Summary</h3><div id="ai-market">${W.ui.spinner()}</div></div>
      </div>
      <div class="card"><h3>🛡️ AI Risk Analysis</h3><div id="ai-risk">${W.ui.spinner()}</div></div>
      <div class="card"><h3>💬 Ask Weaver (AI Coin Explainer)</h3>
        <div class="ask-row"><input id="ai-q" class="input" placeholder='Try: "What is Ethereum?" or "Explain Solana"'><button class="btn primary" id="ai-go">Ask</button></div>
        <div id="ai-a" class="ai-answer hidden"></div>
      </div>`;

    try {
      const ins = await portfolioInsights();
      if (!ins) {
        view.querySelector("#ai-review").innerHTML =
          '<p class="muted">Add holdings to unlock your AI review.</p>';
        view.querySelector("#ai-risk").innerHTML =
          '<p class="muted">No data yet.</p>';
      } else {
        view.querySelector("#ai-review").innerHTML =
          `<div class="ai-brief">${ins.review}</div>`;
        view.querySelector("#ai-risk").innerHTML = `<div class="risk-grid">
          ${meter("Portfolio Concentration", ins.concentration)}
          ${meter("Volatility Score", ins.volScore)}
          ${meter("Diversification Score", ins.diversification)}
          <div>Risk Level: <b class="risk-${ins.risk.toLowerCase()}">${ins.risk}</b></div>
        </div>`;
      }
    } catch (e) {
      view.querySelector("#ai-review").innerHTML =
        `<p class="muted">${e.message}</p>`;
    }

    try {
      view.querySelector("#ai-market").innerHTML =
        `<div class="ai-brief">${await marketSummary()}</div>`;
    } catch (e) {
      view.querySelector("#ai-market").innerHTML =
        `<p class="muted">${e.message}</p>`;
    }

    view.querySelector("#ai-go").onclick = async () => {
      const q = view.querySelector("#ai-q").value.trim();
      if (!q) return;
      const box = view.querySelector("#ai-a");
      box.classList.remove("hidden");
      box.innerHTML = W.ui.spinner();
      box.innerHTML = `<div class="ai-brief">${await ask(q)}</div>`;
    };
    view.querySelector("#ai-q").addEventListener("keydown", (e) => {
      if (e.key === "Enter") view.querySelector("#ai-go").click();
    });
  }

  return { render, portfolioInsights };
})();
