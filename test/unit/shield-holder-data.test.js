const { expect } = require("chai");

require("../../js/features/shield.js");

describe("Shield — holder data on the assessment", () => {
  it("assessEvmRisk includes a holders block from raw GoPlus data", () => {
    const raw = {
      is_honeypot: "0",
      is_mintable: "0",
      is_proxy: "0",
      owner_change: "1",
      buy_tax: "0",
      sell_tax: "0",
      holder_count: "241",
      holders: [
        { address: "0xa", percent: "0.125", is_contract: 0, is_locked: 0 },
        { address: "0xb", percent: "0.083", is_contract: 0, is_locked: 0 },
        { address: "0xc", percent: "0.05", is_contract: 1, is_locked: 0 },
      ],
      lp_holders: [
        { address: "0xlp1", percent: "0.5", is_locked: 1 },
        { address: "0xlp2", percent: "0.3", is_locked: 0 },
      ],
    };
    const a = W.shield.assessEvmRisk(raw);
    expect(a.holders).to.be.an("object");
    expect(a.holders.count).to.equal(241);
    expect(a.holders.top10).to.have.length(3);
    expect(a.holders.top10[0].percent).to.be.closeTo(12.5, 0.01);
    expect(a.holders.top10Pct).to.be.closeTo(25.8, 0.01);
    expect(a.holders.lpCount).to.equal(2);
    expect(a.holders.lockedLpCount).to.equal(1);
    expect(a.holders.hasLockedLp).to.equal(true);
    expect(a.holders.source).to.equal("goplus-evm");
  });

  it("assessEvmRisk returns null holder fields when raw data lacks them", () => {
    const raw = {
      is_honeypot: "0",
      is_mintable: "0",
      is_proxy: "0",
      buy_tax: "0",
      sell_tax: "0",
    };
    const a = W.shield.assessEvmRisk(raw);
    expect(a.holders).to.be.an("object");
    expect(a.holders.count).to.equal(null);
    expect(a.holders.top10).to.equal(null);
    expect(a.holders.top10Pct).to.equal(null);
    expect(a.holders.hasLockedLp).to.equal(null);
    expect(a.holders.source).to.equal("goplus-evm");
  });

  it("assessSolanaRisk declares the holder-distribution gap explicitly", () => {
    const raw = {
      mintable: { status: "0" },
      freezable: { status: "0" },
      closable: { status: "0" },
      metadata_mutable: { status: "0" },
      balance_mutable_authority: { status: "0" },
    };
    const a = W.shield.assessSolanaRisk(raw);
    expect(a.holders).to.be.an("object");
    expect(a.holders.source).to.equal("unavailable");
    expect(a.holders.reason).to.include("GoPlus Solana endpoint");
    expect(a.holders.top10Pct).to.equal(null);
  });
});
