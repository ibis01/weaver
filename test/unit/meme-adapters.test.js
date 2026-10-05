const { expect } = require("chai");

global.window.W = global.W;
require("../../js/intelligence/meme-contracts.js");
require("../../js/adapters/market-dexscreener.js");
require("../../js/adapters/security-goplus.js");

describe("Meme adapters — DexScreener", () => {
  it("returns null for a non-object input", () => {
    expect(W.adapters.marketFromDexScreener(null)).to.equal(null);
    expect(W.adapters.marketFromDexScreener("nope")).to.equal(null);
  });

  it("produces a valid MarketSnapshot for a full pair", () => {
    const raw = {
      pairCreatedAt: Date.now() - 3600_000,
      liquidity: { usd: 100000, change1h: 5 },
      volume: { m5: 1000, h1: 12000, h6: 50000, h24: 200000 },
      priceChange: { m5: 1, h1: 10, h6: 20, h24: 30 },
      txns: {
        m5: { buys: 5, sells: 3 },
        h1: { buys: 60, sells: 40 },
        h24: { buys: 600, sells: 400 },
      },
    };
    const result = W.adapters.marketFromDexScreener(raw);
    expect(result).to.not.equal(null);
    expect(result.liquidityUsd).to.equal(100000);
    expect(result.buys24h).to.equal(600);
    expect(result.provenance.source).to.equal("dexscreener");
  });

  it("keeps missing fields null — never zero", () => {
    const result = W.adapters.marketFromDexScreener({});
    expect(result).to.not.equal(null);
    expect(result.liquidityUsd).to.equal(null);
    expect(result.buys24h).to.equal(null);
    expect(result.pairAgeMinutes).to.equal(null);
  });

  it("rejects non-integer transaction counts rather than silently coercing", () => {
    const result = W.adapters.marketFromDexScreener({
      txns: { h24: { buys: 1.5, sells: 2 } },
    });
    expect(result.buys24h).to.equal(null);
    expect(result.sells24h).to.equal(2);
  });
});

describe("Meme adapters — GoPlus", () => {
  it("returns null for missing input", () => {
    expect(W.adapters.securityFromGoPlus(null)).to.equal(null);
    expect(W.adapters.securityFromGoPlus(undefined)).to.equal(null);
  });

  it("classifies all-locked LP holders as provider-reported", () => {
    const result = W.adapters.securityFromGoPlus({
      lp_holders: [{ is_locked: 1 }, { is_locked: 1 }],
    });
    expect(result.lpLockStatus).to.equal("provider-reported");
  });

  it("classifies mixed locked/unlocked LP holders as partially-locked", () => {
    const result = W.adapters.securityFromGoPlus({
      lp_holders: [{ is_locked: 1 }, { is_locked: 0 }],
    });
    expect(result.lpLockStatus).to.equal("partially-locked");
  });

  it("classifies all-unlocked LP holders as unlocked", () => {
    const result = W.adapters.securityFromGoPlus({
      lp_holders: [{ is_locked: 0 }, { is_locked: 0 }],
    });
    expect(result.lpLockStatus).to.equal("unlocked");
  });

  it("classifies unknown mixed flags as conflicting", () => {
    const result = W.adapters.securityFromGoPlus({
      lp_holders: [{ is_locked: 1 }, { is_locked: "?" }],
    });
    expect(result.lpLockStatus).to.equal("conflicting");
  });

  it("reports lpLockStatus unavailable when no holders are present", () => {
    const result = W.adapters.securityFromGoPlus({});
    expect(result.lpLockStatus).to.equal("unavailable");
  });

  it("never derives liquidityRemovable from is_locked (regression)", () => {
    // A locked LP must NOT be reported as removable. The previous
    // implementation mapped is_locked=1 → liquidityRemovable=true,
    // which would trigger a LIQUIDITY_REMOVABLE block veto in the
    // meme opportunity engine for a safely-locked token.
    const locked = W.adapters.securityFromGoPlus({
      lp_holders: [{ is_locked: 1 }],
    });
    expect(locked.liquidityRemovable).to.equal(null);

    const unlocked = W.adapters.securityFromGoPlus({
      lp_holders: [{ is_locked: 0 }],
    });
    expect(unlocked.liquidityRemovable).to.equal(null);
  });

  it("maps cannot_sell_all=1 to canSell=false, absent to null", () => {
    const blocked = W.adapters.securityFromGoPlus({ cannot_sell_all: "1" });
    expect(blocked.canSell).to.equal(false);

    const unknown = W.adapters.securityFromGoPlus({});
    expect(unknown.canSell).to.equal(null);
  });

  it("flags honeypots as verdict conflicting", () => {
    const result = W.adapters.securityFromGoPlus({ is_honeypot: "1" });
    expect(result.verdict).to.equal("conflicting");
    expect(result.honeypot).to.equal(true);
  });
});
