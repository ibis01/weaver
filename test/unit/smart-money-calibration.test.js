// Guards for docs/audits/smart-money-early-entry-2026-10-11.md §4.
// These fail if the calibration decision is silently reverted.

const { expect } = require("chai");

describe("Smart Money calibration — audit §4 invariants", () => {
  it("WalletProfiler uses a 14-day early-entry lookahead", () => {
    const p = global.W && global.W.smartMoney && global.W.smartMoney.walletProfiler
      && global.W.smartMoney.walletProfiler._internal;
    expect(p, "walletProfiler._internal must be exposed").to.be.an("object");
    expect(p.EARLY_ENTRY_LOOKAHEAD_DAYS).to.equal(14);
  });

  it("WalletProfiler keeps the 20% pump threshold", () => {
    const p = global.W && global.W.smartMoney && global.W.smartMoney.walletProfiler
      && global.W.smartMoney.walletProfiler._internal;
    expect(p.EARLY_ENTRY_PUMP_PCT).to.equal(20);
  });

  it("ConvergenceDetector keeps MIN_HISTORICAL_EARLY_RATE at 0.5", () => {
    const d = global.W && global.W.smartMoney && global.W.smartMoney.convergenceDetector
      && global.W.smartMoney.convergenceDetector._internal;
    expect(d, "convergenceDetector._internal must be exposed").to.be.an("object");
    expect(d.MIN_HISTORICAL_EARLY_RATE).to.equal(0.5);
  });

  it("ConvergenceDetector requires >= 10 priced buys before evaluating", () => {
    const d = global.W && global.W.smartMoney && global.W.smartMoney.convergenceDetector
      && global.W.smartMoney.convergenceDetector._internal;
    expect(d.MIN_EARLY_ENTRY_SAMPLE).to.equal(10);
  });
});
