// test/unit/deployer-graph-observe.test.js
//
// Step 4 of the deployer graph design. observe() orchestrator:
// fetch, parse, qualify, record. Uses a global fetch mock.

const { expect } = require("chai");

const path = require.resolve("../../js/intelligence/deployer-graph.js");

describe("Deployer graph — observe", () => {
  const CHAIN = "ethereum";
  const CREATOR = "0xAbCdEf0000000000000000000000000000000001";
  const CREATOR_LOWER = CREATOR.toLowerCase();
  const TOKEN = "0x1111111111111111111111111111111111111111";
  const OTHER_CONTRACT = "0x2222222222222222222222222222222222222222";

  let originalFetch;
  let originalShield;

  before(() => {
    delete require.cache[path];
    require(path);
    originalFetch = globalThis.fetch;
    originalShield = global.W.shield;
  });

  after(() => {
    globalThis.fetch = originalFetch;
    global.W.shield = originalShield;
  });

  beforeEach(() => {
    global.W.store.clearAll();
    global.W.deployerGraph.reset();
    global.W.deployerGraph._internal.setWorkerBase(
      "https://worker.example.com",
    );
    global.W.shield = {
      isHighRisk: (a) => {
        if (!a) return false;
        const score = Number(a.riskScore);
        return Number.isFinite(score) && score >= 40;
      },
    };
    // Default: fetch throws. Tests that expect a fetch override this.
    globalThis.fetch = async () => {
      throw new Error("fetch called without a mock");
    };
  });

  function assessment(overrides = {}) {
    return {
      riskScore: 10,
      creator: { address: CREATOR, source: "goplus-evm" },
      ...overrides,
    };
  }

  function bitqueryResponse(calls) {
    return { data: { EVM: { Calls: calls } } };
  }

  function call(opts = {}) {
    return {
      Call: {
        To: opts.to || TOKEN,
        From: opts.from || CREATOR_LOWER,
        Create: true,
      },
      Transaction: {
        Hash: opts.hash || "0xhash",
        From: opts.txFrom || CREATOR_LOWER,
      },
      Block: { Time: opts.time || "2026-09-20T00:00:00.000Z" },
    };
  }

  function mockFetch(body, status = 200) {
    globalThis.fetch = async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
  }

  // ── Guard cases ────────────────────────────────────────────

  describe("guards", () => {
    it("returns null for a null assessment", async () => {
      expect(
        await global.W.deployerGraph.observe(null, CHAIN, TOKEN, "T"),
      ).to.equal(null);
    });

    it("returns null for shield error state", async () => {
      expect(
        await global.W.deployerGraph.observe(
          { error: true },
          CHAIN,
          TOKEN,
          "T",
        ),
      ).to.equal(null);
    });

    it("returns null for shield noData state", async () => {
      expect(
        await global.W.deployerGraph.observe(
          { noData: true },
          CHAIN,
          TOKEN,
          "T",
        ),
      ).to.equal(null);
    });

    it("returns null for shield unsupported state", async () => {
      expect(
        await global.W.deployerGraph.observe(
          { unsupported: true },
          CHAIN,
          TOKEN,
          "T",
        ),
      ).to.equal(null);
    });

    it("returns null when creator.address is missing", async () => {
      let fetchCalled = false;
      globalThis.fetch = async () => {
        fetchCalled = true;
        return new Response("{}");
      };
      const a = assessment();
      delete a.creator;
      expect(
        await global.W.deployerGraph.observe(a, CHAIN, TOKEN, "T"),
      ).to.equal(null);
      expect(fetchCalled).to.equal(false);
    });

    it("returns null when creator.address is null", async () => {
      let fetchCalled = false;
      globalThis.fetch = async () => {
        fetchCalled = true;
        return new Response("{}");
      };
      const a = assessment({
        creator: { address: null, source: "goplus-evm" },
      });
      expect(
        await global.W.deployerGraph.observe(a, CHAIN, TOKEN, "T"),
      ).to.equal(null);
      expect(fetchCalled).to.equal(false);
    });

    it("returns null for missing chainKey", async () => {
      expect(
        await global.W.deployerGraph.observe(assessment(), null, TOKEN, "T"),
      ).to.equal(null);
    });

    it("returns null for missing tokenAddress", async () => {
      expect(
        await global.W.deployerGraph.observe(assessment(), CHAIN, null, "T"),
      ).to.equal(null);
    });
  });

  // ── Cache ─────────────────────────────────────────────────

  describe("cache", () => {
    it("returns the cached profile without a fetch", async () => {
      global.W.deployerGraph.record(CHAIN, CREATOR, {
        tokens: [{ tokenAddress: TOKEN, deploymentEvidence: null }],
        source: "bitquery",
      });
      let fetchCalled = false;
      globalThis.fetch = async () => {
        fetchCalled = true;
        return new Response("{}");
      };
      const p = await global.W.deployerGraph.observe(
        assessment(),
        CHAIN,
        TOKEN,
        "T",
      );
      expect(p).to.be.an("object");
      expect(p.deployerAddress).to.equal(CREATOR_LOWER);
      expect(fetchCalled).to.equal(false);
    });
  });

  // ── Worker configuration ───────────────────────────────────

  it("returns null when workerBase is empty", async () => {
    global.W.deployerGraph._internal.setWorkerBase("");
    let fetchCalled = false;
    globalThis.fetch = async () => {
      fetchCalled = true;
      return new Response("{}");
    };
    const p = await global.W.deployerGraph.observe(
      assessment(),
      CHAIN,
      TOKEN,
      "T",
    );
    expect(p).to.equal(null);
    expect(fetchCalled).to.equal(false);
  });

  // ── Fetch failures ─────────────────────────────────────────

  describe("fetch failures", () => {
    it("returns null when fetch throws", async () => {
      globalThis.fetch = async () => {
        throw new Error("network down");
      };
      const p = await global.W.deployerGraph.observe(
        assessment(),
        CHAIN,
        TOKEN,
        "T",
      );
      expect(p).to.equal(null);
    });

    it("returns null on a non-2xx status", async () => {
      globalThis.fetch = async () =>
        new Response("server error", { status: 500 });
      const p = await global.W.deployerGraph.observe(
        assessment(),
        CHAIN,
        TOKEN,
        "T",
      );
      expect(p).to.equal(null);
    });

    it("returns null when the response body is not JSON", async () => {
      globalThis.fetch = async () =>
        new Response("not json at all", {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        });
      const p = await global.W.deployerGraph.observe(
        assessment(),
        CHAIN,
        TOKEN,
        "T",
      );
      expect(p).to.equal(null);
    });
  });

  // ── Response shape handling ────────────────────────────────

  describe("response shape", () => {
    it("returns null on a GraphQL errors response", async () => {
      mockFetch({ data: null, errors: [{ message: "oops" }] });
      const p = await global.W.deployerGraph.observe(
        assessment(),
        CHAIN,
        TOKEN,
        "T",
      );
      expect(p).to.equal(null);
    });

    it("returns null when data.EVM.Calls is missing", async () => {
      mockFetch({ data: { EVM: {} } });
      const p = await global.W.deployerGraph.observe(
        assessment(),
        CHAIN,
        TOKEN,
        "T",
      );
      expect(p).to.equal(null);
    });

    it("returns null when the top-level response is not an object", async () => {
      mockFetch("string");
      const p = await global.W.deployerGraph.observe(
        assessment(),
        CHAIN,
        TOKEN,
        "T",
      );
      expect(p).to.equal(null);
    });
  });

  // ── Qualification ──────────────────────────────────────────

  describe("qualification", () => {
    it("marks only the current token as qualified", async () => {
      mockFetch(
        bitqueryResponse([
          call({ to: OTHER_CONTRACT, hash: "0xtx1" }),
          call({ to: TOKEN, hash: "0xtx2" }),
          call({ to: OTHER_CONTRACT, hash: "0xtx3" }),
        ]),
      );
      const p = await global.W.deployerGraph.observe(
        assessment(),
        CHAIN,
        TOKEN,
        "T",
      );
      expect(p).to.be.an("object");
      expect(p.tokens).to.have.length(1);
      expect(p.tokens[0].tokenAddress).to.equal(TOKEN);
      expect(p.filteredContractCount).to.equal(2);
    });

    it("returns a profile with empty tokens when the current token is not among the calls", async () => {
      mockFetch(
        bitqueryResponse([
          call({ to: OTHER_CONTRACT, hash: "0xtx1" }),
          call({ to: OTHER_CONTRACT, hash: "0xtx2" }),
        ]),
      );
      const p = await global.W.deployerGraph.observe(
        assessment(),
        CHAIN,
        TOKEN,
        "T",
      );
      expect(p).to.be.an("object");
      expect(p.tokens).to.have.length(0);
      expect(p.filteredContractCount).to.equal(2);
    });

    it("handles an empty calls array", async () => {
      mockFetch(bitqueryResponse([]));
      const p = await global.W.deployerGraph.observe(
        assessment(),
        CHAIN,
        TOKEN,
        "T",
      );
      expect(p).to.be.an("object");
      expect(p.tokens).to.have.length(0);
      expect(p.filteredContractCount).to.equal(0);
    });

    it("ignores calls without a Call.To", async () => {
      mockFetch(
        bitqueryResponse([
          {
            Call: { From: CREATOR_LOWER, Create: true },
            Transaction: {},
            Block: {},
          },
          call({ to: TOKEN }),
        ]),
      );
      const p = await global.W.deployerGraph.observe(
        assessment(),
        CHAIN,
        TOKEN,
        "T",
      );
      expect(p).to.be.an("object");
      expect(p.tokens).to.have.length(1);
      expect(p.filteredContractCount).to.equal(0);
    });
  });

  // ── Evidence preservation ──────────────────────────────────

  it("preserves deploymentTxHash and deployedAt from the response", async () => {
    mockFetch(
      bitqueryResponse([
        call({
          to: TOKEN,
          hash: "0xdeadbeef",
          time: "2026-01-15T12:00:00.000Z",
        }),
      ]),
    );
    const p = await global.W.deployerGraph.observe(
      assessment(),
      CHAIN,
      TOKEN,
      "T",
    );
    expect(p.tokens[0].deploymentTxHash).to.equal("0xdeadbeef");
    expect(p.tokens[0].deployedAt).to.equal(
      Date.parse("2026-01-15T12:00:00.000Z"),
    );
  });

  // ── creatorMetadata ────────────────────────────────────────

  it("records creatorMetadata with agreement 'unavailable'", async () => {
    mockFetch(bitqueryResponse([call({ to: TOKEN })]));
    const p = await global.W.deployerGraph.observe(
      assessment(),
      CHAIN,
      TOKEN,
      "T",
    );
    expect(p.creatorMetadata).to.be.an("object");
    expect(p.creatorMetadata.goplusCreatorAddress).to.equal(CREATOR_LOWER);
    expect(p.creatorMetadata.agreement).to.equal("unavailable");
  });

  // ── Failures during the module pipeline ────────────────────

  it("returns null and does not throw when W.store.set throws during recording", async () => {
    mockFetch(bitqueryResponse([call({ to: TOKEN })]));
    const saved = global.W.store.set;
    global.W.store.set = () => {
      throw new Error("simulated quota exceeded");
    };
    try {
      const p = await global.W.deployerGraph.observe(
        assessment(),
        CHAIN,
        TOKEN,
        "T",
      );
      expect(p).to.equal(null);
    } finally {
      global.W.store.set = saved;
    }
  });

  it("never throws on any input", async () => {
    // chai-as-promised is not installed, so use a try/catch to assert
    // the absence of a throw rather than `.rejected`.
    let threw = false;
    let result = null;
    try {
      result = await global.W.deployerGraph.observe(
        undefined,
        undefined,
        undefined,
        undefined,
      );
    } catch (e) {
      threw = true;
    }
    expect(threw).to.equal(false);
    expect(result).to.equal(null);
  });
});
