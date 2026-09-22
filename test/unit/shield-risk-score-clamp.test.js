const { expect } = require("chai");
require("../../js/features/shield.js");

describe("Shield — risk score normalization", () => {
  describe("EVM risk assessment", () => {
    it("clamps the maximum possible risk score to 100", () => {
      const rawResult = {
        is_honeypot: "1", is_mintable: "1", is_proxy: "1",
        lp_holders: [], buy_tax: "0.10", sell_tax: "0.10",
        owner_change: "0", owner: "0x1234567890123456789012345678901234567890",
      };
      const assessment = W.shield.assessEvmRisk(rawResult);
      expect(assessment.riskScore).to.equal(100);
      expect(assessment.riskLevel[1]).to.equal("high-risk");
    });
  });

  describe("Solana risk assessment", () => {
    it("clamps the maximum possible risk score to 100", () => {
      const rawResult = {
        freezable: { status: "1" }, balance_mutable_authority: { status: "1" },
        mintable: { status: "1" }, closable: { status: "1" },
        metadata_mutable: { status: "1" }, transfer_fee: { pct: "10" },
      };
      const assessment = W.shield.assessSolanaRisk(rawResult);
      expect(assessment.riskScore).to.equal(100);
      expect(assessment.riskLevel[1]).to.equal("high-risk");
    });
  });
});
