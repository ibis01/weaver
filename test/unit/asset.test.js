const { expect } = require("chai");

describe("Asset Identity", () => {
  it("should resolve a symbol to a canonical AssetId", async () => {
    const assetId = await W.asset.resolveAssetId("BTC");
    expect(assetId).to.have.property("symbol");
    expect(assetId).to.have.property("coingeckoId");
    expect(assetId).to.have.property("chainId");
  });

  it("should return a fallback AssetId when resolution fails", async () => {
    const assetId = await W.asset.resolveAssetId(
      "definitely-not-a-real-asset-xyz",
    );
    expect(assetId.symbol).to.be.a("string");
    expect(assetId.chainId).to.equal("unknown");
  });

  it("should infer the correct chain for known assets", () => {
    expect(W.asset.inferChainId({ id: "bitcoin" })).to.equal("bitcoin");
    expect(W.asset.inferChainId({ id: "ethereum" })).to.equal("ethereum");
    expect(W.asset.inferChainId({ id: "solana" })).to.equal("solana");
    expect(W.asset.inferChainId({ id: "unknown-id" })).to.equal("ethereum");
  });
});
