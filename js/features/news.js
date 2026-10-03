// ===============================================================
//   News Module 
// ===============================================================


window.W = window.W || {};

W.news = (() => {
  // Freshness classification for embedded or fetched news data.
  // Returns { status, ageHours, newest } where status is one of:
  //   live            — newest article under 6 hours old
  //   snapshot-fresh  — under 36 hours
  //   snapshot-stale  — older than 36 hours
  //   unavailable     — no parseable dates at all
  function classifyNewsFreshness(articles) {
    if (!Array.isArray(articles) || !articles.length) {
      return { status: "unavailable", ageHours: null, newest: null };
    }
    let newest = 0;
    for (const a of articles) {
      const ts = Date.parse(a && a.pubDate);
      if (Number.isFinite(ts) && ts > newest) newest = ts;
    }
    if (!newest) {
      return { status: "unavailable", ageHours: null, newest: null };
    }
    const ageHours = (Date.now() - newest) / 3600000;
    let status;
    if (ageHours < 6) status = "live";
    else if (ageHours < 36) status = "snapshot-fresh";
    else status = "snapshot-stale";
    return { status, ageHours, newest };
  }

  const newsLog = (msg, data) => {
    console.log(`[News] ${msg}`, data || "");
  };

  // ── Attribute-safe escaper ─────────────────────────────
  // Local, always available. Covers all five HTML-significant
  // characters. Never depends on load order.
  function esc(v) {
    if (v == null) return "";
    const s = String(v);
    if (!/[&<>"']/.test(s)) return s;
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // ── Constants ──────────────────────────────────────────
  const FEEDS = Object.freeze([
    ["CoinDesk", "https://www.coindesk.com/arc/outboundfeeds/rss/"],
    ["Cointelegraph", "https://cointelegraph.com/rss"],
    ["Decrypt", "https://decrypt.co/feed"],
  ]);

  const SNAPSHOT_URLS = Object.freeze([
    "data/news.json",
    "https://ibis01.github.io/weaver/data/news.json",
  ]);

  const PROXIES = Object.freeze([
    (u) =>
      `https://weaver-proxy.ibis01-weaver.workers.dev/proxy?url=${encodeURIComponent(u)}`,
    (u) => u,
  ]);

  // Render generation counter. A new render() invalidates every
  // in-flight continuation from a prior call.
  let _renderGen = 0;

  // ── Fetch with proxy fallback ──────────────────────────
  async function fetchViaProxy(url, asJSON = false) {
    let lastErr = null;

    for (const buildProxy of PROXIES) {
      const proxyUrl = buildProxy(url);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      try {
        const requestOptions = { signal: controller.signal };

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

  // ── Fetch the fixed snapshot ───────────────────────────
  async function fetchSnapshot() {
    const embedded = window.__WEAVER_NEWS_SNAPSHOT__;
    if (Array.isArray(embedded) && embedded.length) {
      newsLog("Using embedded snapshot");
      return embedded;
    }

    for (const snapshotUrl of SNAPSHOT_URLS) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        // Route through requestGuard for consistency with the RSS
        // path. Falls back to raw fetch if requestGuard is absent.
        const resp = W.requestGuard
          ? await W.requestGuard.fetch(
              snapshotUrl,
              { signal: controller.signal },
              { capacity: 4, refillMs: 10000 },
            )
          : await fetch(snapshotUrl, { signal: controller.signal });
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
        clearTimeout(timeout);
        newsLog(`Snapshot failed (${snapshotUrl}): ${e.message}`);
      }
    }

    return [];
  }

  // ── Strip HTML from a description via DOM parsing ──────
  // Replaces the regex approach, which is bypassable with
  // malformed tags. Returns plain text.
  function stripHtml(raw) {
    if (typeof raw !== "string" || !raw) return "";
    let text;
    try {
      const doc = new DOMParser().parseFromString(raw, "text/html");
      text = doc.body ? doc.body.textContent || "" : "";
    } catch {
      text = raw.replace(/[<>]/g, "");
    }
    return text.replace(/\s+/g, " ").trim();
  }

  // ── Parse RSS XML ──────────────────────────────────────
  function parseRSS(xml, sourceName) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xml, "text/xml");

      if (doc.querySelector("parsererror")) {
        throw new Error("Invalid XML");
      }

      // Support both RSS <item> and Atom <entry>. Atom is not used
      // by the current feed list, but a feed can change format
      // without warning and the module should degrade rather than
      // return zero articles.
      let items = doc.querySelectorAll("item");
      let isAtom = false;
      if (items.length === 0) {
        items = doc.querySelectorAll("entry");
        isAtom = true;
      }

      const articles = [];

      items.forEach((item) => {
        const title = item.querySelector("title")?.textContent || "Untitled";

        let link = "#";
        if (isAtom) {
          // Atom puts the href in an attribute.
          const linkEl = item.querySelector("link");
          link = linkEl?.getAttribute("href") || linkEl?.textContent || "#";
        } else {
          link = item.querySelector("link")?.textContent || "#";
        }

        const description =
          item.querySelector("description")?.textContent ||
          item.querySelector("summary")?.textContent ||
          item.querySelector("content")?.textContent ||
          "";

        const pubDate =
          item.querySelector("pubDate")?.textContent ||
          item.querySelector("published")?.textContent ||
          item.querySelector("updated")?.textContent ||
          "";

        articles.push({
          source: sourceName,
          title,
          link,
          description: stripHtml(description),
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

  // ── Deduplicate and sort ───────────────────────────────
  function dedupeAndSort(articles) {
    if (!Array.isArray(articles)) return [];
    const seen = new Set();
    const unique = [];

    for (const a of articles) {
      if (!a || typeof a !== "object") continue;
      const key = a.link || a.title || "";
      if (!key) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(a);
    }

    return unique.sort((a, b) => {
      const ta = Date.parse(a.pubDate) || 0;
      const tb = Date.parse(b.pubDate) || 0;
      return tb - ta;
    });
  }

  // ── Safe external URL ──────────────────────────────────
  function safeHref(value) {
    if (typeof value !== "string" || !value) return "#";
    try {
      const url = new URL(value, window.location.href);
      if (url.protocol !== "http:" && url.protocol !== "https:") return "#";
      return url.href;
    } catch {
      return "#";
    }
  }

  // ── Render articles ────────────────────────────────────
  function renderArticles(container, articles) {
    if (!container) return;

    if (!Array.isArray(articles) || articles.length === 0) {
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

    const formatDate = (dateStr) => {
      if (!dateStr) return "";
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return "";
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
        const safeTitle = esc(a.title || "Untitled");
        const safeLink = esc(safeHref(a.link));
        const rawDesc = typeof a.description === "string" ? a.description : "";
        const safeDesc = esc(rawDesc.slice(0, 200));
        const safeDate = esc(formatDate(a.pubDate));
        const safeSource = esc(a.source || "Unknown");

        return `
        <article class="card mb-16">
          <h3 class="mb-8">
            <a href="${safeLink}" target="_blank" rel="noopener noreferrer" class="text-primary">
              ${safeTitle}
            </a>
          </h3>
          <p class="muted small mb-8">
            ${safeDesc ? safeDesc + "…" : ""}
          </p>
          <small class="muted">${safeSource}${safeDate ? " · " + safeDate : ""}</small>
        </article>
      `;
      })
      .join("");

    container.innerHTML = `<div class="news-list">${items}</div>`;
    newsLog(`Rendered ${Math.min(articles.length, 30)} articles`);
  }

  // ── Show error state ───────────────────────────────────
  // v2: takes an onRetry callback instead of inferring a target
  // from the DOM. The caller (render) captures the correct view
  // element and closure.
  function showError(container, message, onRetry) {
    if (!container) return;
    const safeMessage = esc(
      message || "We couldn't load the latest news right now.",
    );

    container.innerHTML = `
      <div class="card">
        <div class="empty text-center p-24">
          <div class="empty-icon mb-16">📰</div>
          <h3>News Feed Unavailable</h3>
          <p class="muted small mt-8 mb-24">${safeMessage}</p>
          <button class="btn primary" id="news-retry">Try Again</button>
        </div>
      </div>
    `;

    const retryBtn = container.querySelector("#news-retry");
    if (retryBtn && typeof onRetry === "function") {
      retryBtn.onclick = () => {
        newsLog("Retry clicked");
        onRetry();
      };
    }
  }

  // ═══════════════════════════════════════════════════════
  // render(view) — called by the router
  // ═══════════════════════════════════════════════════════
  async function render(view) {
    if (!view) return;
    newsLog("Render called");

    const gen = ++_renderGen;
    const isCurrent = () => gen === _renderGen;

    // 1. Page structure
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
    if (!container) return;

    container.innerHTML =
      '<div class="loading text-center p-24 muted">Loading news...</div>';

    // Retry closure captures the original view. The old version
    // passed container.closest(".app") to render(), which wiped
    // the app shell.
    const retry = () => render(view);

    try {
      // 2. Embedded snapshot
      const embeddedRaw = window.__WEAVER_NEWS_SNAPSHOT__ || [];
      const embeddedSnapshot = dedupeAndSort(embeddedRaw);

      if (embeddedSnapshot.length) {
        if (!isCurrent()) return;
        newsLog(`Using ${embeddedSnapshot.length} embedded articles`);
        renderArticles(container, embeddedSnapshot);
        W.dataHealth?.mark?.("news", {
          source: "embedded-snapshot",
          observedAt: Date.now(),
          staleAfter: 60 * 60 * 1000,
        });
        return;
      }

      // 3. Live feeds in parallel
      newsLog("Fetching live feeds...");
      const feedPromises = FEEDS.map(async ([name, url]) => {
        try {
          const xml = await fetchViaProxy(url);
          if (!isCurrent()) return { name, articles: [], error: null };
          const articles = parseRSS(xml, name);
          return { name, articles, error: null };
        } catch (err) {
          newsLog(`Failed to fetch ${name}: ${err.message}`);
          return { name, articles: [], error: err.message };
        }
      });

      const results = await Promise.all(feedPromises);
      if (!isCurrent()) return;

      const allArticles = dedupeAndSort(results.flatMap((r) => r.articles));

      if (allArticles.length > 0) {
        newsLog(`Successfully loaded ${allArticles.length} articles`);
        W.dataHealth?.mark?.("news", {
          source: "rss",
          observedAt: Date.now(),
          staleAfter: 60 * 60 * 1000,
        });
        renderArticles(container, allArticles);
        return;
      }

      // 4. Snapshot fallback
      newsLog("Live feeds failed, trying snapshot...");
      const snapshot = dedupeAndSort(await fetchSnapshot());
      if (!isCurrent()) return;

      if (snapshot.length) {
        newsLog(`Using ${snapshot.length} snapshot articles`);
        W.dataHealth?.mark?.("news", {
          source: "snapshot",
          observedAt: Date.now(),
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
        retry,
      );
    } catch (err) {
      if (!isCurrent()) return;
      console.error("[News] Render error:", err);
      showError(
        container,
        err && err.message ? err.message : "An unexpected error occurred",
        retry,
      );
    }
  }

  return { render };
})();

console.log("[News] Module loaded v2 (graceful degradation, CSP compliant).");
