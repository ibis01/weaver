// ================================================================
// concat.js – Concatenate all Weaver scripts with safety prelude
// ================================================================

const fs = require("fs");
const path = require("path");

// ── Define the correct order (same as in index.html) ──────────
const files = [
  "js/storage/storage.js",
  "js/api/prices.js",
  "js/utils/format.js",
  "js/utils/debounce.js",
  "js/ui/theme.js",
  "js/ui/ui.js",
  "js/ui/dashboard.js",
  "js/api/snapshot.js",
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
  "js/ui/particles.js",
  "js/ui/tilt.js",
  "js/app.js",
];

// ── Ensure dist folder exists ──────────────────────────────────
const distDir = path.join(__dirname, "dist");
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir);
}

// ── Build bundle with safety prelude ──────────────────────────
let output = "// ====== Weaver Bundle ======\n";
output += "// Ensure global W object exists\n";
output += 'if (typeof window.W === "undefined") window.W = {};\n';
output += "window.W.features = window.W.features || {};\n";
output += "window.W.api = window.W.api || {};\n";
output += "window.W.fmt = window.W.fmt || {};\n";
output += "window.W.ui = window.W.ui || {};\n";
output += "window.W.store = window.W.store || {};\n";
output += "window.W.dashboard = window.W.dashboard || {};\n";
output += "// ==============================\n\n";

let fileCount = 0;
for (const file of files) {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, "utf8");
    // Remove any leading shebang or BOM if present
    content = content.replace(/^#!.*/, "").replace(/^\uFEFF/, "");
    output += `// ---- ${file} ----\n`;
    output += content + "\n";
    fileCount++;
  } else {
    console.warn(`⚠️ Warning: ${file} not found, skipping.`);
  }
}

// ── Write bundle ────────────────────────────────────────────────
const bundlePath = path.join(distDir, "bundle.js");
fs.writeFileSync(bundlePath, output);
console.log(
  `✅ Bundle created: ${bundlePath} (${(output.length / 1024).toFixed(1)} KB, ${fileCount} files)`,
);
