// ===============================================================
//                  News Module — Graceful Degradation & CSP Compliant
// ===============================================================
// §3.4: Never shows blank screen. Shows error state if fetch fails.
// §2.7: Preserves source attribution for every article.
// §5.3: Calm visual language, ZERO inline styles.
// SECURITY: All RSS content escaped before DOM insertion.
// ===============================================================

window.W = window.W || {};

W.news = (() => {
  const newsLog = (msg, data) => {
    console.log(`[News] ${msg}`, data || "");
  };

  // ── RSS Feeds ─────────────────────────────────────────────────
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
  const PROXIES = [
    (u) =>
      `https://weaver-proxy.ibis01-weaver.workers.dev/proxy?url=${encodeURIComponent(u)}`,
    (u) => u, // Direct fallback (rarely works for RSS due to CORS)
  ];

  // ── Fetch with proxy fallback ─────────────────────────────────
  async function fetchViaProxy(url, asJSON = false) {
    let lastErr = null;

    for (const buildProxy of PROXIES) {
      const proxyUrl = buildProxy(url);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

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

        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`);
        }

        const text = await resp.text();

        // Guard: if we asked for RSS and got HTML, this proxy failed
        if (
          !asJSON &&
          text.trim().startsWith("<") &&
          !text.includes("<rss") &&
          !text.includes("<feed")
        ) {
          throw new Error("HTML response (not RSS)");
        }

        newsLog(`✅ Proxy succeeded: ${proxyUrl.substring(0, 60)}...`);
        return asJSON ? JSON.parse(text) : text;
      } catch (err) {
        clearTimeout(timeout);
        newsLog(`❌ Proxy failed: ${err.message}`);
        lastErr = err;
      }
    }

    console.error("[News] All proxies failed.", lastErr);
    throw lastErr || new Error("All proxies failed");
  }

  // ── Fetch the fixed snapshot directly (no proxy chain) ─────────
  async function fetchSnapshot() {
    const embedded = window.__WEAVER_NEWS_SNAPSHOT__;
    if (Array.isArray(embedded) && embedded.length) {
      newsLog("Using embedded snapshot");
      return embedded;
    }

    for (const snapshotUrl of SNAPSHOT_URLS) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const resp = await fetch(snapshotUrl, { signal: controller.signal });
        clearTimeout(timeout);

        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        const data = await resp.json();
        const articles = Array.isArray(data) ? data : data?.Data;

        if (Array.isArray(articles) && articles.length) {
          newsLog(`✅ Snapshot loaded: ${articles.length} articles`);
          return articles;
        }

        throw new Error("snapshot is empty");
      } catch (e) {
        newsLog(`Snapshot failed (${snapshotUrl}): ${e.message}`);
      }
    }

    return [];
  }

  // ── Parse RSS XML ──────────────────────────────────────────────
  function parseRSS(xml, sourceName) {
    try {
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
        const description =
          item.querySelector("description")?.textContent || "";
        const pubDate = item.querySelector("pubDate")?.textContent || "";

        // Strip HTML tags that some feeds embed in description
        const plainDesc = description.replace(/<[^>]+>/g, "").trim();

        articles.push({
          source: sourceName,
          title,
          link,
          description: plainDesc,
          pubDate,
        });
      });

      newsLog(`Parsed ${articles.length} articles from ${sourceName}`);
      return articles;
    } catch (err) {
      console.error(`[News] RSS parse error for ${sourceName}:`, err);
      return [];
    }
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

  // ── Render articles into container (ZERO inline styles) ───────
  function renderArticles(container, articles) {
    if (!container) {
      console.warn("[News] renderArticles: container is null");
      return;
    }

    if (!articles || articles.length === 0) {
      container.innerHTML = `
        <div class="card">
          <div class="empty text-center p-24">
            <div class="empty-icon mb-16">📰</div>
            <h3>No Articles Available</h3>
            <p class="muted small mt-8">We couldn't find any news articles right now.</p>
          </div>
        </div>
      `;
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
        const safeSource = esc(a.source || "Unknown");

        return `
        <article class="card mb-16">
          <h3 class="mb-8">
            <a href="${safeLink}" target="_blank" rel="noopener noreferrer" class="text-primary">
              ${safeTitle}
            </a>
          </h3>
          <p class="muted small mb-8">
            ${safeDesc ? safeDesc.substring(0, 200) + "…" : ""}
          </p>
          <small class="muted">${safeSource} · ${safeDate}</small>
        </article>
      `;
      })
      .join("");

    container.innerHTML = `<div class="news-list">${items}</div>`;
    newsLog(`Rendered ${articles.length} articles`);
  }

  // ── Show error state (ZERO inline styles) ─────────────────────
  function showError(container, message) {
    if (!container) return;
    container.innerHTML = `
      <div class="card">
        <div class="empty text-center p-24">
          <div class="empty-icon mb-16">📰</div>
          <h3>News Feed Unavailable</h3>
          <p class="muted small mt-8 mb-24">${W.fmt?.escapeHTML(message) || "We couldn't load the latest news right now."}</p>
          <button class="btn primary" id="news-retry">Try Again</button>
        </div>
      </div>
    `;

    const retryBtn = container.querySelector("#news-retry");
    if (retryBtn) {
      retryBtn.onclick = () => {
        newsLog("Retry clicked");
        render(container.closest(".app") || document.getElementById("view"));
      };
    }
  }

  // ════════════════════════════════════════════════════════════════
  //         render(view) — called by the router
  // ════════════════════════════════════════════════════════════════
  async function render(view) {
    newsLog("Render called");

    const routeAtStart = location.hash;
    const isCurrentRoute = () =>
      location.hash === routeAtStart && view.dataset.route === "news";

    // 1. Build the page structure
    view.innerHTML = `
      <div class="card">
        <h3>📰 Crypto News</h3>
        <p class="muted small mt-8">
          Top stories from the crypto ecosystem. Data is fetched via secure proxy.
        </p>
      </div>
      <div id="news-container" class="mt-16"></div>
    `;

    const container = view.querySelector("#news-container");
    if (!container) {
      console.error("[News] Container not found after rendering");
      return;
    }

    // Show loading state
    container.innerHTML =
      '<div class="loading text-center p-24 muted">Loading news...</div>';

    try {
      // 2. Try embedded snapshot first
      const embeddedSnapshot = dedupeAndSort(
        window.__WEAVER_NEWS_SNAPSHOT__ || [],
      );

      if (embeddedSnapshot.length) {
        newsLog(`Using ${embeddedSnapshot.length} embedded articles`);
        if (isCurrentRoute()) {
          renderArticles(container, embeddedSnapshot);
          W.dataHealth?.mark?.("news", {
            source: "embedded-snapshot",
            observedAt: Date.now() - 31 * 60 * 1000,
            staleAfter: 60 * 60 * 1000,
          });
        }
        return;
      }

      // 3. Try live feeds in parallel
      newsLog("Fetching live feeds...");
      const feedPromises = FEEDS.map(async ([name, url]) => {
        try {
          const xml = await fetchViaProxy(url);
          const articles = parseRSS(xml, name);
          return { name, articles, error: null };
        } catch (err) {
          newsLog(`Failed to fetch ${name}: ${err.message}`);
          return { name, articles: [], error: err.message };
        }
      });

      const results = await Promise.all(feedPromises);

      if (!isCurrentRoute()) {
        newsLog("User navigated away, aborting render");
        return;
      }

      const allArticles = dedupeAndSort(results.flatMap((r) => r.articles));

      if (allArticles.length > 0) {
        newsLog(
          `Successfully loaded ${allArticles.length} articles from live feeds`,
        );
        W.dataHealth?.mark?.("news", {
          source: "rss",
          observedAt: Date.now(),
          staleAfter: 60 * 60 * 1000,
        });
        renderArticles(container, allArticles);
        return;
      }

      // 4. All live feeds failed, try snapshot
      newsLog("Live feeds failed, trying snapshot...");
      const snapshot = await fetchSnapshot();

      if (!isCurrentRoute()) return;

      if (snapshot.length) {
        newsLog(`Using ${snapshot.length} snapshot articles`);
        W.dataHealth?.mark?.("news", {
          source: "snapshot",
          observedAt: Date.now() - 31 * 60 * 1000,
          staleAfter: 60 * 60 * 1000,
        });
        renderArticles(container, snapshot);
        return;
      }

      // 5. Everything failed
      console.error("[News] All sources failed");
      showError(
        container,
        "All news sources are currently unavailable. Please try again later.",
      );
    } catch (err) {
      console.error("[News] Render error:", err);
      showError(container, err.message || "An unexpected error occurred");
    }
  }

  return { render };
})();

console.log("[News] Module loaded (Graceful Degradation & CSP Compliant).");
