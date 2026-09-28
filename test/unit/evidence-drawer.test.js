const { expect } = require("chai");

global.window.W = global.W;
require("../../js/ui/evidence-drawer.js");

describe("Evidence Drawer — bucket assignment", () => {
  it("a domain with relationship 'supporting' lands in Supporting", () => {
    const out = W.ui.evidenceDrawer._internal.bucket({
      technical: { relationship: "supporting", reasons: ["RSI 55 — neutral"] },
    });
    expect(out.supporting).to.have.lengthOf(1);
    expect(out.supporting[0].name).to.equal("technical");
    expect(out.supporting[0].reasons).to.deep.equal(["RSI 55 — neutral"]);
  });

  it("a domain with relationship 'contradicting' lands in Contradicting", () => {
    const out = W.ui.evidenceDrawer._internal.bucket({
      fundamentals: {
        relationship: "contradicting",
        reasons: ["Deep ATH drawdown"],
      },
    });
    expect(out.contradicting).to.have.lengthOf(1);
    expect(out.contradicting[0].name).to.equal("fundamentals");
  });

  it("a domain with no relationship lands in Unknowns", () => {
    const out = W.ui.evidenceDrawer._internal.bucket({
      security: { status: "verified", reasons: ["Risk score: 85/100"] },
    });
    expect(out.unknowns).to.have.lengthOf(1);
    expect(out.unknowns[0].name).to.equal("security");
  });

  it("an empty domains object produces three empty buckets", () => {
    const out = W.ui.evidenceDrawer._internal.bucket({});
    expect(out.supporting).to.have.lengthOf(0);
    expect(out.contradicting).to.have.lengthOf(0);
    expect(out.unknowns).to.have.lengthOf(0);
  });

  it("a neutral domain lands in Unknowns regardless of status", () => {
    const out = W.ui.evidenceDrawer._internal.bucket({
      holders: { status: "verified", relationship: "neutral", reasons: [] },
    });
    expect(out.unknowns).to.have.lengthOf(1);
    expect(out.unknowns[0].name).to.equal("holders");
  });
});
