
//
// Phase 2 Step 1 — creator metadata on the Shield assessment.
//
// The creator field is metadata only. It is not the deployer of
// record for the Deployer Graph Phase 2 work — that identity comes
// from contract-creation evidence. This test suite verifies that the
// field is sourced exclusively from result.creator_address and
// never from result.owner, result.owner_address, or any other field.

const { expect } = require("chai");

require("../../js/features/shield.js");

describe("Shield — creator metadata on the assessment", () => {
  const baseEvmRaw = () => ({
    is_honeypot: "0",
    is_mintable: "0",
    is_proxy: "0",
    buy_tax: "0",
    sell_tax: "0",
  });

  // ── Populated source ────────────────────────────────────────

  it("exposes a creator block on the EVM assessment", () => {
    const a = W.shield.assessEvmRisk(baseEvmRaw());
    expect(a.creator).to.be.an("object");
    expect(a.creator).to.have.property("address");
    expect(a.creator).to.have.property("source");
  });

  it("populates creator.address from result.creator_address, lowercased", () => {
    const a = W.shield.assessEvmRisk({
      ...baseEvmRaw(),
      creator_address: "0xABCDEF0000000000000000000000000000000009",
    });
    expect(a.creator.address).to.equal(
      "0xabcdef0000000000000000000000000000000009",
    );
    expect(a.creator.source).to.equal("goplus-evm");
  });

  it("trims whitespace around the creator address", () => {
    const a = W.shield.assessEvmRisk({
      ...baseEvmRaw(),
      creator_address: "  0xABCDEF0000000000000000000000000000000009  ",
    });
    expect(a.creator.address).to.equal(
      "0xabcdef0000000000000000000000000000000009",
    );
  });

  // ── Absence cases ───────────────────────────────────────────

  it("returns null creator.address when the field is absent", () => {
    const a = W.shield.assessEvmRisk(baseEvmRaw());
    expect(a.creator.address).to.equal(null);
    expect(a.creator.source).to.equal("goplus-evm");
  });

  it("returns null creator.address when the field is an empty string", () => {
    const a = W.shield.assessEvmRisk({
      ...baseEvmRaw(),
      creator_address: "",
    });
    expect(a.creator.address).to.equal(null);
  });

  it("returns null creator.address when the field is whitespace-only", () => {
    const a = W.shield.assessEvmRisk({
      ...baseEvmRaw(),
      creator_address: "   \t  ",
    });
    expect(a.creator.address).to.equal(null);
  });

  it("returns null creator.address when the field is not a string", () => {
    const a = W.shield.assessEvmRisk({
      ...baseEvmRaw(),
      creator_address: 12345,
    });
    expect(a.creator.address).to.equal(null);
  });

  // ── Decoy fields ────────────────────────────────────────────

  it("does not read result.owner as the creator address", () => {
    const a = W.shield.assessEvmRisk({
      ...baseEvmRaw(),
      owner: "0xABCDEF0000000000000000000000000000000001",
      owner_change: "1",
    });
    expect(a.creator.address).to.equal(null);
  });

  it("does not read result.owner_address as the creator address", () => {
    const a = W.shield.assessEvmRisk({
      ...baseEvmRaw(),
      owner_address: "0xABCDEF0000000000000000000000000000000002",
    });
    expect(a.creator.address).to.equal(null);
  });

  it("keeps owner and creator independent when both fields are present", () => {
    const a = W.shield.assessEvmRisk({
      ...baseEvmRaw(),
      owner_address: "0xAAAA000000000000000000000000000000000001",
      creator_address: "0xBBBB000000000000000000000000000000000002",
    });
    expect(a.owner.address).to.equal(
      "0xaaaa000000000000000000000000000000000001",
    );
    expect(a.creator.address).to.equal(
      "0xbbbb000000000000000000000000000000000002",
    );
    expect(a.owner.address).to.not.equal(a.creator.address);
  });

  // ── Solana declared gap ─────────────────────────────────────

  it("exposes a creator block with source 'unavailable' on the Solana assessment", () => {
    const raw = {
      mintable: { status: "0" },
      freezable: { status: "0" },
      closable: { status: "0" },
      metadata_mutable: { status: "0" },
      balance_mutable_authority: { status: "0" },
    };
    const a = W.shield.assessSolanaRisk(raw);
    expect(a.creator).to.be.an("object");
    expect(a.creator.address).to.equal(null);
    expect(a.creator.source).to.equal("unavailable");
    expect(a.creator.reason).to.be.a("string");
    expect(a.creator.reason.length).to.be.greaterThan(0);
  });

  // ── Existing fields untouched ───────────────────────────────

  it("does not alter the owner block when adding the creator block", () => {
    const a = W.shield.assessEvmRisk({
      ...baseEvmRaw(),
      owner_address: "0xABCDEF0000000000000000000000000000000001",
      creator_address: "0xABCDEF0000000000000000000000000000000009",
    });
    expect(a.owner.address).to.equal(
      "0xabcdef0000000000000000000000000000000001",
    );
    expect(a.owner.source).to.equal("goplus-evm");
  });
});
