const { expect } = require("chai");

describe("Decision Engine (Hardened)", () => {
  it("should compute personal context with enriched fields", () => {
    const decisionEngine = global.W.decisionEngine;
    const assetId = { symbol: "BTC" };
    const portfolio = [{ symbol: "BTC", value: 5000 }];
    const context = decisionEngine.computePersonalContext(
      assetId,
      portfolio,
      [],
      [],
      [],
      { pattern: "none" },
      {},
    );
    expect(context.portfolioWeight).to.be.a("number");
    expect(context.behavioralRisk).to.equal("NONE");
  });

  it("should compute assessment with portfolio-aware impact", () => {
    const decisionEngine = global.W.decisionEngine;
    const signal = {
      id: "s1",
      type: "PRICE_MOVE",
      assetId: { symbol: "BTC" },
      rawData: { impactValue: 0.8 },
    };
    const context = {
      portfolioWeight: 0.5,
      watchlistStatus: "WATCHING",
      thesisStatus: "ACTIVE",
      recentDecisions: 0,
      behavioralRisk: "NONE",
    };
    const evidence = { confidence: 0.9 };
    const assessment = decisionEngine.computeAssessment(
      signal,
      context,
      evidence,
    );
    expect(assessment.impact).to.be.a("number");
    expect(assessment.relevance).to.be.greaterThan(0);
  });

  it("should not produce REBALANCE action", () => {
    const decisionEngine = global.W.decisionEngine;
    const signal = { id: "s1", type: "PRICE_MOVE", assetId: { symbol: "BTC" } };
    const assessment = {
      relevance: 0.8,
      impact: 0.7,
      urgency: 0.6,
      confidence: 0.9,
    };
    const priority = decisionEngine.computeDecisionPriority(signal, assessment);
    expect(priority.recommendedAction).to.not.equal("REBALANCE");
    expect([
      "MONITOR",
      "REVIEW_THESIS",
      "REVIEW_RISK",
      "LOG_DECISION",
    ]).to.include(priority.recommendedAction);
    expect(priority.score).to.be.a("number");
  });

  // ── Item 4 — null confidence must not collapse to zero ─────

  describe("null confidence is preserved as null, not zero", () => {
    const signal = (overrides = {}) => ({
      id: "s1",
      type: "PRICE_MOVE",
      assetId: { symbol: "BTC" },
      rawData: { impactValue: 0.8 },
      ...overrides,
    });

    const context = () => ({
      portfolioWeight: 0.5,
      watchlistStatus: "WATCHING",
      thesisStatus: "ACTIVE",
      recentDecisions: 0,
      behavioralRisk: "NONE",
    });

    it("impact is null when evidence confidence is null", () => {
      const a = global.W.decisionEngine.computeAssessment(signal(), context(), {
        confidence: null,
      });
      expect(a.impact).to.equal(null);
      expect(a.confidence).to.equal(null);
      // Relevance and urgency are always computable — they should
      // remain numbers even when confidence is unknown.
      expect(a.relevance).to.be.a("number");
      expect(a.urgency).to.be.a("number");
    });

    it("impact is a number when evidence confidence is known", () => {
      const a = global.W.decisionEngine.computeAssessment(signal(), context(), {
        confidence: 0.9,
      });
      expect(a.impact).to.be.a("number");
      expect(a.impact).to.be.within(0, 1);
    });

    it("priority score is null when any factor is null", () => {
      const priority = global.W.decisionEngine.computeDecisionPriority(
        signal(),
        {
          relevance: 0.8,
          impact: null,
          urgency: 0.6,
          confidence: null,
        },
      );
      expect(priority.score).to.equal(null);
      expect(priority.eligibility).to.equal("INSUFFICIENT_EVIDENCE");
    });

    it("priority score is a number when all factors are known", () => {
      const priority = global.W.decisionEngine.computeDecisionPriority(
        signal(),
        {
          relevance: 0.8,
          impact: 0.7,
          urgency: 0.6,
          confidence: 0.9,
        },
      );
      expect(priority.score).to.be.a("number");
      expect(priority.eligibility).to.equal("ELIGIBLE");
    });

    it("score is null, not zero — null and 0 are distinguishable", () => {
      const nullPriority = global.W.decisionEngine.computeDecisionPriority(
        signal(),
        {
          relevance: 0.8,
          impact: null,
          urgency: 0.6,
          confidence: null,
        },
      );
      const zeroPriority = global.W.decisionEngine.computeDecisionPriority(
        signal(),
        {
          relevance: 0,
          impact: 0,
          urgency: 0,
          confidence: 0,
        },
      );
      expect(nullPriority.score).to.equal(null);
      expect(zeroPriority.score).to.equal(0);
      expect(nullPriority.score).to.not.equal(zeroPriority.score);
      expect(nullPriority.eligibility).to.equal("INSUFFICIENT_EVIDENCE");
      expect(zeroPriority.eligibility).to.equal("ELIGIBLE");
    });

    it("an insufficient-evidence item is not silently filtered from run() output", () => {
      // We can't easily invoke run() without mocking the full events
      // pipeline, but we can assert the contract at the priority
      // level: an item with null score carries an eligibility flag
      // that callers can branch on. This is the invariant the
      // reviewer identified as missing.
      const priority = global.W.decisionEngine.computeDecisionPriority(
        signal(),
        {
          relevance: 0.9,
          impact: null,
          urgency: 0.9,
          confidence: null,
        },
      );
      expect(priority.eligibility).to.equal("INSUFFICIENT_EVIDENCE");
      // The reviewer's specific scenario: high relevance, high
      // urgency, unknown confidence. Under the old code this item
      // would have score 0 and be dropped by the `score > 0` filter.
      // Now it's explicitly tagged and eligible for display.
      expect(priority.score).to.equal(null);
    });
  });
});
