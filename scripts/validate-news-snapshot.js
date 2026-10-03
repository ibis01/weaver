#!/usr/bin/env node
// Validates data/news.json and js/data/news-snapshot.js.
//
// Checks:
//   - both files parse
//   - every article has source/title/link/pubDate
//   - links are http(s) only
//   - pubDates parse
//   - no duplicate links
//   - newest article is under NEWS_MAX_AGE_HOURS (default 36)
//   - the two files agree
//
// Flags:
//   --allow-stale    downgrade the freshness failure to a warning
//                    (used by manual `workflow_dispatch` runs during
//                    provider outages)

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const NEWS_JSON = path.join(ROOT, "data/news.json");
const EMBEDDED = path.join(ROOT, "js/data/news-snapshot.js");
const MAX_AGE_HOURS = Number(process.env.NEWS_MAX_AGE_HOURS || 36);
const ALLOW_STALE = process.argv.includes("--allow-stale");

function fail(msg) {
  console.error("NEWS_STATUS=fail");
  console.error(msg);
  process.exit(1);
}

function pass(msg) {
  console.log(msg);
}

if (!fs.existsSync(NEWS_JSON)) fail("data/news.json missing");
if (!fs.existsSync(EMBEDDED)) fail("js/data/news-snapshot.js missing");

let parsed;
try {
  parsed = JSON.parse(fs.readFileSync(NEWS_JSON, "utf8"));
} catch (e) {
  fail("data/news.json is not valid JSON: " + e.message);
}
const articles = Array.isArray(parsed) ? parsed : parsed.articles;
if (!Array.isArray(articles) || articles.length === 0) {
  fail("news snapshot is empty");
}

let newest = 0;
const seen = new Set();
for (const [i, a] of articles.entries()) {
  const where = "articles[" + i + "]";
  if (!a || typeof a !== "object") fail(where + " is not an object");
  if (typeof a.source !== "string" || !a.source.trim()) {
    fail(where + " missing source");
  }
  if (typeof a.title !== "string" || !a.title.trim()) {
    fail(where + " missing title");
  }
  if (typeof a.link !== "string" || !/^https?:\/\//i.test(a.link)) {
    fail(where + " link not http(s): " + a.link);
  }
  const ts = Date.parse(a.pubDate);
  if (!Number.isFinite(ts)) {
    fail(where + " pubDate unparseable: " + a.pubDate);
  }
  if (ts > newest) newest = ts;
  const key = a.link.toLowerCase();
  if (seen.has(key)) fail(where + " duplicate link: " + a.link);
  seen.add(key);
}

const ageHours = (Date.now() - newest) / 3600000;

// Cross-check: embedded module must reference the same article count.
const embeddedSrc = fs.readFileSync(EMBEDDED, "utf8");
// Extract the assignment RHS by scanning from the first `=` to the
// last `;`. Simpler than a regex over a possibly-nested array.
const eqIdx = embeddedSrc.indexOf("=");
const semiIdx = embeddedSrc.lastIndexOf(";");
if (eqIdx < 0) fail("js/data/news-snapshot.js missing assignment");
const rhs =
  semiIdx > eqIdx
    ? embeddedSrc.slice(eqIdx + 1, semiIdx).trim()
    : embeddedSrc.slice(eqIdx + 1).trim();
let embeddedCount;
try {
  const parsedEmbedded = JSON.parse(rhs);
  if (!Array.isArray(parsedEmbedded)) {
    fail("js/data/news-snapshot.js RHS is not an array");
  }
  embeddedCount = parsedEmbedded.length;
} catch (e) {
  fail("js/data/news-snapshot.js array not parseable: " + e.message);
}
if (embeddedCount !== articles.length) {
  fail(
    "article count mismatch: data/news.json=" +
      articles.length +
      " embedded=" +
      embeddedCount,
  );
}

pass("NEWS_STATUS=pass");
pass("NEWS_ARTICLE_COUNT=" + articles.length);
pass("NEWS_NEWEST_AGE_HOURS=" + ageHours.toFixed(1));

if (ageHours > MAX_AGE_HOURS) {
  if (ALLOW_STALE) {
    console.warn(
      "NEWS_STALE=warn newest article " +
        ageHours.toFixed(1) +
        "h old exceeds " +
        MAX_AGE_HOURS +
        "h",
    );
  } else {
    fail(
      "newest article " +
        ageHours.toFixed(1) +
        "h old exceeds " +
        MAX_AGE_HOURS +
        "h; refresh snapshot or pass --allow-stale",
    );
  }
}
