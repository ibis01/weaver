const { expect } = require("chai");

const timeMachinePath = require.resolve("../../js/features/timemachine.js");

describe("Time Machine historical cutoff", () => {
  before(() => {
    delete require.cache[timeMachinePath];
    require(timeMachinePath);
  });

  beforeEach(() => {
    global.W.store.clearAll();
  });

  it("selects the latest snapshot at or before the cutoff, never a future snapshot", () => {
    const now = Date.now();
    const day = 86400000;
    const beforeCutoff = { timestamp: now - 8 * day, id: "before" };
    const afterCutoff = { timestamp: now - 6 * day, id: "after" };
    global.W.store.set("tm_snapshots", [beforeCutoff, afterCutoff]);

    const selected = global.W.time.getSnapshotAt(7);
    expect(selected).to.equal(beforeCutoff);
  });

  it("returns null when no snapshot is eligible at the cutoff", () => {
    const now = Date.now();
    const day = 86400000;
    global.W.store.set("tm_snapshots", [
      { timestamp: now - 2 * day, id: "future" },
      { timestamp: "not-a-timestamp", id: "invalid" },
    ]);

    expect(global.W.time.getSnapshotAt(7)).to.equal(null);
  });
});
