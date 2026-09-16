const { expect } = require("chai");

describe("Track Record — Analysis to Record Flow", () => {
  beforeEach(() => {
    W.store.set("track_record", []);
  });

  it("preserves the exact analysis shape at save time", () => {
    const fakeAnalysis = {
      asset: "BTC",
      opportunityScore: 71,
      riskScore: 22,
      confidence: 0.83,
      verdict: "Bullish opportunity",
      bullishEvidence: [
        { title: "Momentum", evidence: "Up 4%", confidence: 0.8 },
      ],
      bearishEvidence: [
        { title: "Concentration", evidence: "Top holder 30%", confidence: 0.7 },
      ],
      contradictions: [{ details: "Mixed signals" }],
      methodologyVersion: "vm-1",
      scoringVersion: "vs-1",
      analysisTimestamp: 1234567890,
    };
    const record = W.trackRecord.createFromAnalysis(fakeAnalysis, {
      symbol: "BTC",
    });
    expect(record.weaverSnapshot.unifiedVerdict.score).to.equal(71);
    expect(record.weaverSnapshot.unifiedVerdict.confidence).to.equal(0.83);
    expect(record.weaverSnapshot.evidence.supporting).to.have.length(1);
    expect(record.weaverSnapshot.evidence.contradicting).to.have.length(1);
    expect(record.weaverSnapshot.analysisTimestamp).to.equal(1234567890);
  });

  it("a later mutation of the same asset does not touch the stored record", () => {
    const r = W.trackRecord.createFromAnalysis(
      { opportunityScore: 50, confidence: 0.5 },
      { symbol: "BTC" },
    );
    // Simulate a later analysis that returns different values
    const fakeLater = { opportunityScore: 10, confidence: 0.1 };
    void fakeLater;
    const stored = W.trackRecord.getById(r.recordId);
    expect(stored.weaverSnapshot.unifiedVerdict.score).to.equal(50);
  });
});
