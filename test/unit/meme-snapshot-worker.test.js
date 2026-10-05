const { expect } = require("chai");
const { normalizePairs } = require("../../scripts/meme-snapshot-worker.js");

describe("Meme snapshot worker", () => {
  it("keeps supported-chain pairs with valid token addresses", () => {
    const pairs = normalizePairs({
      pairs: [
        { chainId: "solana", baseToken: { address: "So111111" } },
        { chainId: "unsupported", baseToken: { address: "0x123" } },
        { chainId: "base", baseToken: {} },
      ],
    });
    expect(pairs).to.have.length(1);
    expect(pairs[0].chainId).to.equal("solana");
  });

  it("accepts an array response shape from provider adapters", () => {
    const pairs = normalizePairs([
      { chainId: "ethereum", baseToken: { address: "0x123" } },
    ]);
    expect(pairs).to.have.length(1);
  });
});
