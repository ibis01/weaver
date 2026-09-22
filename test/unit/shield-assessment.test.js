const { expect } = require("chai");

describe("Shield risk assessment", () => {
  const evm = (overrides = {}) => ({
    is_honeypot: "1",
    is_mintable: "1",
    is_proxy: "1",
    owner_change: "0",
    buy_tax: "0.1",
    sell_tax: "0.1",
    lp_holders: [{ is_locked: 0 }],
    ...overrides,
  });

  const solana = (overrides = {}) => ({
    freezable: "1",
    balance_mutable_authority: "1",
    mintable: "1",
    closable: "1",
    metadata_mutable: "1",
    transfer_fee: { pct: 10 },
    ...overrides,
  });

  it("clamps maximum EVM scores to 100", () => {
    const assessment = W.shield.assessEvmRisk(evm());
    expect(assessment.riskScore).to.equal(100);
    expect(assessment.riskScore).to.be.at.most(100);
  });

  it("clamps maximum Solana scores to 100", () => {
    const assessment = W.shield.assessSolanaRisk(solana());
    expect(assessment.riskScore).to.equal(100);
    expect(assessment.riskScore).to.be.at.most(100);
  });

  it("treats missing EVM LP data as unknown without adding an unlocked penalty", () => {
    const assessment = W.shield.assessEvmRisk(
      evm({
        is_honeypot: "0",
        is_mintable: "0",
        is_proxy: "0",
        owner_change: "1",
        buy_tax: "0",
        sell_tax: "0",
        lp_holders: undefined,
      }),
    );
    expect(assessment.flags.isLpLocked).to.equal(null);
    expect(assessment.flags.lpLockStatus).to.equal("unknown");
    expect(assessment.holders.hasLockedLp).to.equal(null);
    expect(assessment.holders.lpLockStatus).to.equal("unknown");
    expect(assessment.risks).to.include("⚠️ Liquidity lock status unavailable");
    expect(assessment.riskScore).to.equal(0);
  });

  it("treats explicit unlocked EVM LP data as unlocked and penalizes it", () => {
    const assessment = W.shield.assessEvmRisk(
      evm({
        is_honeypot: "0",
        is_mintable: "0",
        is_proxy: "0",
        owner_change: "1",
        buy_tax: "0",
        sell_tax: "0",
        lp_holders: [{ is_locked: 0 }],
      }),
    );
    expect(assessment.flags.isLpLocked).to.equal(false);
    expect(assessment.flags.lpLockStatus).to.equal("unlocked");
    expect(assessment.holders.hasLockedLp).to.equal(false);
    expect(assessment.riskScore).to.equal(15);
  });

  it("recognizes locked EVM LP evidence without an unlocked penalty", () => {
    const assessment = W.shield.assessEvmRisk(
      evm({
        is_honeypot: "0",
        is_mintable: "0",
        is_proxy: "0",
        owner_change: "1",
        buy_tax: "0",
        sell_tax: "0",
        lp_holders: [{ is_locked: 1 }],
      }),
    );
    expect(assessment.flags.isLpLocked).to.equal(true);
    expect(assessment.flags.lpLockStatus).to.equal("locked");
    expect(assessment.holders.hasLockedLp).to.equal(true);
    expect(assessment.riskScore).to.equal(0);
  });

  it("treats empty or malformed EVM LP evidence as unknown", () => {
    for (const lp_holders of [[], [null], [{ is_locked: "maybe" }]]) {
      const assessment = W.shield.assessEvmRisk(
        evm({
          is_honeypot: "0",
          is_mintable: "0",
          is_proxy: "0",
          owner_change: "1",
          buy_tax: "0",
          sell_tax: "0",
          lp_holders,
        }),
      );
      expect(assessment.flags.lpLockStatus).to.equal("unknown");
      expect(assessment.flags.isLpLocked).to.equal(null);
      expect(assessment.riskScore).to.equal(0);
    }
  });

  it("accepts string-valued LP lock flags from provider responses", () => {
    const assessment = W.shield.assessEvmRisk(
      evm({
        is_honeypot: "0",
        is_mintable: "0",
        is_proxy: "0",
        owner_change: "1",
        buy_tax: "0",
        sell_tax: "0",
        lp_holders: [{ is_locked: "1" }],
      }),
    );
    expect(assessment.flags.lpLockStatus).to.equal("locked");
    expect(assessment.holders.lockedLpCount).to.equal(1);
    expect(assessment.riskScore).to.equal(0);
  });

  it("declares Solana LP evidence unavailable instead of implying unlocked liquidity", () => {
    const assessment = W.shield.assessSolanaRisk({});
    expect(assessment.lpLockStatus).to.equal("unknown");
    expect(assessment.holders.hasLockedLp).to.equal(null);
    expect(assessment.holders.source).to.equal("unavailable");
  });
});
