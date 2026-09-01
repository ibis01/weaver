const { expect } = require("chai");

// Mock W.api.search
global.W = {
  api: {
    search: async () => ({
      coins: [{ id: "bitcoin", symbol: "BTC", name: "Bitcoin" }],
    }),
  },
};

const { resolve } = require("../../js/models/asset.js");

describe("AssetId Resolver", () => {
  it("should resolve a symbol to AssetId", async () => {
    const assetId = await resolve("BTC");
    expect(assetId.symbol).to.equal("BTC");
    expect(assetId.coingeckoId).to.equal("bitcoin");
    expect(assetId.chainId).to.equal("bitcoin");
  });

  it("should handle invalid input gracefully", async () => {
    const assetId = await resolve("");
    expect(assetId.symbol).to.equal("");
  });
});
