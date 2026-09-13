const { expect } = require("chai");
const fs = require("fs");
const path = require("path");

describe("Gem Agent chain parity", () => {
  it("every Gem-scanned chain has Shield verification", () => {
    const gemChains = Object.keys(global.W.gems.CHAINS || {});
    const shieldChains = Object.keys(global.W.shield.CHAINS || {});
    const missing = gemChains.filter((c) => !shieldChains.includes(c));
    expect(
      missing,
      `Shield missing verification for: ${missing.join(", ")}`,
    ).to.deep.equal([]);
  });

  it("does not scan ton or blast (no Shield verification path)", () => {
    expect(global.W.gems.CHAINS).to.not.have.property("ton");
    expect(global.W.gems.CHAINS).to.not.have.property("blast");
  });
});

describe("Gem Agent verdict language", () => {
  const FORBIDDEN = ["buy", "sell", "entry", "exit", "guaranteed", "moon"];

  it("does not use directive words as quoted verdict identifiers", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../../js/features/gems.js"),
      "utf8",
    );
    for (const word of FORBIDDEN) {
      // Only fail on quoted strings. Ignore words in comments.
      const re = new RegExp(`["'\`]${word}["'\`]`, "i");
      expect(
        src,
        `gems.js contains directive identifier: "${word}"`,
      ).to.not.match(re);
    }
  });

  it("exposes CHAINS and SCORE_VERSION on the module", () => {
    expect(global.W.gems.CHAINS).to.be.an("object");
    expect(global.W.gems.SCORE_VERSION).to.be.a("string");
  });
});
