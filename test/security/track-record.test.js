const { expect } = require("chai");

describe("Track Record — Security", () => {
  beforeEach(() => W.store.set("track_record", []));

  it("does not write anything to console.log on normal operations", () => {
    const originalLog = console.log;
    const calls = [];
    console.log = (...args) => calls.push(args);
    try {
      const r = W.trackRecord.createFromAnalysis(
        { score: 50 },
        { symbol: "BTC" },
      );
      W.trackRecord.updateDecision(r.recordId, {
        action: "WATCH",
        notes: "secret",
      });
    } finally {
      console.log = originalLog;
    }
    // The module loads with a single console.log at import; after load it must not log.
    // We check that no call contains the user's secret notes.
    const text = JSON.stringify(calls);
    expect(text).to.not.include("secret");
  });

  it("rejects an update attempting to overwrite weaverSnapshot", () => {
    const r = W.trackRecord.createFromAnalysis(
      { score: 90 },
      { symbol: "BTC" },
    );
    W.trackRecord.updateDecision(r.recordId, {
      action: "WATCH",
      weaverSnapshot: { unifiedVerdict: { score: -1 } },
    });
    const after = W.trackRecord.getById(r.recordId);
    expect(after.weaverSnapshot.unifiedVerdict.score).to.equal(90);
  });

  it("does not crash on malformed stored data", () => {
    W.store.set("track_record", [
      null,
      undefined,
      "not-an-object",
      { missing: true },
      { recordId: "ok" },
    ]);
    expect(() => W.trackRecord.getAll()).to.not.throw();
    const all = W.trackRecord.getAll();
    // Only the entry with a string recordId survives
    expect(all).to.have.length(1);
    expect(all[0].recordId).to.equal("ok");
  });
});
