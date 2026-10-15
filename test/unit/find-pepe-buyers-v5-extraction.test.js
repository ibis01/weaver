"use strict";

// v1.4 §9.1 extraction contract. The bugs this locks down:
//  1. silent skip on provider error (was: cursor advanced, no record)
//  2. single-level split only (was: sub-chunks over LIMIT lost excess)

const assert = require("node:assert/strict");
const mod = require("../../scripts/oneoff/find-pepe-buyers-v5.js");

const { _fetchSwapLogs, _setSleepImpl, _constants } = mod;
const { LOGS_LIMIT } = _constants;

// Disable sleeps for tests.
_setSleepImpl(() => Promise.resolve());

function makeLog(i) {
  return {
    blockNumber: "0x1",
    transactionHash: "0x" + i.toString(16).padStart(64, "0"),
    topics: [],
    data: "0x",
  };
}

function logs(n) {
  return Array.from({ length: n }, (_, i) => makeLog(i));
}

describe("fetchSwapLogs — v1.4 §9.1 extraction", () => {
  it("marks complete when all chunks return under LIMIT", async () => {
    const mock = async () => ({ status: "1", result: logs(10) });
    const r = await _fetchSwapLogs(100, 200, 50, { fetcher: mock });
    assert.equal(r.report.complete, true);
    assert.equal(r.report.rangesFailed.length, 0);
    assert.equal(r.logs.length, 30); // 3 chunks × 10 logs
  });

  it("recurses when a chunk returns >= LIMIT", async () => {
    const calls = [];
    const mock = async (from, to) => {
      calls.push([from, to]);
      if (from === 100 && to === 200) return { status: "1", result: logs(LOGS_LIMIT) };
      return { status: "1", result: logs(5) };
    };
    const r = await _fetchSwapLogs(100, 200, 101, { fetcher: mock, maxDepth: 4 });
    assert.equal(r.report.complete, true);
    // Parent (100,200) + two children (100,150) and (151,200)
    assert.equal(calls.length, 3);
    assert.deepEqual(calls[1], [100, 150]);
    assert.deepEqual(calls[2], [151, 200]);
    assert.equal(r.logs.length, 10); // 5 from each child
  });

  it("fails closed on provider error (null response)", async () => {
    const mock = async () => null;
    const r = await _fetchSwapLogs(100, 200, 50, { fetcher: mock });
    assert.equal(r.report.complete, false);
    assert.equal(r.report.rangesFailed.length, 1);
    assert.equal(r.report.rangesFailed[0].reason, "provider-error");
    assert.equal(r.report.rangesFailed[0].from, 100);
    // Fail-closed: first chunk failed, we do NOT proceed to the second.
    // So r.logs is empty and only one range was attempted.
    assert.equal(r.logs.length, 0);
  });

  it("recurses into a child that is still over LIMIT (nested truncation)", async () => {
    const mock = async (from, to) => {
      // Grandparent too big
      if (from === 100 && to === 200) return { status: "1", result: logs(LOGS_LIMIT) };
      // Left child also too big
      if (from === 100 && to === 150) return { status: "1", result: logs(LOGS_LIMIT) };
      // Everything else is small
      return { status: "1", result: logs(3) };
    };
    const r = await _fetchSwapLogs(100, 200, 101, { fetcher: mock, maxDepth: 6 });
    assert.equal(r.report.complete, true);
    // (100,150) split into (100,125) and (126,150). Each 3 logs.
    // (151,200) returns 3 logs.
    // Total = 3 + 3 + 3 = 9
    assert.equal(r.logs.length, 9);
  });

  it("fails when max split depth is reached", async () => {
    const mock = async () => ({ status: "1", result: logs(LOGS_LIMIT) });
    const r = await _fetchSwapLogs(0, 5000, 5001, { fetcher: mock, maxDepth: 3 });
    assert.equal(r.report.complete, false);
    const reasons = r.report.rangesFailed.map((x) => x.reason);
    assert.ok(reasons.includes("max-split-depth"),
      "expected max-split-depth in " + JSON.stringify(reasons));
  });

  it("treats Blockscout 'no transactions found' as empty success", async () => {
    const mock = async () => ({
      status: "0", message: "No transactions found", result: [],
    });
    const r = await _fetchSwapLogs(100, 200, 50, { fetcher: mock });
    assert.equal(r.report.complete, true);
    assert.equal(r.logs.length, 0);
    assert.equal(r.report.rangesSucceeded, 3);
  });

  it("records non-empty status-0 responses as failures", async () => {
    const mock = async () => ({
      status: "0", message: "Rate limit exceeded", result: [],
    });
    const r = await _fetchSwapLogs(100, 200, 50, { fetcher: mock });
    assert.equal(r.report.complete, false);
    assert.ok(r.report.rangesFailed.length > 0);
    assert.equal(r.report.rangesFailed[0].reason, "api-status-0");
  });

  it("single-block chunk that returns LIMIT is reported as unresolved", async () => {
    const mock = async () => ({ status: "1", result: logs(LOGS_LIMIT) });
    const r = await _fetchSwapLogs(0, 1, 2, { fetcher: mock, maxDepth: 1 });
    assert.equal(r.report.complete, false);
    const reasons = r.report.rangesFailed.map((x) => x.reason);
    assert.ok(
      reasons.includes("single-block-over-limit") || reasons.includes("max-split-depth"),
      "expected pathological-range reason, got " + JSON.stringify(reasons),
    );
  });

  it("aggregates rangesFailed across multiple chunks", async () => {
    let call = 0;
    const mock = async () => {
      call++;
      if (call === 2) return null;
      return { status: "1", result: logs(5) };
    };
    const r = await _fetchSwapLogs(0, 300, 100, { fetcher: mock });
    // Chunk 0 succeeds, chunk 1 fails → fail-closed, stop.
    assert.equal(r.report.complete, false);
    assert.equal(r.logs.length, 5);
    assert.equal(r.report.rangesFailed.length, 1);
  });
});
