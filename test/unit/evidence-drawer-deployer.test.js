// test/unit/evidence-drawer-deployer.test.js
//
// Step 6 of the deployer graph design. Evidence Drawer deployer
// line. Symmetric to evidence-drawer-owner.test.js and
// evidence-drawer-trajectory.test.js.

const { expect } = require("chai");

const drawerPath = require.resolve("../../js/ui/evidence-drawer.js");

describe("Evidence Drawer — deployer line", () => {
  before(() => {
    delete require.cache[drawerPath];
    require(drawerPath);
  });

  const line = (s) =>
    global.W.ui.evidenceDrawer._internal.renderDeployerLine(s);

  describe("renderDeployerLine", () => {
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

    it("renders a Deployer line when a summary is supplied", () => {
      const html = line("Deployer previously created 3 qualified tokens");
      expect(html).to.include("Deployer:");
      expect(html).to.include("Deployer previously created 3 qualified tokens");
    });

    it("escapes HTML in the summary", () => {
      const html = line("<script>alert(1)</script>");
      expect(html).to.not.include("<script>");
      expect(html).to.include("&lt;script&gt;");
    });

    it("wraps the line in a paragraph with the small class", () => {
      const html = line("Deployer previously created 1 qualified token");
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

    it("includes the deployer line when supplied", () => {
      global.W.ui.evidenceDrawer.open({
        explanation: "Test",
        deployerSummary: "Deployer previously created 3 qualified tokens",
      });
      expect(captured).to.not.equal(null);
      expect(captured.body).to.include("Deployer:");
      expect(captured.body).to.include(
        "Deployer previously created 3 qualified tokens",
      );
    });

    it("omits the deployer line when not supplied", () => {
      global.W.ui.evidenceDrawer.open({ explanation: "Test" });
      expect(captured).to.not.equal(null);
      expect(captured.body).to.not.include("Deployer:");
    });

    it("omits the deployer line when supplied as an empty string", () => {
      global.W.ui.evidenceDrawer.open({
        explanation: "Test",
        deployerSummary: "",
      });
      expect(captured).to.not.equal(null);
      expect(captured.body).to.not.include("Deployer:");
    });

    it("renders trajectory, owner, and deployer lines when all are supplied", () => {
      global.W.ui.evidenceDrawer.open({
        explanation: "Test",
        trajectorySummary: "Top 10 ↑ 3.1% 5m",
        ownerSummary: "Owner address seen on 3 tokens",
        deployerSummary: "Deployer previously created 2 qualified tokens",
      });
      expect(captured.body).to.include("Trajectory:");
      expect(captured.body).to.include("Owner:");
      expect(captured.body).to.include("Deployer:");
    });

    it("renders three evidence sections regardless", () => {
      global.W.ui.evidenceDrawer.open({
        explanation: "Test",
        deployerSummary: "Deployer previously created 1 qualified token",
        bullishEvidence: [{ title: "Bullish item", evidence: "detail" }],
      });
      expect(captured.body).to.include("Supporting evidence");
      expect(captured.body).to.include("Contradicting evidence");
      expect(captured.body).to.include("Unknowns");
      expect(captured.body).to.include("Bullish item");
    });

    it("escapes a malicious deployer summary", () => {
      global.W.ui.evidenceDrawer.open({
        explanation: "Test",
        deployerSummary: "<img src=x onerror=alert(1)>",
      });
      expect(captured.body).to.not.include("<img");
      expect(captured.body).to.include("&lt;img");
    });
  });
});
