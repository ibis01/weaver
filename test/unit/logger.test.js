const { expect } = require("chai");

describe("Privacy-Safe Logger", () => {
  it("masks EVM addresses", () => {
    const input = "from 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1 failed";
    const out = global.W.logger.scrub(input);
    expect(out).to.not.include("0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1");
    // The mask preserves the first 6 and last 4 characters. Assert on
    // those rather than the separator glyph ("..." or "…").
    expect(out).to.include("0x742d");
    expect(out).to.include("bEb1");
  });

  it("masks Solana addresses", () => {
    const input = "wallet DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263 received";
    const out = global.W.logger.scrub(input);
    expect(out).to.not.include("DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263");
    expect(out).to.include("DezXAZ");
    expect(out).to.include("B263");
  });

  it("redacts Telegram bot tokens", () => {
    const input = "token 123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcd_efgh";
    const out = global.W.logger.scrub(input);
    expect(out).to.include("[REDACTED_TG_TOKEN]");
  });

  it("redacts sk- API keys", () => {
    const input = "key sk-abcdefghijklmnopqrstuvwxyz1234567890";
    const out = global.W.logger.scrub(input);
    expect(out).to.include("[REDACTED_KEY]");
  });

  it("redacts seed phrases", () => {
    const input =
      "seed abandon ability able about above absent absorb abstract absurd abuse access accident";
    const out = global.W.logger.scrub(input);
    expect(out).to.include("[REDACTED_SEED]");
  });

  it("redacts object keys named like credentials", () => {
    const out = global.W.logger.scrub({
      ok: true,
      token: "abc",
      password: "hunter2",
      nested: { apiKey: "xyz" },
    });
    expect(out.ok).to.equal(true);
    expect(out.token).to.equal("[REDACTED]");
    expect(out.password).to.equal("[REDACTED]");
    expect(out.nested.apiKey).to.equal("xyz");
  });

  it("handles circular references without hanging", () => {
    const o = { a: 1 };
    o.self = o;
    const out = global.W.logger.scrub(o);
    expect(out.a).to.equal(1);
    expect(out.self).to.equal("[Circular]");
  });

  it("passes non-sensitive strings through unchanged", () => {
    expect(global.W.logger.scrub("BTC moved 3%")).to.equal("BTC moved 3%");
  });
});
