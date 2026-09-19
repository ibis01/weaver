// test/unit/token-analysis-unavailable.test.js
//
// Regression suite for the analyze() UNAVAILABLE path.
//
// Bug guarded against: when no signals were collected AND no technical
// data was available (e.g. network down), analyze() returned a partial
// object that rendered as:
//
//     Opportunity Score: 0/100       (should be "—")
//     Risk Score:        0/100       (should be "—")
//     Evidence Strength: N/A
//     Signals Analyzed:  undefined   (should be "—")
//     Scenario strength: N/A%        (should be "—")
//
// The fix makes the early return explicit and complete, and hardens
// the renderer's formatters. Same principle as the Gem Agent Shield
// P0: unknown ≠ zero, and missing must never render as a broken string.

const { expect } = require("chai");

describe("Token Analysis — UNAVAILABLE evidence path", () => {
  let origTech, origApi, origEvents, origShield, origUnified, origUi, origTr;

  function installUnavailableMocks() {
    // No technical module → analyze() throws → technical = null
    W.technicalAnalysis = {
      analyze: async () => {
        throw new Error("Network is temporarily unavailable.");
      },
    };
    // No market data → fundamentalReport unavailable
    W.api = {
      coin: async () => {
        throw new Error("Network is temporarily unavailable.");
      },
    };
    // No signals collected
    W.events = { collectEvents: async () => [] };
    // No Shield evidence
    W.shield = { CHAINS: {}, getEvidence: () => null };
    // No unified verdict composition
    W.unifiedVerdict = { compose: () => null };
    // Minimal UI hooks the renderer touches
    W.ui = {
      spinner: () => "<div>loading</div>",
      toast: () => {},
      evidenceDrawer: { open: () => {} },
    };
    // Suppress the capture-track-record button
    W.trackRecord = null;
  }

  beforeEach(() => {
    origTech = W.technicalAnalysis;
    origApi = W.api;
    origEvents = W.events;
    origShield = W.shield;
    origUnified = W.unifiedVerdict;
    origUi = W.ui;
    origTr = W.trackRecord;
  });

  afterEach(() => {
    W.technicalAnalysis = origTech;
    W.api = origApi;
    W.events = origEvents;
    W.shield = origShield;
    W.unifiedVerdict = origUnified;
    W.ui = origUi;
    W.trackRecord = origTr;
  });

  // ── analyze() contract ────────────────────────────────────────

  describe("analyze() returns a complete honest shape", () => {
    it("returns null scores, not 0, when both technical and signals are absent", async () => {
      installUnavailableMocks();
      const result = await W.tokenAnalysis.analyze("BTC", {});

      expect(result.opportunityScore).to.equal(null);
      expect(result.riskScore).to.equal(null);
      expect(result.actionConfidence).to.equal(null);
      expect(result.confidence).to.equal(null);
      expect(result.error).to.equal(undefined);
    });

    it("populates signalsCount (never leaves it undefined)", async () => {
      installUnavailableMocks();
      const result = await W.tokenAnalysis.analyze("BTC", {});
      // 0 is a fact here: collectEvents ran and returned no matches.
      expect(result.signalsCount).to.equal(0);
      expect(result.signalsCount).to.not.equal(undefined);
    });

    it("populates evidenceQuality with status UNAVAILABLE and reasons", async () => {
      installUnavailableMocks();
      const result = await W.tokenAnalysis.analyze("BTC", {});

      expect(result.evidenceQuality).to.be.an("object");
      expect(result.evidenceQuality.status).to.equal("UNAVAILABLE");
      expect(result.evidenceQuality.reasons)
        .to.be.an("array")
        .with.length.greaterThan(0);
    });

    it("provides neutral scenario, actionReasons and interpretation", async () => {
      installUnavailableMocks();
      const result = await W.tokenAnalysis.analyze("BTC", {});

      expect(result.scenario).to.be.a("string").and.not.empty;
      expect(result.action).to.equal("HOLD");
      expect(result.actionReasons).to.be.an("array").and.not.empty;
      expect(result.actionInterpretation).to.be.a("string").and.not.empty;
    });

    it("does not claim a positive verdict when evidence is absent", async () => {
      installUnavailableMocks();
      const result = await W.tokenAnalysis.analyze("BTC", {});

      expect(result.verdict).to.not.match(/bullish/i);
      expect(result.explanation).to.not.match(/opportunity score is 0/i);
    });
  });

  // ── Render contract ───────────────────────────────────────────

  describe("render() shows em dashes, never fabricated values", () => {
    it("does not render '0/100', 'undefined', or 'N/A%' when evidence is unavailable", async () => {
      installUnavailableMocks();

      const view = document.createElement("div");
      document.body.appendChild(view);

      await W.tokenAnalysis.render(view, "BTC");
      // render() spawns async work; let it settle.
      await new Promise((r) => setTimeout(r, 40));

      const html = view.innerHTML;

      // Positive assertions — an honest placeholder is present.
      expect(html).to.include("UNAVAILABLE");
      expect(html).to.include("—");

      // Negative assertions — none of the original bug's artefacts.
      expect(html, "must not fabricate a measured zero").to.not.include(
        "0/100",
      );
      expect(html, "must not render an unset field").to.not.include(
        "undefined",
      );
      expect(html, "must not concatenate % onto 'N/A'").to.not.include("N/A%");
      expect(html, "must not leak null into HTML").to.not.include(">null<");

      view.remove();
    });

    it("still shows a legitimate zero if a real measurement returns 0", () => {
      // Spot-check the formatter contract used by the renderer.
      // This mirrors the exact helpers added in the fix.
      const isNumber = (v) => Number.isFinite(v);
      const fmtScore = (v) => (isNumber(v) ? `${v}/100` : "—");
      const fmtPct = (v) => (isNumber(v) ? `${v}%` : "—");
      const fmtCount = (v) => (isNumber(v) ? String(v) : "—");

      // Measured zero: real number, renders normally.
      expect(fmtScore(0)).to.equal("0/100");
      expect(fmtPct(0)).to.equal("0%");
      expect(fmtCount(0)).to.equal("0");

      // Unmeasured: renders as placeholder.
      expect(fmtScore(null)).to.equal("—");
      expect(fmtScore(undefined)).to.equal("—");
      expect(fmtScore(NaN)).to.equal("—");
      expect(fmtPct(null)).to.equal("—");
      expect(fmtPct(undefined)).to.equal("—");
      expect(fmtCount(undefined)).to.equal("—");
      expect(fmtCount(null)).to.equal("—");

      // The three specific artefacts the bug produced:
      expect(fmtPct(null)).to.not.equal("N/A%");
      expect(fmtCount(undefined)).to.not.equal("undefined");
      expect(fmtScore(null)).to.not.equal("0/100");
    });
  });
});
