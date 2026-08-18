// ================================================================
// build.js – esbuild bundling for Weaver
// ================================================================

const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

// ── Ensure dist folder exists ──────────────────────────────
const distDir = path.join(__dirname, "dist");
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir);
}

// ── Build configuration ─────────────────────────────────────
const buildOptions = {
  entryPoints: ["js/app.js"],
  bundle: true,
  minify: true,
  sourcemap: true,
  outfile: "dist/bundle.js",
  format: "iife",
  globalName: "W",
  platform: "browser",
  target: ["es2020", "chrome80", "firefox80", "safari15"],
  loader: {
    ".js": "js",
  },
  logLevel: "info",
};

// ── Main function ──────────────────────────────────────────
async function main() {
  const isWatch = process.argv.includes("--watch");

  if (isWatch) {
    console.log("👀 Watching for changes...");
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log("✅ Watching enabled. Press Ctrl+C to stop.");
  } else {
    console.log("📦 Building Weaver bundle...");
    try {
      await esbuild.build(buildOptions);
      console.log("✅ Build complete! Output: dist/bundle.js");
    } catch (error) {
      console.error("❌ Build failed:", error);
      process.exit(1);
    }
  }
}

main();
