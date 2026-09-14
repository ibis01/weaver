const fs = require("fs");
const path = require("path");

const feeds = [
  ["CoinDesk", "https://www.coindesk.com/arc/outboundfeeds/rss/"],
  ["Cointelegraph", "https://cointelegraph.com/rss"],
  ["Decrypt", "https://decrypt.co/feed"],
];

function decode(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
function tag(item, name) {
  const match = item.match(
    new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"),
  );
  return match ? decode(match[1]) : "";
}

(async () => {
  const articles = [];
  for (const [source, url] of feeds) {
    const response = await fetch(url, {
      headers: { "User-Agent": "WeaverSnapshot/1.0" },
    });
    if (!response.ok) throw new Error(`${source}: HTTP ${response.status}`);
    const xml = await response.text();
    for (const item of xml.match(/<item\b[\s\S]*?<\/item>/gi) || []) {
      const title = tag(item, "title");
      const link = tag(item, "link");
      const description = tag(item, "description");
      const pubDate = tag(item, "pubDate");
      if (title && /^https?:\/\//i.test(link))
        articles.push({ source, title, link, description, pubDate });
    }
  }
  const unique = [
    ...new Map(articles.map((item) => [item.link, item])).values(),
  ]
    .sort((a, b) => (Date.parse(b.pubDate) || 0) - (Date.parse(a.pubDate) || 0))
    .slice(0, 60);
  if (!unique.length) throw new Error("No RSS articles were normalized");
  fs.writeFileSync(
    path.join(__dirname, "../data/news.json"),
    `${JSON.stringify(unique, null, 2)}\n`,
  );
  console.log(`Wrote ${unique.length} news articles`);
})();
