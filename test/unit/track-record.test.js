const { expect } = require("chai");

describe("Track Record — Core", () => {
  beforeEach(() => {
    W.store.set("track_record", []);
  });

  it("creates a record with immutable snapshot", () => {
    const analysis = {
      score: 72,
      confidence: 0.78,
      evidenceQuality: "PARTIAL",
      scenario: { classification: "POSITIVE", strength: 0.6 },
      evidence: {
        supporting: [{ title: "Volume rising" }],
        contradicting: [{ title: "High concentration" }],
        missing: ["holder history"],
      },
      methodologyVersion: "vm-2",
      scoringVersion: "vs-3",
      analysisTimestamp: 1700000000000,
    };
    const record = W.trackRecord.createFromAnalysis(analysis, {
      symbol: "BTC",
      name: "Bitcoin",
    });

    expect(record.recordId).to.be.a("string");
    expect(record.createdAt).to.be.a("number");
    expect(record.weaverSnapshot.unifiedVerdict.score).to.equal(72);
    expect(record.weaverSnapshot.unifiedVerdict.confidence).to.equal(0.78);
    expect(record.weaverSnapshot.scenario.classification).to.equal("POSITIVE");
    expect(record.weaverSnapshot.evidence.supporting).to.have.length(1);
    expect(record.weaverSnapshot.evidence.contradicting).to.have.length(1);
    expect(record.weaverSnapshot.methodologyVersion).to.equal("vm-2");
    expect(record.weaverSnapshot.scoringVersion).to.equal("vs-3");
  });

  it("keeps null confidence as null (no false precision)", () => {
    const record = W.trackRecord.createFromAnalysis(
      { score: 50, confidence: null },
      { symbol: "X" },
    );
    expect(record.weaverSnapshot.unifiedVerdict.confidence).to.equal(null);
  });

  it("immutable snapshot cannot be mutated via updateDecision", () => {
    const record = W.trackRecord.createFromAnalysis(
      { score: 80, confidence: 0.9, methodologyVersion: "v1" },
      { symbol: "BTC" },
    );
    // Attempt to smuggle a weaverSnapshot mutation through updateDecision
    W.trackRecord.updateDecision(record.recordId, {
      action: "WATCH",
      weaverSnapshot: { unifiedVerdict: { score: 0 } },
    });
    const after = W.trackRecord.getById(record.recordId);
    expect(after.weaverSnapshot.unifiedVerdict.score).to.equal(80);
    expect(after.weaverSnapshot.methodologyVersion).to.equal("v1");
    expect(after.userDecision.action).to.equal("WATCH");
  });

  it("immutable createdAt cannot be changed", () => {
    const record = W.trackRecord.createFromAnalysis(
      { score: 50 },
      { symbol: "BTC" },
    );
    const before = record.createdAt;
    W.trackRecord.updateDecision(record.recordId, { action: "WATCH" });
    const after = W.trackRecord.getById(record.recordId);
    expect(after.createdAt).to.equal(before);
  });

  it("missing entry price leaves realizedResult as null", () => {
    const record = W.trackRecord.createFromAnalysis(
      { score: 50 },
      { symbol: "BTC" },
    );
    W.trackRecord.updateOutcome(record.recordId, {
      userExitPrice: 100,
      positionSize: 10,
      status: "CLOSED",
    });
    const after = W.trackRecord.getById(record.recordId);
    expect(after.outcome.realizedResult).to.equal(null);
    expect(after.outcome.realizedResultPct).to.equal(null);
  });

  it("computes realizedResult only when all inputs are known", () => {
    const record = W.trackRecord.createFromAnalysis(
      { score: 50 },
      { symbol: "BTC" },
    );
    W.trackRecord.updateOutcome(record.recordId, {
      userEntryPrice: 100,
      userExitPrice: 120,
      positionSize: 5,
      status: "CLOSED",
    });
    const after = W.trackRecord.getById(record.recordId);
    expect(after.outcome.realizedResult).to.equal(100); // (120-100)*5
    expect(after.outcome.realizedResultPct).to.equal(20); // 20%
  });

  it("invalid enum values are normalized to safe defaults", () => {
    const record = W.trackRecord.createFromAnalysis(
      { score: 50 },
      { symbol: "BTC" },
    );
    W.trackRecord.updateDecision(record.recordId, {
      action: "MALICIOUS_ACTION",
    });
    W.trackRecord.updateOutcome(record.recordId, {
      status: "INVALID",
      outcomeSource: "FAKE",
    });
    const after = W.trackRecord.getById(record.recordId);
    expect(after.userDecision.action).to.equal("NO_DECISION");
    expect(after.outcome.status).to.equal("UNKNOWN");
    expect(after.outcome.outcomeSource).to.equal("UNKNOWN");
  });

  it("XSS: notes are safe when rendered", () => {
    const record = W.trackRecord.createFromAnalysis(
      { score: 50 },
      { symbol: "BTC" },
    );
    W.trackRecord.updateDecision(record.recordId, {
      action: "WATCH",
      notes: "<script>alert(1)</script>",
    });
    const after = W.trackRecord.getById(record.recordId);
    const escaped = W.fmt.escapeHTML(after.userDecision.notes);
    expect(escaped).to.not.include("<script>");
    expect(escaped).to.include("&lt;script&gt;");
  });

  it("CSV export neutralizes formula injection", () => {
    const record = W.trackRecord.createFromAnalysis(
      { score: 50 },
      { symbol: "BTC" },
    );
    W.trackRecord.updateDecision(record.recordId, {
      action: "WATCH",
      notes: "=cmd|'/c calc'!A1",
    });
    const csv = W.trackRecord.exportCSV();
    // Every cell starting with =, +, -, @ must be prefixed with '
    expect(csv).to.not.match(/,=cmd/);
    expect(csv).to.match(/,'=cmd|^'=cmd/);
  });

  it("persistence round-trips", () => {
    const r1 = W.trackRecord.createFromAnalysis(
      { score: 60 },
      { symbol: "BTC" },
    );
    const all = W.trackRecord.getAll();
    expect(all.length).to.equal(1);
    expect(all[0].recordId).to.equal(r1.recordId);
  });

  it("delete removes the record", () => {
    const r = W.trackRecord.createFromAnalysis(
      { score: 60 },
      { symbol: "BTC" },
    );
    W.trackRecord.deleteRecord(r.recordId);
    expect(W.trackRecord.getAll()).to.have.length(0);
  });
});

describe("Track Record — Migration", () => {
  beforeEach(() => {
    W.store.set("track_record", []);
    W.store.set("track_record_v0", []);
  });

  it("idempotency: running migration twice creates no additional records", () => {
    // There are no legacy keys registered by default, so migration on an
    // empty store should be a no-op both times.
    const a = W.trackRecord.migrate();
    const b = W.trackRecord.migrate();
    expect(a.migrated).to.equal(b.migrated);
    expect(a.conflicts).to.equal(b.conflicts);
    expect(W.trackRecord.getAll()).to.have.length(0);
  });
});
