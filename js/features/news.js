// ===============================================================
//                  News Module — Graceful Degradation & Provenance
// ===============================================================
// §3.4: Never shows a blank screen. Falls back to snapshot on failure.
// §2.7: Preserves and displays the source of every article.
// §5.3: Calm, professional visual language.
// SECURITY: All RSS-derived content is escaped before DOM insertion.
// ===============================================================

window.W = window.W || {};

W.news = (() => {
  const newsLog = (msg, data) => {
    console.log(`[News] ${msg}`, data || "");
  };

  // ── RSS Feeds ──────────────────────────────────────────────────
  const FEEDS = [
    ["CoinDesk", "https://www.coindesk.com/arc/outboundfeeds/rss/"],
    ["Cointelegraph", "https://cointelegraph.com/rss"],
    ["Decrypt", "https://decrypt.co/feed"],
  ];

  // ── Fixed snapshot URLs (used only if live feeds fail) ─────────
  const SNAPSHOT_URLS = [
    "data/news.json",
    "https://ibis01.github.io/weaver/data/news.json",
  ];

  // ── Weaver proxy route ─────────────────────────────────────────
  const PROX = [
    (u) =>
      "https://weaver-proxy.ibis01-weaver.workers.dev/proxy?url=" +
      encodeURIComponent(u),
    (u) => u, // Direct fallback (rarely works for RSS due to CORS, but safe to try)
  ];

  // ── Fetch with proxy fallback ──────────────────────────────────
  async function via(url, asJSON = false) {
    let lastErr = null;
    for (const buildProxy of PROX) {
      const proxyUrl = buildProxy(url);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 9000);
      try {
        const requestOptions = {
          signal: controller.signal,
          headers: { "User-Agent": "Mozilla/5.0 (compatible; WeaverBot/1.0)" },
        };
        const resp = W.requestGuard
          ? await W.requestGuard.fetch(proxyUrl, requestOptions, {
              capacity: 6,
              refillMs: 10000,
              failureThreshold: 4,
              cooldownMs: 30000,
            })
          : await fetch(proxyUrl, requestOptions);
        clearTimeout(timeout);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const text = await resp.text();

        // Guard: if we asked for RSS and got HTML, this proxy failed.
        if (
          !asJSON &&
          text.trim().startsWith("<") &&
          !text.includes("<rss") &&
          !text.includes("<feed")
        ) {
          throw new Error("HTML response (not RSS)");
        }

        return asJSON ? JSON.parse(text) : text;
      } catch (err) {
        clearTimeout(timeout);
        lastErr = err;
      }
    }
    throw lastErr || new Error("All proxies failed");
  }

  // ── Fetch the fixed snapshot directly (no proxy chain) ─────────
  async function fetchSnapshot() {
    const embedded = window.__WEAVER_NEWS_SNAPSHOT__;
    if (Array.isArray(embedded) && embedded.length) return embedded;

    for (const snapshotUrl of SNAPSHOT_URLS) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const resp = await fetch(snapshotUrl, { signal: controller.signal });
        clearTimeout(timeout);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        const articles = Array.isArray(data) ? data : data?.Data;
        if (Array.isArray(articles) && articles.length) return articles;
      } catch (e) {
        newsLog(`Snapshot failed (${snapshotUrl}): ${e.message}`);
      }
    }
    return [];
  }

  // ── Parse RSS XML ──────────────────────────────────────────────
  function parseRSS(xml, sourceName) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "text/xml");

    if (doc.querySelector("parsererror")) {
      throw new Error("Invalid XML");
    }

    const items = doc.querySelectorAll("item");
    const articles = [];
    items.forEach((item) => {
      const title = item.querySelector("title")?.textContent || "Untitled";
      const link = item.querySelector("link")?.textContent || "#";
      const description = item.querySelector("description")?.textContent || "";
      const pubDate = item.querySelector("pubDate")?.textContent || "";

      // Strip HTML tags that some feeds embed in description
      const plainDesc = description.replace(/<[^>]+>/g, "").trim();

      articles.push({
        source: sourceName, // §2.7: Preserve provenance
        title,
        link,
        description: plainDesc,
        pubDate,
      });
    });
    return articles;
  }

  // ── Deduplicate and sort articles by date ──────────────────────
  function dedupeAndSort(articles) {
    const seen = new Set();
    const unique = [];
    for (const a of articles) {
      const key = a.link || a.title;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(a);
    }
    return unique.sort((a, b) => {
      const ta = Date.parse(a.pubDate) || 0;
      const tb = Date.parse(b.pubDate) || 0;
      return tb - ta; // Newest first
    });
  }

  // ── Render articles into a specific container ──────────────────
  function renderArticles(container, articles) {
    if (!container) return;
    if (!articles || articles.length === 0) {
      container.innerHTML = '<div class="info">No articles available.</div>';
      return;
    }

    const esc = W.fmt?.escapeHTML || ((s) => String(s ?? ""));
    const safeHref = (value) => {
      try {
        const url = new URL(String(value || ""), window.location.href);
        return ["http:", "https:"].includes(url.protocol) ? url.href : "#";
      } catch {
        return "#";
      }
    };

    const formatDate = (dateStr) => {
      if (!dateStr) return "";
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    };

    const items = articles
      .slice(0, 30)
      .map((a) => {
        const safeTitle = esc(a.title);
        const safeLink = esc(safeHref(a.link));
        const safeDesc = esc(a.description || "");
        const safeDate = formatDate(a.pubDate);
        const safeSource = esc(a.source || "Unknown Source");

        return `
        <div class="news-item">
          <h3><a href="${safeLink}" target="_blank" rel="noopener noreferrer">${safeTitle}</a></h3>
          <p>${safeDesc ? safeDesc.substring(0, 200) + "…" : ""}</p>
          <small>${safeSource} · ${safeDate}</small>
        </div>
      `;
      })
      .join("");

    container.innerHTML = `<div class="news-list">${items}</div>`;
  }

  // ════════════════════════════════════════════════════════════════
  //         render(view) — called by the router
  // ════════════════════════════════════════════════════════════════
  async function render(view) {
    const routeAtStart = location.hash;
    const isCurrentRoute = () =>
      location.hash === routeAtStart && view.dataset.route === "news";

    // 1. Build the page structure
    view.innerHTML = `
      <div class="card">
        <h3>📰 Crypto News</h3>
        <p class="muted small">Top stories from the crypto ecosystem. Data is fetched via secure proxy.</p>
      </div>
      <div id="news-container" class="mt-16"></div>
    `;

    const container = view.querySelector("#news-container");
    if (!container) return;

    // 2. Show immediate fallback if available
    const embeddedSnapshot = dedupeAndSort(
      window.__WEAVER_NEWS_SNAPSHOT__ || [],
    );
    if (embeddedSnapshot.length) {
      renderArticles(container, embeddedSnapshot);
    } else {
      container.innerHTML = '<div class="loading">Loading news...</div>';
    }

    try {
      // 3. Fetch live feeds in parallel
      const feedPromises = FEEDS.map(async ([name, url]) => {
        try {
          const xml = await via(url);
          return { name, articles: parseRSS(xml, name), error: null };
        } catch (err) {
          newsLog(`Failed to fetch ${name}:`, err.message);
          return { name, articles: [], error: err.message };
        }
      });

      const results = await Promise.all(feedPromises);
      if (!isCurrentRoute()) return; // User navigated away

      const allArticles = dedupeAndSort(results.flatMap((r) => r.articles));

      if (allArticles.length > 0) {
        W.dataHealth?.mark?.("news", {
          source: "rss",
          observedAt: Date.now(),
          staleAfter: 60 * 60 * 1000, // 1 hour
        });
        renderArticles(container, allArticles);
      } else {
        // 4. Final fallback to snapshot if all live feeds failed
        newsLog("No live articles, falling back to snapshot...");
        const snapshot = embeddedSnapshot.length
          ? embeddedSnapshot
          : await fetchSnapshot();

        if (snapshot.length) {
          W.dataHealth?.mark?.("news", {
            source: "snapshot",
            observedAt: Date.now() - 31 * 60 * 1000,
            staleAfter: 60 * 60 * 1000,
          });
          renderArticles(container, snapshot);
        } else {
          container.innerHTML =
            '<div class="error">Could not load news. Try again later.</div>';
        }
      }
    } catch (err) {
      console.error("[News] Render error:", err);
      const msg = W.fmt?.escapeHTML?.(err.message) || "unknown error";
      container.innerHTML = `<div class="error">Failed to load news: ${msg}</div>`;
    }
  }

  return { render };
})();

console.log("[News] Module loaded (Graceful Degradation & Provenance).");
