// test/unit/evidence-drawer-owner.test.js
//
// Owner Associations in the Evidence Drawer. Symmetric to
// evidence-drawer-trajectory.test.js — the drawer accepts an
// already-summarised owner string and does not read the module.

const { expect } = require("chai");

const drawerPath = require.resolve("../../js/ui/evidence-drawer.js");

describe("Evidence Drawer — owner line", () => {
  before(() => {
    delete require.cache[drawerPath];
    require(drawerPath);
  });

  const line = (s) => global.W.ui.evidenceDrawer._internal.renderOwnerLine(s);

  describe("renderOwnerLine", () => {
    it("returns '' for null", () => {
      expect(line(null)).to.equal("");
    });

    it("returns '' for undefined", () => {
      expect(line(undefined)).to.equal("");
    });

    it("returns '' for an empty string", () => {
      expect(line("")).to.equal("");
    });

    it("returns '' for a whitespace-only string", () => {
      expect(line("   \n\t  ")).to.equal("");
    });

    it("returns '' for a non-string value", () => {
      expect(line(42)).to.equal("");
      expect(line({})).to.equal("");
      expect(line([])).to.equal("");
    });

    it("renders an owner line when a summary is supplied", () => {
      const html = line("Owner address seen on 3 tokens — 1 flagged high-risk");
      expect(html).to.include("Owner:");
      expect(html).to.include("Owner address seen on 3 tokens");
    });

    it("escapes HTML in the summary", () => {
      const html = line("<script>alert(1)</script>");
      expect(html).to.not.include("<script>");
      expect(html).to.include("&lt;script&gt;");
    });

    it("wraps the line in a paragraph with the small class", () => {
      const html = line("Owner address seen on 3 tokens");
      expect(html).to.match(/^<p class="small">/);
      expect(html).to.match(/<\/p>$/);
    });
  });

  describe("open() integration", () => {
    let originalModal;
    let captured;

    before(() => {
      originalModal = global.W.ui.modal;
      global.W.ui.modal = (opts) => {
        captured = opts;
        return { el: document.createElement("div"), close: () => {} };
      };
    });

    after(() => {
      global.W.ui.modal = originalModal;
    });

    beforeEach(() => {
      captured = null;
    });

    it("includes the owner line when supplied", () => {
      global.W.ui.evidenceDrawer.open({
        explanation: "Test",
        ownerSummary: "Owner address seen on 3 tokens",
      });
      expect(captured).to.not.equal(null);
      expect(captured.body).to.include("Owner:");
      expect(captured.body).to.include("Owner address seen on 3 tokens");
    });

    it("omits the owner line when not supplied", () => {
      global.W.ui.evidenceDrawer.open({ explanation: "Test" });
      expect(captured).to.not.equal(null);
      expect(captured.body).to.not.include("Owner:");
    });

    it("omits the owner line when supplied as an empty string", () => {
      global.W.ui.evidenceDrawer.open({
        explanation: "Test",
        ownerSummary: "",
      });
      expect(captured).to.not.equal(null);
      expect(captured.body).to.not.include("Owner:");
    });

    it("renders both trajectory and owner lines when both are supplied", () => {
      global.W.ui.evidenceDrawer.open({
        explanation: "Test",
        trajectorySummary: "Top 10 ↑ 3.1% 5m",
        ownerSummary: "Owner address seen on 3 tokens",
      });
      expect(captured.body).to.include("Trajectory:");
      expect(captured.body).to.include("Owner:");
    });

    it("renders three evidence sections regardless", () => {
      global.W.ui.evidenceDrawer.open({
        explanation: "Test",
        ownerSummary: "Owner address seen on 3 tokens",
        bullishEvidence: [{ title: "Bullish item", evidence: "detail" }],
      });
      expect(captured.body).to.include("Supporting evidence");
      expect(captured.body).to.include("Contradicting evidence");
      expect(captured.body).to.include("Unknowns");
      expect(captured.body).to.include("Bullish item");
    });
  });
});
