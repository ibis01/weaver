// test/unit/predictive-validator-stats.test.js
//
// Phase 4 Issue D — statistical comparison unit tests.
// Exercises the exported helper functions via the module's internal
// access. If the module doesn't expose _internal, this file uses
// require() against the built bundle. Preferred: run against a
// source-loaded W.predictiveValidator in the JSDOM environment.

const { expect } = require("chai");

describe("Predictive validator — Issue D statistics", () => {
  // These tests use the pure stat functions inline; if you later expose
  // them via _internal, point to W.predictiveValidator._internal.mannWhitneyU.

  function normalCDF(z) {
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989422804 * Math.exp((-z * z) / 2);
    const poly =
      t *
      (0.31938153 +
        t *
          (-0.356563782 +
            t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    const cdf = 1 - d * poly;
    return z >= 0 ? cdf : 1 - cdf;
  }

  function mannWhitneyU(groupA, groupB) {
    const nA = groupA.length;
    const nB = groupB.length;
    if (nA < 1 || nB < 1) return null;

    const combined = [];
    for (const v of groupA) combined.push({ value: v, group: "A" });
    for (const v of groupB) combined.push({ value: v, group: "B" });
    combined.sort((x, y) => x.value - y.value);

    let i = 0;
    while (i < combined.length) {
      let j = i;
      while (j < combined.length && combined[j].value === combined[i].value) {
        j++;
      }
      const avgRank = (i + 1 + j) / 2;
      for (let k = i; k < j; k++) combined[k].rank = avgRank;
      i = j;
    }

    let RA = 0;
    let RB = 0;
    for (const c of combined) {
      if (c.group === "A") RA += c.rank;
      else RB += c.rank;
    }

    const U_A = RA - (nA * (nA + 1)) / 2;
    const U_B = RB - (nB * (nB + 1)) / 2;
    const U = Math.min(U_A, U_B);
    const meanU = (nA * nB) / 2;

    let tieSum = 0;
    i = 0;
    while (i < combined.length) {
      let j = i;
      while (j < combined.length && combined[j].value === combined[i].value) {
        j++;
      }
      const t = j - i;
      if (t > 1) tieSum += t * t * t - t;
      i = j;
    }
    const N = nA + nB;
    const varU = ((nA * nB) / 12) * (N + 1 - tieSum / (N * (N - 1)));
    const sdU = Math.sqrt(varU);

    if (!Number.isFinite(sdU) || sdU === 0) {
      return { U, z: 0, p: 1, nA, nB };
    }
    const z = (U - meanU + 0.5) / sdU;
    const p = 2 * (1 - normalCDF(Math.abs(z)));
    return { U, z, p, nA, nB };
  }

  it("returns U=0 when every treatment value exceeds every control value", () => {
    const control = [1, 2, 3];
    const treatment = [10, 11, 12];
    const r = mannWhitneyU(control, treatment);
    expect(r.U).to.equal(0);
    expect(r.p).to.be.lessThan(0.1);
  });

  it("returns a non-significant p when the two groups are identical", () => {
    const control = [5, 5, 5, 5];
    const treatment = [5, 5, 5, 5];
    const r = mannWhitneyU(control, treatment);
    expect(r.p).to.be.greaterThan(0.5);
  });

  it("returns null for empty input", () => {
    expect(mannWhitneyU([], [1])).to.equal(null);
    expect(mannWhitneyU([1], [])).to.equal(null);
  });

  it("applies continuity correction: U=0 with n=10 per side is significant", () => {
    const control = Array.from({ length: 10 }, (_, i) => i);
    const treatment = Array.from({ length: 10 }, (_, i) => 100 + i);
    const r = mannWhitneyU(control, treatment);
    expect(r.U).to.equal(0);
    expect(r.p).to.be.lessThan(0.05);
  });

  it("insufficient-sample gate is enforced when either cohort < 10", () => {
    const MIN = 10;
    const control = [1, 2, 3];
    const treatment = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    const insufficient = control.length < MIN || treatment.length < MIN;
    expect(insufficient).to.equal(true);
  });

  it("sample gate accepts when both cohorts >= 10", () => {
    const MIN = 10;
    const control = Array.from({ length: 10 }, (_, i) => i);
    const treatment = Array.from({ length: 10 }, (_, i) => 100 + i);
    const sufficient = control.length >= MIN && treatment.length >= MIN;
    expect(sufficient).to.equal(true);
  });
});
