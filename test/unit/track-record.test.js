const { expect } = require("chai");

// ── Track Record — Core ───────────────────────────────────────

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
    expect(after.outcome.realizedResult).to.equal(100);
    expect(after.outcome.realizedResultPct).to.equal(20);
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
    expect(after.userDecision.action).to.equal("UNSET");
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

// ── Track Record — Migration (real fixtures) ──────────────────

describe("Track Record — Migration (real fixtures)", () => {
  const LEGACY_KEY = "track_record_v0";

  function reset() {
    W.store.set("track_record", []);
    W.store.set(LEGACY_KEY, []);
  }

  it("migrates a legacy record with a missing recordId deterministically", () => {
    reset();
    const legacy = [
      {
        symbol: "BTC",
        createdAt: 1700000000000,
        opportunityScore: 72,
        confidence: 0.78,
      },
    ];
    W.store.set(LEGACY_KEY, legacy);
    const summary1 = W.trackRecord.migrate();
    expect(summary1.migratedLegacyId).to.equal(1);

    const after1 = W.trackRecord.getAll();
    expect(after1).to.have.length(1);
    expect(after1[0].recordId).to.match(/^track-legacy-/);
    const firstId = after1[0].recordId;

    // Second run — same deterministic ID, no duplicates.
    W.store.set(LEGACY_KEY, legacy);
    const summary2 = W.trackRecord.migrate();
    const after2 = W.trackRecord.getAll();
    expect(after2).to.have.length(1);
    expect(after2[0].recordId).to.equal(firstId);
    expect(summary2.deduped).to.be.greaterThan(0);
  });

  it("does not duplicate records on repeated migration runs", () => {
    reset();
    W.store.set(LEGACY_KEY, [
      { recordId: "L1", symbol: "ETH", createdAt: 1700000000001 },
      { recordId: "L2", symbol: "SOL", createdAt: 1700000000002 },
    ]);
    W.trackRecord.migrate();
    W.trackRecord.migrate();
    W.trackRecord.migrate();
    const all = W.trackRecord.getAll();
    expect(all).to.have.length(2);
  });

  it("deduplicates identical canonical/legacy records", () => {
    reset();
    const record = W.trackRecord.createFromAnalysis(
      { opportunityScore: 50, confidence: 0.5, scoringVersion: "vs-1" },
      { symbol: "BTC" },
    );
    W.store.set(LEGACY_KEY, [
      {
        recordId: record.recordId,
        symbol: "BTC",
        opportunityScore: 50,
        confidence: 0.5,
        scoringVersion: "vs-1",
        analysisTimestamp: record.weaverSnapshot.analysisTimestamp,
      },
    ]);
    const summary = W.trackRecord.migrate();
    expect(summary.deduped).to.be.greaterThan(0);
    expect(W.trackRecord.getAll()).to.have.length(1);
  });

  it("does NOT overwrite canonical with legacy when immutable snapshots differ", () => {
    reset();
    const record = W.trackRecord.createFromAnalysis(
      { opportunityScore: 90, confidence: 0.9, scoringVersion: "vs-1" },
      { symbol: "BTC" },
    );
    W.store.set(LEGACY_KEY, [
      {
        recordId: record.recordId,
        symbol: "BTC",
        opportunityScore: 10,
        confidence: 0.1,
        scoringVersion: "vs-1",
      },
    ]);
    const summary = W.trackRecord.migrate();
    expect(summary.conflicts).to.equal(1);

    const all = W.trackRecord.getAll();
    expect(all).to.have.length(2);

    const canonical = all.find((r) => r.recordId === record.recordId);
    expect(canonical.weaverSnapshot.unifiedVerdict.score).to.equal(90);

    const preserved = all.find((r) => r.id !== record.id);
    expect(preserved.migration.status).to.equal("CONFLICT");
    expect(preserved.migration.originalRecordId).to.equal(record.recordId);
  });

  it("uses a deterministic conflict ID", () => {
    reset();
    const r1 = W.trackRecord.createFromAnalysis(
      { opportunityScore: 90, scoringVersion: "vs-1" },
      { symbol: "BTC" },
    );
    W.store.set(LEGACY_KEY, [
      {
        recordId: r1.recordId,
        symbol: "BTC",
        opportunityScore: 10,
        scoringVersion: "vs-1",
      },
    ]);
    W.trackRecord.migrate();
    const ids1 = W.trackRecord
      .getAll()
      .map((r) => r.recordId)
      .sort();

    // Second independent run with the same canonical recordId.
    reset();
    const now = W.trackRecord.createFromAnalysis(
      { opportunityScore: 90, scoringVersion: "vs-1" },
      { symbol: "BTC" },
    );
    // Force the same canonical recordId as the first run.
    const records = W.trackRecord.getAll();
    records[0].recordId = r1.recordId;
    W.store.set("track_record", records);
    W.store.set(LEGACY_KEY, [
      {
        recordId: r1.recordId,
        symbol: "BTC",
        opportunityScore: 10,
        scoringVersion: "vs-1",
      },
    ]);
    W.trackRecord.migrate();
    const ids2 = W.trackRecord
      .getAll()
      .map((r) => r.recordId)
      .sort();

    expect(ids1).to.deep.equal(ids2);
  });

  it("does not duplicate conflict records on repeated runs", () => {
    reset();
    const r = W.trackRecord.createFromAnalysis(
      { opportunityScore: 90, scoringVersion: "vs-1" },
      { symbol: "BTC" },
    );
    W.store.set(LEGACY_KEY, [
      {
        recordId: r.recordId,
        symbol: "BTC",
        opportunityScore: 10,
        scoringVersion: "vs-1",
      },
    ]);
    W.trackRecord.migrate();
    W.trackRecord.migrate();
    W.trackRecord.migrate();
    // Canonical + one preserved conflict = 2 total.
    expect(W.trackRecord.getAll()).to.have.length(2);
  });

  it("quarantines malformed records with a deterministic ID", () => {
    reset();
    W.store.set(LEGACY_KEY, [null, "not-an-object", 42]);
    const s1 = W.trackRecord.migrate();
    expect(s1.quarantined).to.equal(3);

    // Second run does not duplicate quarantines.
    const s2 = W.trackRecord.migrate();
    expect(W.trackRecord.getAll().length).to.be.at.most(3);
    expect(s2.quarantined + s2.deduped).to.be.greaterThan(0);

    // Deterministic IDs.
    const ids = W.trackRecord
      .getAll()
      .map((r) => r.recordId)
      .filter((id) => id.startsWith("track-quarantine-"));
    expect(ids.length).to.equal(3);
    expect(new Set(ids).size).to.equal(3);
  });

  it("quarantines unknown schema versions rather than silently interpreting them", () => {
    reset();
    W.store.set(LEGACY_KEY, [
      { schemaVersion: "track-record-v99", symbol: "X" },
    ]);
    const s = W.trackRecord.migrate();
    expect(s.quarantined).to.equal(1);
    const all = W.trackRecord.getAll();
    expect(all[0].migration.status).to.equal("QUARANTINED");
    expect(all[0].migration.reason).to.equal("UNKNOWN_SCHEMA_VERSION");
  });

  it("does not mutate createdAt or weaverSnapshot on re-run", () => {
    reset();
    W.store.set(LEGACY_KEY, [
      {
        recordId: "R1",
        symbol: "BTC",
        createdAt: 1700000000000,
        opportunityScore: 50,
      },
    ]);
    W.trackRecord.migrate();
    const a = W.trackRecord.getAll()[0];
    const createdAtBefore = a.createdAt;
    const scoreBefore = a.weaverSnapshot.unifiedVerdict.score;

    W.trackRecord.migrate();
    const b = W.trackRecord.getAll()[0];
    expect(b.createdAt).to.equal(createdAtBefore);
    expect(b.weaverSnapshot.unifiedVerdict.score).to.equal(scoreBefore);
  });

  it("does not repeatedly change migratedAt", () => {
    reset();
    W.store.set(LEGACY_KEY, [
      {
        recordId: "R1",
        symbol: "BTC",
        createdAt: 1700000000000,
        opportunityScore: 50,
      },
    ]);
    W.trackRecord.migrate();
    const t1 = W.trackRecord.getAll()[0].migration.migratedAt;

    // Wait a tick so Date.now() would differ if the code re-set it.
    return new Promise((resolve) => {
      setTimeout(() => {
        W.trackRecord.migrate();
        const t2 = W.trackRecord.getAll()[0].migration.migratedAt;
        expect(t2).to.equal(t1);
        resolve();
      }, 10);
    });
  });
});

// ── Track Record — Outcome holding duration ───────────────────

describe("Track Record — Outcome holding duration", () => {
  beforeEach(() => W.store.set("track_record", []));

  it("computes holdingDurationMs when both timestamps are present", () => {
    const r = W.trackRecord.createFromAnalysis(
      { score: 50 },
      { symbol: "BTC" },
    );
    W.trackRecord.updateOutcome(r.recordId, {
      entryTimestamp: 1700000000000,
      exitTimestamp: 1700000000000 + 5 * 86400000,
      userEntryPrice: 100,
      userExitPrice: 120,
      positionSize: 1,
      status: "CLOSED",
    });
    const after = W.trackRecord.getById(r.recordId);
    expect(after.outcome.holdingDurationMs).to.equal(5 * 86400000);
  });

  it("leaves holdingDurationMs null when entryTimestamp is missing", () => {
    const r = W.trackRecord.createFromAnalysis(
      { score: 50 },
      { symbol: "BTC" },
    );
    W.trackRecord.updateOutcome(r.recordId, {
      exitTimestamp: 1700000000000,
      status: "CLOSED",
    });
    const after = W.trackRecord.getById(r.recordId);
    expect(after.outcome.holdingDurationMs).to.equal(null);
  });

  it("leaves holdingDurationMs null when exitTimestamp is missing", () => {
    const r = W.trackRecord.createFromAnalysis(
      { score: 50 },
      { symbol: "BTC" },
    );
    W.trackRecord.updateOutcome(r.recordId, {
      entryTimestamp: 1700000000000,
      status: "OPEN",
    });
    const after = W.trackRecord.getById(r.recordId);
    expect(after.outcome.holdingDurationMs).to.equal(null);
  });

  it("leaves holdingDurationMs null when exit is before entry", () => {
    const r = W.trackRecord.createFromAnalysis(
      { score: 50 },
      { symbol: "BTC" },
    );
    W.trackRecord.updateOutcome(r.recordId, {
      entryTimestamp: 1700000000000,
      exitTimestamp: 1699999990000,
      status: "CLOSED",
    });
    const after = W.trackRecord.getById(r.recordId);
    expect(after.outcome.holdingDurationMs).to.equal(null);
  });
});
