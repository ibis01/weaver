// test/unit/evidence-drawer-trajectory.test.js
//
// Step 4 — Evidence Drawer trajectory line.
//
// The drawer accepts an already-summarised trajectory string and
// renders it as a single line in the meta area. It does not fetch
// or compute the trajectory, so this file does not need W.observations
// or W.marketStructure.

const { expect } = require("chai");

const drawerPath = require.resolve("../../js/ui/evidence-drawer.js");

describe("Evidence Drawer — trajectory line", () => {
  before(() => {
    delete require.cache[drawerPath];
    require(drawerPath);
  });

  const line = (s) =>
    global.W.ui.evidenceDrawer._internal.renderTrajectoryLine(s);

  describe("renderTrajectoryLine", () => {
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

    it("renders a trajectory line when a summary is supplied", () => {
      const html = line("Top 10 ↑ 3.1% 5m · Holders ↑ 12 5m");
      expect(html).to.include("Trajectory:");
      expect(html).to.include("Top 10 ↑ 3.1% 5m");
      expect(html).to.include("Holders ↑ 12 5m");
    });

    it("escapes HTML in the summary", () => {
      const html = line("<script>alert(1)</script>");
      expect(html).to.not.include("<script>");
      expect(html).to.include("&lt;script&gt;");
    });

    it("wraps the line in a paragraph with the small class", () => {
      const html = line("Top 10 ↑ 3.1% 5m");
      expect(html).to.match(/^<p class="small">/);
      expect(html).to.match(/<\/p>$/);
    });
  });

  describe("open() integration — verifying the argument flows through", () => {
    // open() calls W.ui.modal(), which the JSDOM test environment
    // does not provide. Mock it locally for this suite and restore
    // in after(). The modal mock captures the body it receives so
    // the test can assert on the rendered HTML.
    let originalModal;
    let captured;

    before(() => {
      originalModal = global.W.ui.modal;
      global.W.ui.modal = (opts) => {
        captured = opts;
        return {
          el: document.createElement("div"),
          close: () => {},
        };
      };
    });

    after(() => {
      global.W.ui.modal = originalModal;
    });

    beforeEach(() => {
      captured = null;
    });

    it("includes the trajectory line in the drawer body when supplied", () => {
      global.W.ui.evidenceDrawer.open({
        explanation: "Test explanation",
        trajectorySummary: "Top 10 ↑ 3.1% 5m",
      });
      expect(captured).to.not.equal(null);
      expect(captured.body).to.include("Trajectory:");
      expect(captured.body).to.include("Top 10 ↑ 3.1% 5m");
    });

    it("omits the trajectory line when not supplied", () => {
      global.W.ui.evidenceDrawer.open({
        explanation: "Test explanation",
      });
      expect(captured).to.not.equal(null);
      expect(captured.body).to.not.include("Trajectory:");
    });

    it("omits the trajectory line when supplied as an empty string", () => {
      global.W.ui.evidenceDrawer.open({
        explanation: "Test explanation",
        trajectorySummary: "",
      });
      expect(captured).to.not.equal(null);
      expect(captured.body).to.not.include("Trajectory:");
    });

    it("renders the three evidence sections regardless of trajectory", () => {
      global.W.ui.evidenceDrawer.open({
        explanation: "Test explanation",
        trajectorySummary: "Top 10 ↑ 3.1% 5m",
        bullishEvidence: [{ title: "Bullish item", evidence: "detail" }],
        bearishEvidence: [{ title: "Bearish item", evidence: "detail" }],
      });
      expect(captured.body).to.include("Supporting evidence");
      expect(captured.body).to.include("Contradicting evidence");
      expect(captured.body).to.include("Unknowns");
      expect(captured.body).to.include("Bullish item");
      expect(captured.body).to.include("Bearish item");
    });
  });
});
