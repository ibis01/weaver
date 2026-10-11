// Enforces WEAVER_CONSTITUTION.md §3.3:
//   DISCOVERABLE_CHAINS ⊆ VERIFIED_CHAINS
//
// Any chain Gem Agent can discover must have a corresponding Shield
// verification path. Fails if the invariant is broken by adding a
// discoverable chain without a shield adapter.

const { expect } = require("chai");

describe("Chain parity — §3.3 invariant", () => {
  it("every discoverable chain has a Shield verification path", () => {
    const gems = global.W && global.W.gems;
    const shield = global.W && global.W.shield;

    expect(gems, "W.gems must be loaded in test env").to.be.an("object");
    expect(shield, "W.shield must be loaded in test env").to.be.an("object");
    expect(gems.CHAINS, "gems.CHAINS must be exported (see gems.js module return)").to.be.an("object");
    expect(shield.CHAINS, "shield.CHAINS must be exported").to.be.an("object");

    const discoverable = Object.keys(gems.CHAINS);
    const verifiable = Object.keys(shield.CHAINS);

    const unverified = discoverable.filter((c) => !verifiable.includes(c));

    expect(
      unverified,
      `Chain(s) discoverable but not verifiable: ${unverified.join(", ")}. ` +
      `Add a Shield adapter or remove from Gem Agent's CHAINS allowlist.`
    ).to.deep.equal([]);
  });

  it("exposes the current discoverable set explicitly (regression doc)", () => {
    const gems = global.W && global.W.gems;
    // Snapshot of the current CHAINS set. If this changes, the
    // chain-parity test above must still pass, and the audit doc
    // docs/audits/constitution-compliance-2026-10-11.md §3.3 should
    // be updated.
    const expected = [
      "solana", "ethereum", "base", "bsc",
      "arbitrum", "polygon", "avalanche",
    ].sort();
    expect(Object.keys(gems.CHAINS).sort()).to.deep.equal(expected);
  });
});
