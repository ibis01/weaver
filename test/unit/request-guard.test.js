const { expect } = require("chai");

global.window.W = global.W;
require("../../js/api/request-guard.js");

describe("External Request Guard", () => {
  afterEach(() => {
    W.requestGuard.reset();
    delete window.fetch;
  });

  it("limits bursts per origin", () => {
    const key = "https://api.example.test";
    for (let i = 0; i < 2; i++) {
      W.requestGuard.before(key, { capacity: 2, refillMs: 60000 });
    }
    expect(() =>
      W.requestGuard.before(key, { capacity: 2, refillMs: 60000 }),
    ).to.throw(/Rate limit exceeded/);
  });

  it("opens a circuit after repeated failures", () => {
    const key = "https://api.example.test";
    for (let i = 0; i < 5; i++)
      W.requestGuard.failure(key, { failureThreshold: 5, cooldownMs: 60000 });
    expect(() => W.requestGuard.before(key, { capacity: 20 })).to.throw(
      /Circuit open/,
    );
  });

  it("resets a circuit after a successful response", async () => {
    const key = "https://api.example.test";
    for (let i = 0; i < 5; i++)
      W.requestGuard.failure(key, { failureThreshold: 5 });
    W.requestGuard.success(key);
    window.fetch = async () => ({ ok: true, status: 200 });
    const response = await W.requestGuard.fetch(
      "https://api.example.test/data",
      {},
      { capacity: 20 },
    );
    expect(response.ok).to.equal(true);
    expect(W.requestGuard.state(key).circuit.failures).to.equal(0);
  });
});
