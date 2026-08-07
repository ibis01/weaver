window.W = window.W || {};

W.news = (() => {
  const BULL = [
    "surge",
    "rally",
    "soar",
    "gain",
    "bull",
    "record",
    "adopt",
    "approve",
    "approval",
    "etf",
    "partnership",
    "breakout",
    "upgrade",
    "boost",
    "win",
    "rise",
    "jump",
    "growth",
    "institutional",
  ];
  const BEAR = [
    "crash",
    "dump",
    "fall",
    "plunge",
    "bear",
    "hack",
    "exploit",
    "scam",
    "ban",
    "lawsuit",
    "sues",
    "sell-off",
    "tumble",
    "drop",
    "fear",
    "liquidation",
    "fraud",
    "bankrupt",
  ];

  const sentiment = (text) => {
    const t = text.toLowerCase();
    let s = 0;
    BULL.forEach((w) => {
      if (t.includes(w)) s++;
    });
    BEAR.forEach((w) => {
      if (t.includes(w)) s--;
    });
    return s > 0 ? "bullish" : s < 0 ? "bearish" : "neutral";
  };

  async function render(view) {
    view.innerHTML = `<div class="card"><h3>📰 News & Market Sentiment</h3><div id="n-brief"></div></div><div id="n-list">${W.ui.spinner()}</div>`;
    try {
      const items = await W.api.news();
      const counts = { bullish: 0, bearish: 0, neutral: 0 };
      items.forEach((i) => counts[sentiment(i.title)]++);
      const mood =
        counts.bullish > counts.bearish
          ? "leaning bullish 📈"
          : counts.bearish > counts.bullish
            ? "leaning bearish 📉"
            : "mixed / neutral ⚖️";
      view.querySelector("#n-brief").innerHTML =
        `<div class="ai-brief">🤖 <b>Weaver News Brief:</b> scanned the ${items.length} latest headlines — market tone is <b>${mood}</b> (${counts.bullish} bullish · ${counts.bearish} bearish · ${counts.neutral} neutral). Top themes: ${topThemes(items)}.</div>`;
      view.querySelector("#n-list").innerHTML = items
        .slice(0, 20)
        .map((n) => {
          const s = sentiment(n.title);
          return `<a class="card news-card" href="${n.url}" target="_blank">
          ${n.imageurl ? `<img src="${n.imageurl}" onerror="this.remove()">` : ""}
          <div><div class="news-title">${n.title}</div>
          <div class="muted small">${n.source} · ${new Date(n.published_on * 1000).toLocaleString()}</div>
          <span class="tag ${s}">${s}</span></div></a>`;
        })
        .join("");
    } catch (e) {
      view.querySelector("#n-list").innerHTML =
        `<p class="muted">Couldn't load news: ${e.message}</p>`;
    }
  }

  function topThemes(items) {
    const freq = {};
    items.slice(0, 15).forEach((i) =>
      i.title
        .toLowerCase()
        .replace(/[^a-z ]/g, "")
        .split(" ")
        .forEach((w) => {
          if (w.length > 5) freq[w] = (freq[w] || 0) + 1;
        }),
    );
    return (
      Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([w]) => `“${w}”`)
        .join(", ") || "—"
    );
  }

  return { render };
})();
