// test/unit/prospective-score.test.js
//
// Gate 0d prospective scorer semantics (the pure scoreBuys/summarize core).
// The 2026-11-08 reconciliation (docs/audits/gate-0d-reconciliation-2026-11-08.md)
// established the ledger contract: outcomes.jsonl is an append-only attempt
// ledger, the LATEST row per txHash is canonical, `resolved` is terminal,
// `unresolved` is retry-eligible, and each txHash is attempted at most once
// per run. These tests pin that contract so the Phase 4 outcome pool can
// only grow honest rows.

const { expect } = require("chai");

const score = require("../../scripts/oneoff/prospective-score.js");

const NOW = Date.UTC(2026, 10, 15, 12, 0, 0); // 2026-11-15T12:00:00Z
const DAY = 86400000;

function buy(txHash, ts, overrides = {}) {
  return Object.assign(
    { wallet: "0xwallet", txHash, timestamp: ts, pepAmount: "1" },
    overrides
  );
}

// Fixed price series: $1.00 on 2026-10-01, $1.30 on 2026-10-15 (20d later),
// $0.80 on 2026-10-20. priceAt is the scorer's own implementation with a
// 2-day tolerance.
function makePriceAt(extra = []) {
  const prices = [
    { ts: Date.UTC(2026, 9, 1), p: 1.0 },
    { ts: Date.UTC(2026, 9, 15), p: 1.3 },
    { ts: Date.UTC(2026, 9, 20), p: 0.8 },
    ...extra,
  ].sort((a, b) => a.ts - b.ts);
  return (ts) => score.priceAt(prices, ts);
}

describe("prospective-score scoreBuys", function () {
  it("scores an elapsed buy with covered prices (fwdReturn + early flag)", function () {
    // Buy 2026-10-01 @ $1.00, horizon 2026-10-15 @ $1.30 → +30% → early.
    const buy0 = buy("0xa", Date.UTC(2026, 9, 1));
    const { rows, stats } = score.scoreBuys(
      [buy0],
      [],
      makePriceAt(),
      NOW
    );
    expect(rows).to.have.lengthOf(1);
    expect(rows[0].status).to.equal("resolved");
    expect(rows[0].fwdReturn).to.be.closeTo(0.3, 1e-12);
    expect(rows[0].early).to.equal(1);
    expect(rows[0].scoredAt).to.be.a("string");
    expect(stats.resolvedNow).to.equal(1);
  });

  it("marks early=1 exactly at the boundary (fwd == threshold is inclusive)", function () {
    // (6-5)/5 evaluates to the identical float as the 0.20 literal, so this
    // is a true boundary: inclusive must give early=1. Just below (5→5.9,
    // fwd=0.18) must give early=0.
    const priceAtFn = (ts) =>
      ts === Date.UTC(2026, 9, 1) ? 5.0 : ts === Date.UTC(2026, 9, 15) ? 6.0 : null;
    const { rows } = score.scoreBuys(
      [buy("0xa", Date.UTC(2026, 9, 1))],
      [],
      priceAtFn,
      NOW
    );
    expect(rows[0].early).to.equal(1);

    const below = (ts) =>
      ts === Date.UTC(2026, 9, 1) ? 5.0 : ts === Date.UTC(2026, 9, 15) ? 5.9 : null;
    const { rows: rows2 } = score.scoreBuys(
      [buy("0xa", Date.UTC(2026, 9, 1))],
      [],
      below,
      NOW
    );
    expect(rows2[0].early).to.equal(0);
  });

  it("skips a buy whose 14d horizon has not elapsed yet", function () {
    const { rows, stats } = score.scoreBuys(
      [buy("0xb", Date.UTC(2026, 11, 10))],
      [],
      makePriceAt(),
      NOW
    );
    expect(rows).to.have.lengthOf(0);
    expect(stats.notYet).to.equal(1);
  });

  it("records unresolved when price coverage is missing, with attemptedAt", function () {
    // Buy 2026-10-25: p0 uncovered (series ends 2026-10-20 + 2d tolerance).
    const { rows, stats } = score.scoreBuys(
      [buy("0xc", Date.UTC(2026, 9, 25))],
      [],
      makePriceAt(),
      NOW
    );
    expect(rows).to.have.lengthOf(1);
    expect(rows[0].status).to.equal("unresolved");
    expect(rows[0].attemptedAt).to.be.a("string");
    expect(rows[0]).to.not.have.property("fwdReturn");
    expect(stats.unresolved).to.equal(1);
  });

  it("RETRIES unresolved txs on the next run (latest row wins, resolved appended)", function () {
    const tx = buy("0xd", Date.UTC(2026, 9, 1));
    const staleAt = makePriceAt(); // p14 covered, p0 covered → resolves here
    const noPrices = () => null;

    // Run 1 (prices unavailable): unresolved ledger row.
    const run1 = score.scoreBuys([tx], [], noPrices, NOW);
    expect(run1.rows[0].status).to.equal("unresolved");

    // Run 2 (prices refreshed): same tx must be re-attempted and resolve.
    const run2 = score.scoreBuys([tx], run1.rows, makePriceAt(), NOW + DAY);
    expect(run2.rows).to.have.lengthOf(1);
    expect(run2.rows[0].status).to.equal("resolved");

    const canon = score.canonicalOutcomes([...run1.rows, ...run2.rows]);
    expect(canon.get("0xd").status).to.equal("resolved");
  });

  it("never re-scores a resolved tx (terminal state)", function () {
    const tx = buy("0xe", Date.UTC(2026, 9, 1));
    const prior = [
      { txHash: "0xe", status: "resolved", fwdReturn: 0.5, early: 1 },
    ];
    const { rows, stats } = score.scoreBuys(
      [tx],
      prior,
      makePriceAt(),
      NOW
    );
    expect(rows).to.have.lengthOf(0);
    expect(stats.skippedResolved).to.equal(1);
    expect(stats.attempted).to.equal(0);
  });

  it("attempts a duplicated buy row only once per run (no duplicate outcomes)", function () {
    // The 2026-11-08 defect: buys.jsonl contained the same txHash twice and
    // the scorer emitted two identical outcome rows in a single run.
    const tx = buy("0xf", Date.UTC(2026, 9, 1));
    const dup = buy("0xf", Date.UTC(2026, 9, 1), { pepAmount: "2" });
    const { rows, stats } = score.scoreBuys(
      [tx, dup],
      [],
      makePriceAt(),
      NOW
    );
    expect(rows).to.have.lengthOf(1);
    expect(stats.attempted).to.equal(1);
  });
});

describe("prospective-score summarize (latest-wins ledger)", function () {
  it("uses the latest row per txHash and ignores legacy duplicate rows", function () {
    const all = [
      { txHash: "0x1", status: "resolved", fwdReturn: 0.1, early: 0 },
      // Legacy duplicate pair (identical unresolved rows from 2026-11-08):
      { txHash: "0x2", status: "unresolved" },
      { txHash: "0x2", status: "unresolved" },
      // Retry succeeded on a later attempt:
      { txHash: "0x3", status: "unresolved", attemptedAt: "2026-11-08T04:28:00.000Z" },
      { txHash: "0x3", status: "resolved", fwdReturn: 0.3, early: 1, scoredAt: "2026-11-15T04:28:00.000Z" },
    ];
    const s = score.summarize(all);
    expect(s.total).to.equal(3);
    expect(s.resolved).to.equal(2);
    expect(s.unresolved).to.equal(1);
    expect(s.earlyFraction).to.be.closeTo(0.5, 1e-12);
    expect(s.meanFwdReturn).to.be.closeTo(0.2, 1e-12);
  });

  it("reports zero resolved without fabricating rates", function () {
    const s = score.summarize([{ txHash: "0x1", status: "unresolved" }]);
    expect(s.resolved).to.equal(0);
    expect(s.earlyFraction).to.be.undefined;
    expect(s.meanFwdReturn).to.be.undefined;
  });
});
