// SECURITY: All RSS-derived content (title, description, link, pubDate)
// is attacker-controllable. It MUST be escaped before insertion into
// the DOM. Use W.fmt.escapeHTML or textContent — never innerHTML with
// raw feed data.
//
// SNAPSHOT: The fallback snapshot is a fixed URL, not the result of
// running an empty string through the proxy chain. Snapshot fetches
// go directly to the known-good URL.

const newsLog = (msg, data) => {
  console.log(`[News] ${msg}`, data || "");
};

// ── RSS Feeds ──────────────────────────────────────────────────
const FEEDS = [
  ["CoinDesk", "https://www.coindesk.com/arc/outboundfeeds/rss/"],
  ["Cointelegraph", "https://cointelegraph.com/rss"],
  ["Decrypt", "https://decrypt.co/feed"],
];

// ── Fixed snapshot URL (used only if live feeds fail) ──────────
const SNAPSHOT_URLS = [
  "data/news.json",
  "https://ibis01.github.io/weaver/data/news.json",
];

// ── Proxy chain — builds a fetchable URL for a given target ────
const PROX = [
  (u) => "http://localhost:3001/proxy?url=" + encodeURIComponent(u),
  (u) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
  (u) => "https://corsproxy.io/?url=" + encodeURIComponent(u),
  (u) => "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(u),
];

// ── Fetch with proxy fallback ──────────────────────────────────
async function via(url, asJSON = false) {
  let lastErr = null;
  for (const buildProxy of PROX) {
    const proxyUrl = buildProxy(url);
    newsLog(`Trying proxy: ${proxyUrl.substring(0, 80)}...`);
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
      newsLog(`✅ Proxy succeeded: ${proxyUrl}`);
      const parsed = asJSON ? JSON.parse(text) : text;
      return parsed;
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
      throw new Error("snapshot is empty");
    } catch (e) {
      newsLog(`Snapshot failed (${snapshotUrl}): ${e.message}`);
    }
  }
  return [];
}

// ── Parse RSS XML ──────────────────────────────────────────────
function parseRSS(xml) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "text/xml");
  const items = doc.querySelectorAll("item");
  const articles = [];
  items.forEach((item) => {
    const title = item.querySelector("title")?.textContent || "Untitled";
    const link = item.querySelector("link")?.textContent || "#";
    const description = item.querySelector("description")?.textContent || "";
    const pubDate = item.querySelector("pubDate")?.textContent || "";
    // Strip HTML entities that some feeds embed in description.
    const plainDesc = description.replace(/<[^>]+>/g, "").trim();
    articles.push({ title, link, description: plainDesc, pubDate });
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
    return tb - ta;
  });
}

// ── Render articles into a specific container ──────────────────
// Container is passed in, not looked up globally — avoids collisions
// if more than one view ever renders at once.
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

  const items = articles
    .slice(0, 20)
    .map((a) => {
      const safeTitle = esc(a.title);
      const safeLink = esc(safeHref(a.link));
      const safeDesc = esc(a.description || "");
      const safeDate = esc(a.pubDate || "");
      return `
        <div class="news-item">
          <h3><a href="${safeLink}" target="_blank" rel="noopener noreferrer">${safeTitle}</a></h3>
          <p>${safeDesc ? safeDesc.substring(0, 200) + "…" : ""}</p>
          <small>${safeDate}</small>
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
  // 1. Build the page structure with a locally-scoped container reference.
  view.innerHTML = `
    <div class="card">
      <h3>📰 Crypto News</h3>
      <div id="news-container"></div>
    </div>
  `;

  const container = view.querySelector("#news-container");
  if (!container) {
    console.warn("[News] Container not found after rendering");
    return;
  }

  const embeddedSnapshot = dedupeAndSort(window.__WEAVER_NEWS_SNAPSHOT__ || []);
  if (embeddedSnapshot.length) {
    renderArticles(container, embeddedSnapshot);
  } else {
    container.innerHTML = '<div class="loading">Loading news...</div>';
  }

  try {
    // Render the local snapshot first so the page is useful even when a
    // proxy or RSS provider is slow, rate-limited, or unavailable.
    const snapshot = embeddedSnapshot.length
      ? embeddedSnapshot
      : dedupeAndSort(await fetchSnapshot());
    if (isCurrentRoute() && snapshot.length) {
      W.dataHealth?.mark?.("news", {
        source: "snapshot",
        observedAt: Date.now() - 31 * 60 * 1000,
        staleAfter: 60 * 60 * 1000,
      });
      renderArticles(container, snapshot);
    }

    // 2. Fetch all feeds in parallel.
    const feedPromises = FEEDS.map(async ([name, url]) => {
      try {
        const xml = await via(url);
        const articles = parseRSS(xml);
        return { name, articles, error: null };
      } catch (err) {
        newsLog(`Failed to fetch ${name}:`, err.message);
        return { name, articles: [], error: err.message };
      }
    });

    const results = await Promise.all(feedPromises);
    if (!isCurrentRoute()) return;
    const allArticles = dedupeAndSort(results.flatMap((r) => r.articles));

    W.dataHealth?.mark?.("news", {
      source: "rss",
      observedAt: Date.now(),
      staleAfter: 60 * 60 * 1000,
    });

    if (allArticles.length === 0) {
      newsLog("No live articles, trying snapshot...");
      if (snapshot.length) {
        return;
      }
      container.innerHTML =
        '<div class="error">Could not load news. Try again later.</div>';
      return;
    }

    renderArticles(container, allArticles);
  } catch (err) {
    console.error("[News] Render error:", err);
    const msg = W.fmt?.escapeHTML?.(err.message) || "unknown error";
    container.innerHTML = `<div class="error">Failed to load news: ${msg}</div>`;
  }
}

// ── Exports ─────────────────────────────────────────────────────
window.W = window.W || {};
W.features = W.features || {};
W.features.news = { render };
W.news = { render };

console.log("[News] Module loaded.");
