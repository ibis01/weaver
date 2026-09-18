const { expect } = require("chai");

const assetId = {
  chainId: "ethereum",
  contractAddress: "0x0000000000000000000000000000000000000001",
  symbol: "TEST",
  coingeckoId: "test-token",
  name: "Test Token",
};

const analysis = {
  asset: "TEST",
  assetId,
  opportunityScore: 72,
  riskScore: 28,
  confidence: null,
  scenario: "Bullish scenario",
  explanation: "Evidence is mixed but technical structure is supportive.",
  evidenceQuality: { status: "PARTIAL", reasons: ["Security unavailable"] },
  technical: { trend: "up", atr: 0.05 },
  fundamentals: { available: false, score: 50 },
  unifiedVerdict: {
    schemaVersion: "unified-verdict-v1",
    methodologyVersion: "methodology-v1",
    evidenceVersion: "evidence-gate-v1",
    provenance: [{ type: "technical", source: "ohlcv" }],
  },
};

describe("Track Record v2.1 hardening", () => {
  beforeEach(() => {
    W.store.clearAll();
  });

  function record() {
    return W.trackRecord.capture(analysis);
  }

  it("captures complete canonical AssetId and preserves the full analysis", () => {
    const saved = record();
    expect(saved.assetId).to.deep.equal(assetId);
    expect(saved.weaverSnapshot).to.deep.equal(analysis);
    expect(saved.weaverSnapshot.confidence).to.equal(null);
    expect(saved.schemaVersion).to.equal("track-record-v1");
  });

  it("preserves large historical evidence without arbitrary truncation", () => {
    const longReason = "evidence ".repeat(10000);
    const saved = W.trackRecord.capture({
      ...analysis,
      explanation: longReason,
    });
    expect(W.trackRecord.get(saved.id).weaverSnapshot.explanation).to.equal(
      longReason,
    );
  });

  it("rejects malformed records and prototype-pollution payloads", () => {
    expect(W.trackRecord.normalizeRecord(null)).to.equal(null);
    expect(
      W.trackRecord.normalizeRecord({ id: "bad", schemaVersion: "other" }),
    ).to.equal(null);
    const polluted = JSON.parse(
      '{"id":"x","schemaVersion":"track-record-v2.1","createdAt":"2026-01-01","assetId":{},"weaverSnapshot":{},"userDecision":{},"outcome":{},"__proto__":{"polluted":true}}',
    );
    expect(W.trackRecord.normalizeRecord(polluted)).to.equal(null);
    expect({}.polluted).to.equal(undefined);
  });

  it("normalizes legacy v1 records without dropping their historical snapshot", () => {
    const legacy = W.trackRecord.normalizeRecord({
      id: "legacy-1",
      schemaVersion: "track-record-v1",
      createdAt: new Date().toISOString(),
      asset: "LEGACY",
      weaverSnapshot: {
        asset: "LEGACY",
        confidence: null,
        explanation: "old evidence",
      },
      userDecision: { action: "UNSET", notes: "" },
      outcome: { userReported: { status: "UNSET", notes: "" } },
    });
    expect(legacy.schemaVersion).to.equal("track-record-v1");
    expect(legacy.assetId.symbol).to.equal("LEGACY");
    expect(legacy.weaverSnapshot.explanation).to.equal("old evidence");
  });

  it("requires a revision reason and only accepts whitelisted update paths", () => {
    const saved = record();
    expect(
      W.trackRecord.update(saved.id, { "userDecision.action": "ENTERED" }).ok,
    ).to.equal(false);
    expect(
      W.trackRecord.update(
        saved.id,
        { weaverSnapshot: { verdict: "tampered" } },
        "attempt",
      ).ok,
    ).to.equal(false);
    expect(
      W.trackRecord.update(saved.id, { "__proto__.polluted": true }, "attempt")
        .ok,
    ).to.equal(false);
    const updated = W.trackRecord.update(
      saved.id,
      {
        "userDecision.action": "ENTERED",
        "userDecision.notes": "My note",
        "userDecision.linkedTransactionId": "tx-1",
      },
      "User recorded decision",
    );
    expect(updated.ok).to.equal(true);
    expect(updated.record.weaverSnapshot).to.deep.equal(analysis);
    expect(updated.record.userDecision.action).to.equal("ENTERED");
    expect(updated.record.revisions).to.have.length(3);
    expect(updated.record.revisions[0].reason).to.equal(
      "User recorded decision",
    );
  });

  it("calculates outcome values safely and keeps zero-entry percentage null", () => {
    const saved = record();
    const updated = W.trackRecord.update(
      saved.id,
      {
        "userDecision.decisionTimestamp": "2026-01-01T00:00:00.000Z",
        "outcome.status": "REPORTED_GAIN",
        "outcome.userEntryPrice": 0,
        "outcome.userExitPrice": 2,
        "outcome.positionSize": 3,
        "outcome.outcomeTimestamp": "2026-01-02T00:00:00.000Z",
        "outcome.outcomeSource": "user-reported",
      },
      "Record observed outcome",
    );
    expect(updated.ok).to.equal(true);
    expect(updated.record.outcome.realizedResult).to.equal(6);
    expect(updated.record.outcome.realizedResultPct).to.equal(null);
    expect(updated.record.outcome.holdingDurationMs).to.equal(86400000);
  });

  it("returns null calculations for missing, negative, or malformed pricing", () => {
    const result = W.trackRecord.calculateOutcome(
      { userEntryPrice: -1, userExitPrice: "bad", positionSize: 2 },
      null,
    );
    expect(result.realizedResult).to.equal(null);
    expect(result.realizedResultPct).to.equal(null);
    expect(result.holdingDurationMs).to.equal(null);
  });

  it("creates no implicit portfolio linkage or telemetry side effects", () => {
    const saved = record();
    expect(saved.userDecision.linkedTransactionId).to.equal(null);
    expect(W.sentryBuffer || []).to.deep.equal([]);
  });

  it("escapes user notes when rendering the historical record", async () => {
    const saved = record();
    W.trackRecord.update(
      saved.id,
      { "userDecision.notes": '<img src=x onerror="alert(1)">' },
      "Test XSS escaping",
    );
    const view = document.createElement("div");
    await W.trackRecord.render(view);
    expect(view.querySelector("img")).to.equal(null);
    expect(view.innerHTML).to.include("&lt;img");
  });

  it("exports CSV with formula-injection-safe cells", () => {
    const saved = record();
    W.trackRecord.update(
      saved.id,
      {
        "userDecision.notes": '=HYPERLINK("https://evil.example")',
        "outcome.resultCurrency": "+CMD",
      },
      "Test CSV escaping",
    );
    const csv = W.trackRecord.buildCSV();
    expect(csv).to.include("'=HYPERLINK");
    expect(csv).to.include("'+CMD");
    expect(csv.split("\n")[0]).to.include("Record ID");
  });
});
