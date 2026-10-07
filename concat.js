// ================================================================
//  Concatenate all Weaver scripts with safety prelude
//
//  Emits two artifacts:
//    dist/bundle.js      — unminified, for debugging / inspection
//    dist/bundle.min.js  — minified, the file index.html actually loads
//
//  Both are generated from the same `output` string, so they are
//  guaranteed to be in sync. Never hand-edit either file.
// ================================================================

const fs = require("fs");
const path = require("path");

const files = [
  // ── Core ──────────────────────────────────────────────────────
  "js/storage/storage.js",
  "js/storage/observations.js",
  "js/lib/crypto/secure.js",
  "js/lib/crypto/secure-session.js",
  "js/lib/crypto/vault.js",
  "js/lib/sentry-init.js",
  "js/utils/format.js",
  "js/utils/finance.js",
  "js/utils/debounce.js",
  "js/utils/logger.js",
  "js/utils/performance.js",

  // ── UI Core ──────────────────────────────────────────────────
  "js/ui/theme.js",
  "js/ui/ui.js",
  "js/ui/vault-unlock.js",
  "js/ui/data-status.js",
  "js/ui/dashboard.js",
  "js/ui/skeleton.js",
  "js/ui/evidence-drawer.js",
  "js/ui/intelligence-feed.js",

  // ── API Layer ─────────────────────────────────────────────────
  "js/api/schemas.js",
  "js/api/request-guard.js",
  "js/api/prices.js",
  "js/api/snapshot.js",

  // ── Models ────────────────────────────────────────────────────
  "js/models/asset.js",

  // ── AI ────────────────────────────────────────────────────────
  "js/ai/providers.js",

  // ── Intelligence Layer ──────────────────────────────────────
  // NOTE: evidence.js defines the base API (create/validate/etc).
  //       evidence-builder.js merges `build` into that same object.
  //       Order is significant — evidence.js must run first.
  //
  // NOTE: meme-contracts.js must precede meme-opportunity.js.
  //       The opportunity engine reads W.memeContracts at call
  //       time, but keeping the dependency ordered here mirrors
  //       the module graph and makes bundle inspection sane.
  "js/intelligence/evidence.js",
  "js/intelligence/evidence-builder.js",
  
  "js/intelligence/meme-contracts.js",
  "js/intelligence/meme-opportunity.js",
  "js/intelligence/regime.js",
  "js/intelligence/delta.js",
  "js/intelligence/behavior.js",
  "js/intelligence/context.js",
  "js/intelligence/ranker.js",
  "js/intelligence/thesis-health.js",
  "js/intelligence/opportunities.js",
  "js/intelligence/decision-replay.js",
  "js/intelligence/calibration.js",

  // ── Intelligence Contracts & Engine ─────────────────────────
  "js/intelligence/types.js",
  "js/intelligence/decision-engine.js",
  "js/intelligence/events.js",
  "js/intelligence/technical-analysis.js",
  "js/intelligence/unified-verdict.js",
  "js/intelligence/market-structure.js",
  "js/intelligence/owner-associations.js",
  "js/intelligence/deployer-graph.js",

  // ── Smart Money Radar ────────────────────────────────────────
  // Loads after the intelligence contracts and graph modules.
  // The profiler and convergence detector that depend on this
  // module land in subsequent commits. Registration here is
  // ordered so the bundle reflects the intended dependency
  // chain: contracts → graphs → smart-money.
  "js/intelligence/smart-money/wallet-history.js",
  "js/intelligence/smart-money/wallet-profiler.js",
  "js/intelligence/smart-money/convergence-detector.js",
  "js/intelligence/smart-money/momentum-detector.js",

  // ── Features ──────────────────────────────────────────────────
  "js/features/portfolio.js",
  "js/features/watchlist.js",
  "js/features/explorer.js",
  "js/features/alerts.js",
  "js/data/news-snapshot.js",
  "js/features/news.js",
  "js/features/market.js",
  "js/features/ai.js",
  "js/features/optimizer.js",
  "js/features/timemachine.js",
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
  "js/features/track-record.js",
  "js/features/token-analysis.js",

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

// ── Emit unminified bundle (for debugging) ────────────────────
const unminifiedPath = path.join(distDir, "bundle.js");
fs.writeFileSync(unminifiedPath, output);

// ── Emit minified bundle (what index.html loads) ──────────────
const { transformSync } = require("esbuild");

const minifiedPath = path.join(distDir, "bundle.min.js");
const minified = transformSync(output, {
  minify: true,
  loader: "js",
  target: "es2020",
}).code;
fs.writeFileSync(minifiedPath, minified);

console.log(`✅ Bundle created: ${unminifiedPath}`);
console.log(
  `   ${(output.length / 1024).toFixed(1)} KB, ${fileCount} files (unminified)`,
);
console.log(`✅ Bundle created: ${minifiedPath}`);
console.log(`   ${(minified.length / 1024).toFixed(1)} KB (minified)`);
