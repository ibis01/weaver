// Guards for docs/audits/smart-money-early-entry-2026-10-11.md §4.
// These fail if the calibration decision is silently reverted.
//
// These assert on the source files, not runtime module state: the
// calibration is a property of the code, and reading the source
// avoids depending on W.smartMoney being loaded in this test env.

const { expect } = require("chai");
const fs = require("fs");
const path = require("path");

const PROFILER = path.join(
  __dirname,
  "..",
  "..",
  "js",
  "intelligence",
  "smart-money",
  "wallet-profiler.js",
);
const DETECTOR = path.join(
  __dirname,
  "..",
  "..",
  "js",
  "intelligence",
  "smart-money",
  "convergence-detector.js",
);

describe("Smart Money calibration — audit §4 invariants", () => {
  const profilerSrc = fs.readFileSync(PROFILER, "utf8");
  const detectorSrc = fs.readFileSync(DETECTOR, "utf8");

  it("WalletProfiler uses a 14-day early-entry lookahead", () => {
    expect(profilerSrc).to.match(
      /EARLY_ENTRY_LOOKAHEAD_DAYS\s*=\s*14\b/,
    );
    expect(profilerSrc).to.not.match(
      /EARLY_ENTRY_LOOKAHEAD_DAYS\s*=\s*1\b/,
    );
  });

  it("WalletProfiler keeps the 20% pump threshold", () => {
    expect(profilerSrc).to.match(/EARLY_ENTRY_PUMP_PCT\s*=\s*20\b/);
  });

  it("ConvergenceDetector keeps MIN_HISTORICAL_EARLY_RATE at 0.5", () => {
    expect(detectorSrc).to.match(
      /MIN_HISTORICAL_EARLY_RATE\s*=\s*0\.5\b/,
    );
  });

  it("ConvergenceDetector requires >= 10 priced buys before evaluating", () => {
    expect(detectorSrc).to.match(/MIN_EARLY_ENTRY_SAMPLE\s*=\s*10\b/);
    expect(detectorSrc).to.match(
      /hp\.earlyEntrySampleCount\s*<\s*MIN_EARLY_ENTRY_SAMPLE/,
    );
  });
});
