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

  const FEEDS = [
    ["CoinDesk", "https://www.coindesk.com/arc/outboundfeeds/rss/"],
    ["Cointelegraph", "https://cointelegraph.com/rss"],
    ["Decrypt", "https://decrypt.co/feed"],
  ];

  const ago = (t) => {
    if (!t) return "";
    const s = (Date.now() - t * 1000) / 1000;
    if (s < 3600) return Math.max(1, Math.floor(s / 60)) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago";
    return Math.floor(s / 86400) + "d ago";
  };

  const readList = () => W.store.get("news-read", []);
  const markRead = (id) => {
    const l = readList();
    if (!l.includes(id)) {
      l.unshift(id);
      W.store.set("news-read", l.slice(0, 400));
      if (W.achievements) W.achievements.check();
    }
  };
  const savedList = () => W.store.get("news-saved", []);
  const isSaved = (id) => savedList().some((x) => x.id === id);
  const toggleSave = (item) => {
    const l = savedList();
    if (l.some((x) => x.id === item.id)) {
      W.store.set(
        "news-saved",
        l.filter((x) => x.id !== item.id),
      );
      W.ui.toast("Removed from Reading List", "info");
      return false;
    }
    l.unshift(item);
    W.store.set("news-saved", l.slice(0, 100));
    W.ui.toast("🔖 Saved for later", "ok");
    return true;
  };

  const PROX = [
    (u) => u,
    (u) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
    (u) => "https://corsproxy.io/?url=" + encodeURIComponent(u),
    (u) => "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(u),
  ];
  async function via(url, asJSON) {
    let lastErr;
    for (const w of PROX) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 9000);
      try {
        const r = await fetch(w(url), { signal: ctrl.signal });
        if (!r.ok) throw new Error("HTTP " + r.status);
        const txt = await r.text();
        clearTimeout(t);
        return asJSON ? JSON.parse(txt) : txt;
      } catch (e) {
        lastErr = e;
        clearTimeout(t);
      }
    }
    throw lastErr || new Error("unreachable");
  }

  const apiNews = () =>
    via("https://min-api.cryptocompare.com/data/v2/news/?lang=EN", true).then(
      (d) =>
        (d.Data || []).map((n) => ({
          id: "cc" + n.id,
          title: n.title,
          url: n.url,
          image: n.imageurl,
          source: n.source || "CryptoCompare",
          published_on: n.published_on,
          body: n.body || "",
        })),
    );

  async function rssNews() {
    const all = [];
    await Promise.allSettled(
      FEEDS.map(async (pair) => {
        const name = pair[0],
          url = pair[1];
        const txt = await via(url, false);
        const xml = new DOMParser().parseFromString(txt, "text/xml");
        xml.querySelectorAll("item").forEach((it) => {
          const desc =
            (it.querySelector("description") || {}).textContent || "";
          const tmp = new DOMParser().parseFromString(desc, "text/html");
          all.push({
            id: (
              (it.querySelector("guid") || {}).textContent ||
              (it.querySelector("link") || {}).textContent ||
              name + all.length
            ).slice(0, 200),
            title: (it.querySelector("title") || {}).textContent || "Untitled",
            url: (it.querySelector("link") || {}).textContent || "#",
            image:
              (it.querySelector("enclosure") || {}).getAttribute("url") ||
              (it.querySelector("media\\:thumbnail") || {}).getAttribute(
                "url",
              ) ||
              (tmp.querySelector("img") || {}).src ||
              "",
            source: name,
            published_on:
              Date.parse(
                (it.querySelector("pubDate") || {}).textContent || "",
              ) / 1000,
            body: tmp.textContent.trim(),
          });
        });
      }),
    );
    return all;
  }
  function topThemes(items) {
    const freq = {};
    items.slice(0, 20).forEach((i) =>
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
        .map((w) => "“" + w[0] + "”")
        .join(", ") || "—"
    );
  }

  function summarize(n) {
    const text = (n.body || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!text)
      return (
        "No inline body — headline reads <b>" +
        sentiment(n.title) +
        "</b>. Use the source link for the full story."
      );
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const freq = {};
    (n.title.toLowerCase().match(/[a-z]{4,}/g) || []).forEach(
      (w) => (freq[w] = (freq[w] || 0) + 1),
    );
    const top = sentences
      .map((snt, i) => ({
        snt: snt,
        i: i,
        sc:
          snt
            .toLowerCase()
            .split(/[^a-z]+/)
            .reduce((a, w) => a + (freq[w] || 0), 0) / Math.pow(i + 1, 0.3),
      }))
      .sort((a, b) => b.sc - a.sc)
      .slice(0, 2)
      .sort((a, b) => a.i - b.i)
      .map((x) => x.snt.trim());
    return (
      top.join(" ") +
      ' <span class="muted small">(key sentences auto-extracted)</span>'
    );
  }

  let ITEMS = [],
    refreshList = null;

  function openReader(n) {
    markRead(n.id);
    const s = sentiment(n.title + " " + (n.body || ""));
    const paras = (n.body || "")
      .split(/\n+|<\/p>/)
      .map((p) => p.replace(/<[^>]+>/g, "").trim())
      .filter((p) => p.length > 40);
    const m = W.ui.modal({
      title:
        '<span class="tag rank">' +
        n.source +
        '</span> <span class="muted small">' +
        ago(n.published_on) +
        "</span>",
      body:
        '<div class="reader">' +
        (n.image
          ? '<img class="reader-hero" src="' +
            n.image +
            '" onerror="this.remove()">'
          : "") +
        '<h2 class="reader-title">' +
        n.title +
        "</h2>" +
        '<div class="reader-meta"><span class="tag ' +
        s +
        '">' +
        s +
        '</span><span class="muted small">' +
        n.source +
        "</span></div>" +
        '<div class="ai-brief">🤖 <b>Weaver brief:</b> ' +
        summarize(n) +
        "</div>" +
        '<div class="mt">' +
        (paras
          .slice(0, 8)
          .map((p) => "<p>" + p + "</p>")
          .join("") ||
          '<p class="muted">No inline content for this one — jump to the source below.</p>') +
        "</div>" +
        '<div class="qa mt"><a class="btn primary" target="_blank" href="' +
        n.url +
        '">Read full article ↗</a>' +
        '<button class="btn" id="r-save">' +
        (isSaved(n.id) ? "🔖 Saved — remove" : "🔖 Save for later") +
        "</button></div>" +
        "</div>",
    });
    m.el.classList.add("wide");
    m.el.querySelector("#r-save").onclick = (e) => {
      const on = toggleSave(n);
      e.target.textContent = on ? "🔖 Saved — remove" : "🔖 Save for later";
      if (refreshList) refreshList();
    };
    if (refreshList) refreshList();
  }

  async function render(view) {
    view.innerHTML =
      '<div class="card"><h3>📰 Newsroom</h3>' +
      '<div class="watch-head"><div class="qa" id="n-filters"></div><span class="muted small" id="n-readcount"></span></div>' +
      '<div id="n-brief" class="mt"></div></div>' +
      '<div id="n-list">' +
      W.ui.spinner() +
      "</div>";

    const results = await Promise.allSettled([apiNews(), rssNews()]);
    ITEMS = [];
    results.forEach((r) => {
      if (r.status === "fulfilled") ITEMS = ITEMS.concat(r.value);
    });
    ITEMS = ITEMS.filter((i) => i.title).sort(
      (a, b) => (b.published_on || 0) - (a.published_on || 0),
    );
    const seen = new Set();
    ITEMS = ITEMS.filter((i) => {
      const k = i.title.toLowerCase().slice(0, 60);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    if (ITEMS.length) W.store.set("news-cache", ITEMS.slice(0, 60));
    else {
      ITEMS = W.store.get("news-cache", []);
      if (ITEMS.length)
        view.querySelector("#n-brief").innerHTML =
          '<div class="ai-brief">📡 Live news sources unreachable right now — showing your last cached feed.</div>';
    }
    if (!ITEMS.length) {
      view.querySelector("#n-list").innerHTML = W.ui.empty(
        "📰",
        "Couldn't load news",
        "Check your connection — and run the app via http://localhost:8000 instead of file://",
      );
      return;
    }

    const counts = { bullish: 0, bearish: 0, neutral: 0 };
    ITEMS.forEach((i) => counts[sentiment(i.title)]++);
    const mood =
      counts.bullish > counts.bearish
        ? "leaning bullish 📈"
        : counts.bearish > counts.bullish
          ? "leaning bearish 📉"
          : "mixed / neutral ⚖️";
    if (!view.querySelector("#n-brief").innerHTML)
      view.querySelector("#n-brief").innerHTML =
        '<div class="ai-brief">🤖 <b>Weaver News Brief:</b> scanned ' +
        ITEMS.length +
        " articles from " +
        new Set(ITEMS.map((i) => i.source)).size +
        " sources — tone is <b>" +
        mood +
        "</b> (" +
        counts.bullish +
        " bullish · " +
        counts.bearish +
        " bearish · " +
        counts.neutral +
        " neutral). Top themes: " +
        topThemes(ITEMS) +
        ".</div>";

    let filter = "All";
    const drawFilters = () => {
      const sources = ["All", "Saved"].concat(
        Array.from(new Set(ITEMS.map((i) => i.source))),
      );
      view.querySelector("#n-filters").innerHTML = sources
        .map(
          (s) =>
            '<button class="chip ' +
            (s === filter ? "active" : "") +
            '" data-s="' +
            s +
            '">' +
            (s === "Saved" ? "🔖 Saved (" + savedList().length + ")" : s) +
            "</button>",
        )
        .join("");
      view.querySelectorAll("[data-s]").forEach(
        (c) =>
          (c.onclick = () => {
            filter = c.dataset.s;
            drawFilters();
            drawList();
          }),
      );
    };

    const drawList = () => {
      view.querySelector("#n-readcount").textContent =
        "📖 " + readList().length + " read";
      let list;
      if (filter === "Saved")
        list = savedList()
          .slice()
          .sort((a, b) => (b.published_on || 0) - (a.published_on || 0));
      else if (filter === "All") list = ITEMS.slice(0, 30);
      else list = ITEMS.filter((i) => i.source === filter).slice(0, 30);

      if (!list.length) {
        view.querySelector("#n-list").innerHTML = W.ui.empty(
          "🔖",
          "Nothing here yet",
          "Tap 🔖 on any article to save it for later",
        );
        return;
      }

      view.querySelector("#n-list").innerHTML = list
        .map((n, k) => {
          const s = sentiment(n.title),
            read = readList().includes(n.id),
            saved = isSaved(n.id);
          return (
            '<div class="card news-card ' +
            (read ? "read" : "") +
            '" data-k="' +
            k +
            '">' +
            (n.image
              ? '<img src="' + n.image + '" onerror="this.remove()">'
              : "") +
            '<div style="flex:1"><div class="news-title">' +
            n.title +
            "</div>" +
            '<div class="muted small">' +
            n.source +
            " · " +
            ago(n.published_on) +
            "</div>" +
            '<span class="tag ' +
            s +
            '">' +
            s +
            "</span>" +
            (read ? '<span class="tag buy">✓ read</span>' : "") +
            (saved ? '<span class="tag rank">🔖 saved</span>' : "") +
            "</div>" +
            '<div style="display:flex;flex-direction:column;gap:6px">' +
            '<button class="icon-btn ' +
            (saved ? "save-on" : "") +
            '" data-save="' +
            k +
            '" title="Save for later">🔖</button>' +
            '<button class="icon-btn" data-ext="' +
            k +
            '" title="Open original">↗</button></div></div>'
          );
        })
        .join("");

      view.querySelectorAll(".news-card").forEach(
        (c) =>
          (c.onclick = (e) => {
            if (
              e.target.closest("[data-ext]") ||
              e.target.closest("[data-save]")
            )
              return;
            openReader(list[+c.dataset.k]);
          }),
      );
      view.querySelectorAll("[data-ext]").forEach(
        (b) =>
          (b.onclick = (e) => {
            e.stopPropagation();
            window.open(list[+b.dataset.ext].url, "_blank");
          }),
      );
      view.querySelectorAll("[data-save]").forEach(
        (b) =>
          (b.onclick = (e) => {
            e.stopPropagation();
            toggleSave(list[+b.dataset.save]);
            drawFilters();
            drawList();
          }),
      );
    };

    refreshList = () => {
      drawFilters();
      drawList();
    };
    drawFilters();
    drawList();
  }

  return { render };
})();
