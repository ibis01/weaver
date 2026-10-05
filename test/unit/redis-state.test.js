const { expect } = require("chai");
const { RedisState } = require("../../server/redis-state");

describe("RedisState — node-redis v4 call shape", () => {
  function makeStub(evalImpl) {
    const rs = new RedisState({ url: "redis://x", namespace: "test" });
    rs.connected = true;
    rs.client = {
      eval: evalImpl,
      hGetAll: async () => ({}),
      del: async () => 1,
      incr: async () => 1,
      pExpire: async () => 1,
      quit: async () => {},
    };
    return rs;
  }

  it("passes eval arguments as an ordered array of strings", async () => {
    let seen = null;
    const rs = makeStub(async (_script, opts) => {
      seen = opts;
      return [1, 60000];
    });

    const result = await rs.consumeRateLimit("1.2.3.4", {
      windowMs: 60000,
      maxRequests: 30,
    });

    expect(seen.arguments).to.be.an("array");
    expect(seen.arguments).to.have.lengthOf(3);
    seen.arguments.forEach((a) => expect(a).to.be.a("string"));
    expect(seen.arguments[1]).to.equal("60000");
    expect(seen.arguments[2]).to.equal("30");
    expect(result.allowed).to.equal(true);
    expect(result.backend).to.equal("redis");
  });

  it("recordCircuitFailure also passes an array of strings", async () => {
    let seen = null;
    const rs = makeStub(async (_script, opts) => {
      seen = opts;
      return [1, 1, Date.now() + 30000];
    });

    await rs.recordCircuitFailure("api.example.com", {
      threshold: 5,
      cooldownMs: 30000,
    });

    expect(seen.arguments).to.be.an("array");
    expect(seen.arguments).to.have.lengthOf(3);
    seen.arguments.forEach((a) => expect(a).to.be.a("string"));
  });
});
