const fs = require("fs");
const path = require("path");
const articles = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../data/news.json"), "utf8"),
);
if (!Array.isArray(articles) || articles.length === 0)
  throw new Error("News snapshot is empty");
fs.mkdirSync(path.join(__dirname, "../js/data"), { recursive: true });
fs.writeFileSync(
  path.join(__dirname, "../js/data/news-snapshot.js"),
  `window.__WEAVER_NEWS_SNAPSHOT__ = ${JSON.stringify(articles)};\n`,
);
console.log(`Embedded ${articles.length} News articles`);
