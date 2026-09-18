const { expect } = require("chai");

describe("Track Record security hardening", () => {
  beforeEach(() => W.store.clearAll());

  it("rejects dangerous update paths without changing Object.prototype", () => {
    const record = W.trackRecord.capture({
      asset: "SEC",
      assetId: { symbol: "SEC", name: "Security", chainId: "unknown" },
      unifiedVerdict: {},
    });
    const result = W.trackRecord.update(
      record.id,
      { "__proto__.polluted": true },
      "security test",
    );
    expect(result.ok).to.equal(false);
    expect({}.polluted).to.equal(undefined);
  });

  it("escapes notes and never evaluates stored text", async () => {
    const record = W.trackRecord.capture({
      asset: "SEC",
      assetId: { symbol: "SEC", name: "Security", chainId: "unknown" },
      unifiedVerdict: {},
    });
    W.trackRecord.update(
      record.id,
      { "userDecision.notes": "<script>window.__trackXss = true</script>" },
      "security test",
    );
    const view = document.createElement("div");
    await W.trackRecord.render(view);
    expect(view.querySelector("script")).to.equal(null);
    expect(window.__trackXss).to.equal(undefined);
  });

  it("neutralizes all formula-leading CSV values", () => {
    const record = W.trackRecord.capture({
      asset: "SEC",
      assetId: { symbol: "SEC", name: "Security", chainId: "unknown" },
      unifiedVerdict: {},
    });
    W.trackRecord.update(
      record.id,
      {
        "userDecision.notes": "=danger",
        "outcome.resultCurrency": "@danger",
        "outcome.notes": "-danger",
        "outcome.outcomeSource": "USER_ENTERED",
      },
      "security test",
    );
    const csv = W.trackRecord.buildCSV();
    expect(csv).to.include("'-danger");
    expect(csv).to.include("'@danger");
    expect(csv).to.include("'=danger");
  });

  it("does not expose track record contents through telemetry APIs", () => {
    const record = W.trackRecord.capture({
      asset: "SEC",
      assetId: { symbol: "SEC", name: "Security", chainId: "unknown" },
      unifiedVerdict: {},
    });
    expect(record.weaverSnapshot.asset).to.equal("SEC");
    expect(W.sentryBuffer || []).to.deep.equal([]);
  });
});
