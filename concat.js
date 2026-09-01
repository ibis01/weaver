// ================================================================
// concat.js – Concatenate all Weaver scripts with safety prelude
// ================================================================

const fs = require("fs");
const path = require("path");

const files = [
  // ── Core ──────────────────────────────────────────────────────
  "js/storage/storage.js",
  "js/lib/crypto/secure.js",
  "js/utils/format.js",
  "js/utils/finance.js",
  "js/utils/debounce.js",
  "js/utils/logger.js",
  "js/utils/performance.js",

  // ── UI Core ──────────────────────────────────────────────────
  "js/ui/theme.js",
  "js/ui/ui.js",
  "js/ui/dashboard.js",

  // ── API Layer ─────────────────────────────────────────────────
  "js/api/prices.js",
  "js/api/snapshot.js",

  // ── Models ────────────────────────────────────────────────────
  "js/models/asset.js",

  // ── AI ────────────────────────────────────────────────────────
  "js/ai/providers.js",

  // ── Intelligence Layer ──────────────────────────────────────
  "js/intelligence/evidence.js",
  "js/intelligence/regime.js",
  "js/intelligence/delta.js",
  "js/intelligence/behavior.js",
  "js/intelligence/context.js",
  "js/intelligence/thesis-health.js",
  "js/intelligence/opportunities.js",
  "js/intelligence/decision-replay.js",

  // ── Intelligence Contracts & Engine ─────────────────────────
  "js/intelligence/types.js",
  "js/intelligence/decision-engine.js",
  "js/intelligence/events.js",

  // ── Features ──────────────────────────────────────────────────
  "js/features/portfolio.js",
  "js/features/watchlist.js",
  "js/features/explorer.js",
  "js/features/alerts.js",
  "js/features/news.js",
  "js/features/ai.js",
  "js/features/optimizer.js",
  "js/features/timemachine.js",
  "js/features/trader.js",
  "js/features/gems.js",
  "js/features/shield.js",
  "js/features/web3.js",
  "js/features/misc.js",
  "js/features/whales.js",
  "js/features/smart.js",
  "js/features/unlocks.js",
  "js/features/sectors.js",
  "js/features/learn.js",
  "js/features/sync.js",
  "js/features/telegram.js",
  "js/features/walletsync.js",
  "js/features/theses.js",
  "js/features/journal.js",

  // ── UI Enhancements ──────────────────────────────────────────
  "js/ui/particles.js",
  "js/ui/tilt.js",

  // ── Core App ──────────────────────────────────────────────────
  "js/app.js",
  "js/init.js",
];

const distDir = path.join(__dirname, "dist");
if (!fs.existsSync(distDir)) fs.mkdirSync(distDir);

let output = "// ====== Weaver Bundle ======\n";
output += 'if (typeof window.W === "undefined") window.W = {};\n';
output += "// ==============================\n\n";

let fileCount = 0;
for (const file of files) {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, "utf8");
    content = content.replace(/^\uFEFF/, "").replace(/^#!.*/, "");
    content = content.trimEnd();
    if (!content.endsWith(";")) content += ";";
    output += `// ---- ${file} ----\n`;
    output += content + "\n";
    fileCount++;
  } else {
    console.warn(`⚠️ Warning: ${file} not found, skipping.`);
  }
}

const bundlePath = path.join(distDir, "bundle.js");
fs.writeFileSync(bundlePath, output);
console.log(
  `✅ Bundle created: ${bundlePath} (${(output.length / 1024).toFixed(1)} KB, ${fileCount} files)`,
);
