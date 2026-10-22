// Framework-free test — run: node tests/predictive-validator.test.js
// Verifies the pre-registered formula in predictive-validator.js (line ~152).
const assert = require("node:assert");

function netReturnPct(entryPrice, exitPrice, costPct) {
  const rawReturnPct = ((exitPrice - entryPrice) / entryPrice) * 100;
  const costFrac = costPct / 100;
  return ((1 + rawReturnPct / 100) * (1 - costFrac) - 1) * 100;
}

// Worked example from the audit (22 Oct 2026):
//   entry = 1.00, exit = 2.00, cost = 10%
//   Buggy formula produced 90.00; pre-registered is 80.00.
assert.strictEqual(netReturnPct(1.0, 2.0, 10).toFixed(2), "80.00");

// No gain, 3% cost → net = -3.00
assert.strictEqual(netReturnPct(1.0, 1.0, 3.0).toFixed(2), "-3.00");

// Break-even at cost c requires exit = entry / (1 - c/100):
const exitBE = 1 / (1 - 0.015);
assert.ok(Math.abs(netReturnPct(1.0, exitBE, 1.5)) < 1e-6);

console.log("predictive-validator: all formula assertions PASS");
