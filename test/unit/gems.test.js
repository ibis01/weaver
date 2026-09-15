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

describe("Token Shield risk language", () => {
  it("uses qualified risk-indicator classifications", () => {
    const low = W.shield.assessEvmRisk({
      is_honeypot: "0",
      is_mintable: "0",
      is_proxy: "0",
      owner_change: "1",
      buy_tax: "0",
      sell_tax: "0",
      lp_holders: [{ is_locked: 1 }],
    });
    const high = W.shield.assessEvmRisk({
      is_honeypot: "1",
      is_mintable: "1",
      is_proxy: "1",
      owner_change: "0",
      buy_tax: "0.10",
      sell_tax: "0.10",
      lp_holders: [],
    });
    expect(low.riskLevel[0]).to.include("No identified risk indicators");
    expect(low.riskLevel[1]).to.equal("no-identified-risk");
    expect(high.riskLevel[0]).to.include("High identified risk indicators");
    expect(high.riskLevel[1]).to.equal("high-risk");
    expect([low.riskLevel[1], high.riskLevel[1]]).to.not.include.members([
      "buy",
      "sell",
    ]);
  });
});
