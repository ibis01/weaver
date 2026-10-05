const { expect } = require("chai");

global.window.W = global.W;
require("../../js/ui/evidence-drawer.js");

describe("Evidence Drawer — unknowns must not leak gate status", () => {
  it("replaces an engine eligibility status with 'unassessed'", () => {
    const out = W.ui.evidenceDrawer._internal.bucket({
      signal: { status: "ELIGIBLE", relationship: "unknown" },
    });
    expect(out.unknowns).to.have.lengthOf(1);
    expect(out.unknowns[0].name).to.equal("signal");
    expect(out.unknowns[0].status).to.equal("unassessed");
  });

  it("does not classify a supporting domain as unknown", () => {
    const out = W.ui.evidenceDrawer._internal.bucket({
      technical: { relationship: "supporting", status: "ELIGIBLE" },
    });
    expect(out.unknowns).to.have.lengthOf(0);
    expect(out.supporting[0].status).to.equal("ELIGIBLE");
  });
});
