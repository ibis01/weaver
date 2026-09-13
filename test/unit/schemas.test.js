const { expect } = require("chai");

global.window.W = global.W;
require("../../js/api/schemas.js");

describe("Runtime API Schemas", () => {
  it("accepts a valid market response", () => {
    const value = [
      { id: "bitcoin", symbol: "btc", current_price: 60000, market_cap: 1 },
    ];
    expect(W.schemas.validate("markets", value)).to.equal(value);
  });

  it("rejects malformed market responses instead of returning them", () => {
    expect(() =>
      W.schemas.validate("markets", [
        { id: "bitcoin", symbol: "btc", current_price: "60000" },
      ]),
    ).to.throw(/current_price/);
  });

  it("rejects malformed fear-and-greed responses", () => {
    expect(() => W.schemas.validate("fearGreed", { data: [{}] })).to.throw(
      /value/,
    );
  });

  it("accepts chart points only when timestamp and price are numeric", () => {
    expect(() =>
      W.schemas.validate("chart", {
        prices: [
          [1, 2],
          [3, 4],
        ],
      }),
    ).to.not.throw();
    expect(() =>
      W.schemas.validate("chart", { prices: [[1, "bad"]] }),
    ).to.throw(/prices/);
  });
});

describe("Data Freshness", () => {
  it("classifies old data as stale", () => {
    W.dataHealth.mark("markets", {
      source: "local-cache",
      observedAt: Date.now() - 31 * 60 * 1000,
      staleAfter: 30 * 60 * 1000,
    });
    const status = W.dataHealth.get("markets");
    expect(status.state).to.equal("stale");
    expect(status.source).to.equal("local-cache");
  });
});
