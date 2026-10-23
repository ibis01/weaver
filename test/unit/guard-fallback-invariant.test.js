// Forward-looking invariant for WEAVER_CONSTITUTION.md §2.6 (Privacy First).
//
// The pipeline uses `W.requestGuard ? await W.requestGuard.fetch(...) :
// await fetch(...)` on paths that may carry user-adjacent context. The
// guard is the allowlist enforcement point; the bare-fetch fallback
// exists only for when the guard module fails to load.
//
// This test does not assert the guard is always used — some bare
// fetches are legitimate (static JSON snapshots, user-supplied AI
// endpoints). It asserts that the *set of sensitive modules* doing
// bare fetch does not grow silently. Adding a new one requires
// updating the allowlist below, which forces a reviewer to confirm
// the new fetch target is compliant.

const { expect } = require("chai");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..", "..");
const JS = path.join(REPO, "js");

// Modules known to contain bare `await fetch(` calls. Every entry is
// reviewed: static data, public market/news providers, user-supplied
// endpoints validated separately, or the guard-fallback pattern where
// the primary path goes through W.requestGuard.fetch.
const ALLOWED = new Set([
  "js/utils/format.js", // FX rates, static
  "js/api/prices.js", // guard-fallback
  "js/ai/providers.js", // user-configured endpoint
  "js/intelligence/deployer-graph.js", // Weaver's own worker
  "js/intelligence/smart-money/wallet-history.js", // Blockscout, public
  "js/features/ai.js", // user-configured endpoint
  "js/features/news.js", // RSS, public
  "js/features/gems.js", // DexScreener + own worker
  "js/features/smart.js", // guard-fallback
  "js/features/shield.js", // GoPlus/RugCheck, public
  "js/features/track-record.js", // public price lookups
  "js/features/evidence-card.js", // public data lookups
  "js/features/walletsync.js", // own worker
  "js/features/smart-radar-auto.js", // own worker
  "js/intelligence/evaluation/predictive-validator.js", // Worker endpoints only
  "js/intelligence/smart-money/solana-adapter.js", // Worker endpoints only
  "js/features/telegram.js", // user-supplied webhook
]);

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) continue;
      walk(full, acc);
    } else if (entry.name.endsWith(".js") && !entry.name.includes(".bak.")) {
      acc.push(full);
    }
  }
  return acc;
}

describe("Guard-fallback invariant — §2.6 privacy forward guard", () => {
  it("bare `await fetch(` appears only in reviewed modules", () => {
    const offenders = [];
    for (const file of walk(JS)) {
      const rel = path.relative(REPO, file);
      if (rel === path.join("js", "api", "request-guard.js")) continue;
      const src = fs.readFileSync(file, "utf8");
      if (/\bawait\s+fetch\s*\(/.test(src) && !ALLOWED.has(rel)) {
        offenders.push(rel);
      }
    }
    expect(
      offenders,
      `New bare fetch call(s) in unreviewed module(s): ${offenders.join(", ")}. ` +
      `Confirm the fetch target is compliant with §2.6, then add to the ALLOWED set ` +
      `in test/unit/guard-fallback-invariant.test.js.`
    ).to.deep.equal([]);
  });

  it("ALLOWED set does not contain stale entries (file removed or fetch dropped)", () => {
    const stale = [];
    for (const rel of ALLOWED) {
      const full = path.join(REPO, rel);
      if (!fs.existsSync(full)) {
        stale.push(rel + " (file missing)");
        continue;
      }
      const src = fs.readFileSync(full, "utf8");
      if (!/\bawait\s+fetch\s*\(/.test(src)) {
        stale.push(rel + " (no bare fetch)");
      }
    }
    expect(
      stale,
      `Stale allowlist entries: ${stale.join(", ")}. ` +
      `Remove them so the invariant test stays honest.`
    ).to.deep.equal([]);
  });
});
