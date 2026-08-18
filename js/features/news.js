// ============================================================
// js/features/news.js – Final version with container creation
// ============================================================

const log = (msg, data) => {
  console.log(`[News] ${msg}`, data || "");
};

const FEEDS = [
  ["CoinDesk", "https://www.coindesk.com/arc/outboundfeeds/rss/"],
  ["Cointelegraph", "https://cointelegraph.com/rss"],
  ["Decrypt", "https://decrypt.co/feed"],
];

const PROX = [
  (u) => "http://localhost:3001/proxy?url=" + encodeURIComponent(u),
  (u) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
  (u) => "https://corsproxy.io/?url=" + encodeURIComponent(u),
  (u) => "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(u),
  (u) => "https://ibis01.github.io/weaver/data/news.json",
];

async function via(url, asJSON = false) {
  let lastErr = null;
  for (const buildProxy of PROX) {
    const proxyUrl = buildProxy(url);
    log(`Trying proxy: ${proxyUrl.substring(0, 80)}...`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    try {
      const resp = await fetch(proxyUrl, {
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; WeaverBot/1.0)" },
      });
      clearTimeout(timeout);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();
      if (
        text.trim().startsWith("<") &&
        !text.includes("<rss") &&
        !text.includes("<feed")
      ) {
        throw new Error("HTML response (not RSS)");
      }
      log(`✅ Proxy succeeded: ${proxyUrl}`);
      return asJSON ? JSON.parse(text) : text;
    } catch (err) {
      clearTimeout(timeout);
      log(`❌ Proxy failed: ${err.message}`);
      lastErr = err;
    }
  }
  console.error("[News] All proxies failed.", lastErr);
  throw lastErr || new Error("All proxies failed");
}

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
    articles.push({ title, link, description, pubDate });
  });
  return articles;
}

function renderArticles(articles) {
  const container = document.getElementById("news-container");
  if (!container) return;
  if (!articles || articles.length === 0) {
    container.innerHTML = '<div class="info">No articles available.</div>';
    return;
  }
  const items = articles
    .slice(0, 20)
    .map(
      (a) => `
    <div class="news-item">
      <h3><a href="${a.link}" target="_blank" rel="noopener">${a.title}</a></h3>
      <p>${a.description ? a.description.substring(0, 200) + "..." : ""}</p>
      <small>${a.pubDate || ""}</small>
    </div>
  `,
    )
    .join("");
  container.innerHTML = `<div class="news-list">${items}</div>`;
}

// ========== UPDATED render() – creates container if missing ==========
async function render() {
  // 1. Try to find the container
  let container = document.getElementById("news-container");

  // 2. If not found, find the main content area
  if (!container) {
    // Try to find the main content wrapper – this is where news should live
    const parent =
      document.querySelector(".main") || // your main content area
      document.getElementById("news") ||
      document.getElementById("news-section") ||
      document.getElementById("page-news") ||
      document.querySelector(".news-page") ||
      document.body;

    container = document.createElement("div");
    container.id = "news-container";
    container.className = "news-container";

    // Append to the parent (or prepend if you prefer)
    parent.appendChild(container);
    console.log(
      "[News] Created container #news-container inside",
      parent.tagName +
        (parent.id ? "#" + parent.id : "") +
        (parent.className ? "." + parent.className : ""),
    );
  }
  // 3. Show loading
  container.innerHTML = '<div class="loading">Loading news...</div>';

  try {
    const feedPromises = FEEDS.map(async ([name, url]) => {
      try {
        const xml = await via(url);
        const articles = parseRSS(xml);
        return { name, articles, error: null };
      } catch (err) {
        log(`Failed to fetch ${name}:`, err.message);
        return { name, articles: [], error: err.message };
      }
    });
    const results = await Promise.all(feedPromises);
    const allArticles = results.flatMap((r) => r.articles);

    if (allArticles.length === 0) {
      log("No live articles, trying snapshot...");
      const snapshot = await via("", true);
      if (snapshot && snapshot.length) {
        renderArticles(snapshot);
        return;
      }
      container.innerHTML =
        '<div class="error">Could not load news. Try again later.</div>';
      return;
    }
    renderArticles(allArticles);
  } catch (err) {
    console.error("[News] Render error:", err);
    container.innerHTML =
      '<div class="error">Failed to load news. Check console.</div>';
  }
}

// ========== EXPORTS ==========
window.W = window.W || {};
W.features = W.features || {};
W.features.news = { render };
W.news = { render };

console.log("[News] Module loaded.");
console.log("[News] W.features.news:", W.features.news);
console.log("[News] W.news:", W.news);
