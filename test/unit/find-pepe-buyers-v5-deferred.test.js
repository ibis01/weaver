"use strict";

// v1.5 §3.4 deferred sub-reasons. Locks down:
//  - Crossmint, EntryPoint, unlisted-quote acquisitions get the right
//    reason_code, not generic no-decisive-evidence
//  - acceptanceCheck separates deferred from residual
//  - §6.6 ceiling applies to residual only

const assert = require("node:assert/strict");
const { acceptanceCheck } = require("../../scripts/oneoff/find-pepe-buyers-v5.js");

describe("acceptanceCheck — v1.5 §3.4 sub-reasons", () => {
  function one(acqs) {
    return { classification: "NOT_BUYER", acquisitions: acqs };
  }
  function acq(rc) {
    return { classification: "UNRESOLVED", reason_code: rc };
  }

  it("counts SPEC_DEFERRED_* into deferred, not residual", () => {
    const r = acceptanceCheck([one([
      acq("SPEC_DEFERRED_SPONSORED_PROXY"),
      acq("SPEC_DEFERRED_ERC4337"),
      acq("SPEC_DEFERRED_UNLISTED_QUOTE"),
      acq("no-decisive-evidence"),
    ])], 10);
    assert.equal(r.deferredTotal, 3);
    assert.equal(r.residualTotal, 1);
  });

  it("§6.6 ceiling uses residual, not raw UNRESOLVED", () => {
    // 3 deferred + 1 residual = 4 UNRESOLVED out of 4 acquisitions total.
    // Raw = 100%. Residual = 25%. Ceiling should pass.
    const r = acceptanceCheck([one([
      acq("SPEC_DEFERRED_SPONSORED_PROXY"),
      acq("SPEC_DEFERRED_ERC4337"),
      acq("SPEC_DEFERRED_UNLISTED_QUOTE"),
      acq("no-decisive-evidence"),
    ])], 10);
    assert.equal(r.rawUnresolvedPct, 100);
    assert.equal(r.residualPct, 25);
    assert.equal(r.unresolvedCeilingPass, true);
  });

  it("counts provider-error-tx as PROVIDER_FAILURE residual", () => {
    const r = acceptanceCheck([one([
      { classification: "UNRESOLVED", reason_code: "provider-error-tx" },
      { classification: "UNRESOLVED", reason_code: "provider-error-tx" },
    ])], 10);
    assert.equal(r.unresolvedByReason.PROVIDER_FAILURE, 2);
    assert.equal(r.unresolvedByReason.TRACE_AMBIGUITY, 0);
  });

  it("counts provider-error-transfers as PROVIDER_FAILURE residual", () => {
    const r = acceptanceCheck([one([
      acq("provider-error-transfers"),
      acq("provider-error-tx"),
      acq("no-decisive-evidence"),
    ])], 10);
    assert.equal(r.unresolvedByReason.PROVIDER_FAILURE, 2);
    assert.equal(r.unresolvedByReason.TRACE_AMBIGUITY, 1);
  });

  it("fails ceiling when residual exceeds 40%", () => {
    const acqs = [];
    for (let i = 0; i < 50; i++) acqs.push(acq("no-decisive-evidence"));
    for (let i = 0; i < 50; i++) acqs.push({ classification: "INTERMEDIARY", reason_code: "x" });
    const r = acceptanceCheck([one(acqs)], 100);
    assert.equal(r.residualPct, 50);
    assert.equal(r.unresolvedCeilingPass, false);
  });

  it("keeps raw and residual visible in the output", () => {
    const r = acceptanceCheck([one([
      acq("SPEC_DEFERRED_SPONSORED_PROXY"),
      acq("no-decisive-evidence"),
    ])], 1);
    assert.ok("rawUnresolvedPct" in r);
    assert.ok("residualPct" in r);
    assert.ok("deferredTotal" in r);
    assert.ok("residualTotal" in r);
    assert.ok("unresolvedByReason" in r);
  });

  it("empty results do not throw", () => {
    const r = acceptanceCheck([], 0);
    assert.equal(r.totalAcquisitions, 0);
    assert.equal(r.unresolvedCeilingPass, true);
  });
});
