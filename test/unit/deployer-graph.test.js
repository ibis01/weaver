
//
//  The deployer graph design. Cache primitive: record,
// get, summarise, eviction, TTL. No provider wiring yet.

const { expect } = require("chai");

const path = require.resolve("../../js/intelligence/deployer-graph.js");

describe("Deployer graph — cache primitive", () => {
  const CHAIN = "ethereum";
  const DEPLOYER_A = "0xAbCdEf0000000000000000000000000000000001";
  const DEPLOYER_A_LOWER = DEPLOYER_A.toLowerCase();
  const DEPLOYER_B = "0xAbCdEf0000000000000000000000000000000002";
  const DEPLOYER_B_LOWER = DEPLOYER_B.toLowerCase();
  const TOKEN_X = "0x1111111111111111111111111111111111111111";
  const TOKEN_Y = "0x2222222222222222222222222222222222222222";
  const TOKEN_Z = "0x3333333333333333333333333333333333333333";

  let originalShield;

  before(() => {
    delete require.cache[path];
    require(path);
    originalShield = global.W.shield;
  });

  after(() => {
    global.W.shield = originalShield;
  });

  beforeEach(() => {
    global.W.store.clearAll();
    global.W.deployerGraph.reset();
    // Default Shield stub: mirrors the real predicate contract.
    global.W.shield = {
      isHighRisk: (a) => {
        if (!a) return false;
        const score = Number(a.riskScore);
        return Number.isFinite(score) && score >= 40;
      },
    };
  });

  function token(overrides = {}) {
    return {
      tokenAddress: TOKEN_X,
      deployedAt: Date.now() - 60_000,
      deploymentTxHash: "0xtxhash",
      deploymentEvidence: {
        source: "bitquery",
        method: "evm-call-create",
        deployerAddress: DEPLOYER_A_LOWER,
        callType: "direct",
      },
      riskScore: null,
      shieldObservedAt: null,
      shieldSource: null,
      ...overrides,
    };
  }

  function profile(overrides = {}) {
    return {
      tokens: [token()],
      filteredContractCount: 0,
      source: "bitquery",
      observedAt: Date.now(),
      ...overrides,
    };
  }

  // ── Internal helpers ───────────────────────────────────────

  describe("keyFor and normalizeAddress", () => {
    // Deferred lookups — describe bodies evaluate before before().
    const keyFor = (...args) =>
      global.W.deployerGraph._internal.keyFor(...args);
    const normalizeAddress = (...args) =>
      global.W.deployerGraph._internal.normalizeAddress(...args);

    it("lowercases deployer addresses", () => {
      expect(normalizeAddress(DEPLOYER_A)).to.equal(DEPLOYER_A_LOWER);
    });

    it("returns null for missing or empty address", () => {
      expect(normalizeAddress(null)).to.equal(null);
      expect(normalizeAddress("")).to.equal(null);
      expect(normalizeAddress("   ")).to.equal(null);
      expect(normalizeAddress(42)).to.equal(null);
    });

    it("builds a chain-aware key", () => {
      const k = keyFor("ethereum", DEPLOYER_A);
      expect(k).to.equal("deployer:ethereum:" + DEPLOYER_A_LOWER);
    });

    it("returns null for missing chain or address", () => {
      expect(keyFor(null, DEPLOYER_A)).to.equal(null);
      expect(keyFor("ethereum", null)).to.equal(null);
    });

    it("treats the same deployer on two chains as two keys", () => {
      expect(keyFor("ethereum", DEPLOYER_A)).to.not.equal(
        keyFor("base", DEPLOYER_A),
      );
    });
  });

  // ── record ─────────────────────────────────────────────────

  describe("record", () => {
    const rec = (...args) => global.W.deployerGraph.record(...args);

    it("records a valid profile and returns true", () => {
      expect(rec(CHAIN, DEPLOYER_A, profile())).to.equal(true);
    });

    it("rejects a null profile", () => {
      expect(rec(CHAIN, DEPLOYER_A, null)).to.equal(false);
    });

    it("rejects a profile without a tokens array", () => {
      expect(rec(CHAIN, DEPLOYER_A, {})).to.equal(false);
      expect(rec(CHAIN, DEPLOYER_A, { tokens: "no" })).to.equal(false);
    });

    it("rejects an invalid chainKey or deployerAddress", () => {
      expect(rec(null, DEPLOYER_A, profile())).to.equal(false);
      expect(rec(CHAIN, null, profile())).to.equal(false);
      expect(rec(CHAIN, "", profile())).to.equal(false);
    });

    it("rejects a profile with an invalid token", () => {
      const bad = profile({
        tokens: [{ tokenAddress: "" }],
      });
      expect(rec(CHAIN, DEPLOYER_A, bad)).to.equal(false);
    });

    it("accepts an empty tokens array", () => {
      expect(rec(CHAIN, DEPLOYER_A, profile({ tokens: [] }))).to.equal(true);
    });

    it("does not throw on malformed input", () => {
      expect(() => rec(undefined, undefined, undefined)).to.not.throw();
      expect(() => rec(CHAIN, DEPLOYER_A, "string")).to.not.throw();
      expect(() => rec(CHAIN, DEPLOYER_A, { tokens: [null] })).to.not.throw();
    });
  });

  // ── get ────────────────────────────────────────────────────

  describe("get", () => {
    const rec = (...args) => global.W.deployerGraph.record(...args);
    const get = (...args) => global.W.deployerGraph.get(...args);

    it("returns null when no profile exists", () => {
      expect(get(CHAIN, TOKEN_X)).to.equal(null);
    });

    it("returns null for invalid inputs", () => {
      expect(get(null, TOKEN_X)).to.equal(null);
      expect(get(CHAIN, null)).to.equal(null);
      expect(get(CHAIN, "")).to.equal(null);
    });

    it("returns the profile when the token is found", () => {
      rec(CHAIN, DEPLOYER_A, profile());
      const p = get(CHAIN, TOKEN_X);
      expect(p).to.be.an("object");
      expect(p.deployerAddress).to.equal(DEPLOYER_A_LOWER);
      expect(p.tokens).to.have.length(1);
      expect(p.tokens[0].tokenAddress).to.equal(TOKEN_X);
    });

    it("normalizes the token address for lookup", () => {
      const mixedToken = "0xAAAA111111111111111111111111111111111111";
      rec(
        CHAIN,
        DEPLOYER_A,
        profile({
          tokens: [token({ tokenAddress: mixedToken })],
        }),
      );
      expect(get(CHAIN, mixedToken.toLowerCase())).to.be.an("object");
      expect(get(CHAIN, mixedToken.toUpperCase())).to.be.an("object");
    });

    it("scopes the lookup by chain", () => {
      rec("ethereum", DEPLOYER_A, profile());
      expect(get("base", TOKEN_X)).to.equal(null);
      expect(get("ethereum", TOKEN_X)).to.be.an("object");
    });

    it("returns a clone so the caller cannot mutate the cache", () => {
      rec(CHAIN, DEPLOYER_A, profile());
      const p1 = get(CHAIN, TOKEN_X);
      p1.tokens[0].tokenAddress = "CORRUPTED";
      const p2 = get(CHAIN, TOKEN_X);
      expect(p2.tokens[0].tokenAddress).to.equal(TOKEN_X);
    });

    it("finds the profile across multiple cached deployers", () => {
      rec(
        CHAIN,
        DEPLOYER_A,
        profile({
          tokens: [token({ tokenAddress: TOKEN_X })],
        }),
      );
      rec(
        CHAIN,
        DEPLOYER_B,
        profile({
          tokens: [token({ tokenAddress: TOKEN_Y })],
        }),
      );
      expect(get(CHAIN, TOKEN_X).deployerAddress).to.equal(DEPLOYER_A_LOWER);
      expect(get(CHAIN, TOKEN_Y).deployerAddress).to.equal(DEPLOYER_B_LOWER);
      expect(get(CHAIN, TOKEN_Z)).to.equal(null);
    });

    it("does not throw on any input", () => {
      expect(() => get()).to.not.throw();
      expect(() => get(123, 456)).to.not.throw();
    });
  });

  // ── TTL ────────────────────────────────────────────────────

  describe("TTL", () => {
    const rec = (...args) => global.W.deployerGraph.record(...args);
    const get = (...args) => global.W.deployerGraph.get(...args);
    const RETENTION_MS = () => global.W.deployerGraph._internal.RETENTION_MS;
    const isExpired = (...args) =>
      global.W.deployerGraph._internal.isExpired(...args);

    it("isExpired returns true for a stale entry", () => {
      const old = Date.now() - RETENTION_MS() - 1000;
      expect(isExpired({ observedAt: old })).to.equal(true);
    });

    it("isExpired returns false for a fresh entry", () => {
      expect(isExpired({ observedAt: Date.now() })).to.equal(false);
    });

    it("isExpired returns true for a malformed entry", () => {
      expect(isExpired(null)).to.equal(true);
      expect(isExpired({})).to.equal(true);
      expect(isExpired({ observedAt: "not a number" })).to.equal(true);
    });

    it("does not return an expired profile from get()", () => {
      const old = Date.now() - RETENTION_MS() - 1000;
      rec(CHAIN, DEPLOYER_A, profile({ observedAt: old }));
      expect(get(CHAIN, TOKEN_X)).to.equal(null);
    });
  });

  // ── Eviction ───────────────────────────────────────────────

  describe("eviction", () => {
    const rec = (...args) => global.W.deployerGraph.record(...args);
    const get = (...args) => global.W.deployerGraph.get(...args);
    const MAX_PROFILES = () => global.W.deployerGraph._internal.MAX_PROFILES;
    const pruneAndEvict = (...args) =>
      global.W.deployerGraph._internal.pruneAndEvict(...args);

    it("pruneAndEvict drops expired entries first", () => {
      const now = Date.now();
      const old = now - 48 * 60 * 60 * 1000;
      const entries = [
        { key: "k1", entry: { observedAt: old } },
        { key: "k2", entry: { observedAt: now } },
        { key: "k3", entry: { observedAt: now } },
      ];
      const kept = pruneAndEvict(entries, 100, now);
      expect(kept.map((e) => e.key).sort()).to.deep.equal(["k2", "k3"]);
    });

    it("pruneAndEvict respects the cap and keeps the most recent", () => {
      const now = Date.now();
      const entries = [];
      for (let i = 0; i < 5; i++) {
        entries.push({
          key: "k" + i,
          entry: { observedAt: now - i * 1000 },
        });
      }
      const kept = pruneAndEvict(entries, 3, now);
      expect(kept).to.have.length(3);
      expect(kept.map((e) => e.key)).to.deep.equal(["k0", "k1", "k2"]);
    });

    it("caps the cache at MAX_PROFILES", () => {
      const cap = MAX_PROFILES();
      const now = Date.now();
      for (let i = 0; i < cap; i++) {
        const deployer = "0x" + String(i + 1).padStart(40, "0");
        const t = "0x" + String(i + 100000).padStart(40, "0");
        rec(
          CHAIN,
          deployer,
          profile({
            observedAt: now - (cap - i) * 1000,
            tokens: [token({ tokenAddress: t })],
          }),
        );
      }
      // Add one more, pushing the oldest out.
      const newestDeployer = "0x" + "f".repeat(40);
      const newestToken = "0x" + "e".repeat(40);
      rec(
        CHAIN,
        newestDeployer,
        profile({
          observedAt: now + 1000,
          tokens: [token({ tokenAddress: newestToken })],
        }),
      );

      // The oldest deployer (i=0) should be gone.
      const oldestToken = "0x" + String(100000).padStart(40, "0");
      expect(get(CHAIN, oldestToken)).to.equal(null);
      // The newest is present.
      expect(get(CHAIN, newestToken)).to.be.an("object");
    });
  });

  // ── summarise ──────────────────────────────────────────────

  describe("summarise", () => {
    const sum = (...args) => global.W.deployerGraph.summarise(...args);

    it("returns null for null or missing observation", () => {
      expect(sum(null)).to.equal(null);
      expect(sum(undefined)).to.equal(null);
      expect(sum("string")).to.equal(null);
    });

    it("returns null for an empty tokens array", () => {
      expect(sum({ tokens: [] })).to.equal(null);
    });

    it("returns null for a missing tokens array", () => {
      expect(sum({})).to.equal(null);
    });

    it("uses singular for a single token", () => {
      const s = sum({ tokens: [token()] });
      expect(s).to.equal("Deployer previously created 1 qualified token");
    });

    it("uses plural for multiple tokens", () => {
      const s = sum({
        tokens: [
          token({ tokenAddress: TOKEN_X }),
          token({ tokenAddress: TOKEN_Y }),
        ],
      });
      expect(s).to.equal("Deployer previously created 2 qualified tokens");
    });

    it("appends the high-risk clause when any token is flagged", () => {
      const s = sum({
        tokens: [
          token({ tokenAddress: TOKEN_X, riskScore: 80 }),
          token({ tokenAddress: TOKEN_Y, riskScore: 10 }),
          token({ tokenAddress: TOKEN_Z, riskScore: null }),
        ],
      });
      expect(s).to.equal(
        "Deployer previously created 3 qualified tokens — 1 flagged high-risk",
      );
    });

    it("does NOT count tokens with null riskScore as high-risk", () => {
      const s = sum({
        tokens: [
          token({ tokenAddress: TOKEN_X, riskScore: null }),
          token({ tokenAddress: TOKEN_Y, riskScore: null }),
        ],
      });
      expect(s).to.equal("Deployer previously created 2 qualified tokens");
    });

    it("does NOT count tokens with malformed riskScore as high-risk", () => {
      const s = sum({
        tokens: [
          token({ tokenAddress: TOKEN_X, riskScore: "not a number" }),
          token({ tokenAddress: TOKEN_Y, riskScore: NaN }),
        ],
      });
      expect(s).to.equal("Deployer previously created 2 qualified tokens");
    });

    it("omits the high-risk clause when zero tokens are flagged", () => {
      const s = sum({
        tokens: [
          token({ tokenAddress: TOKEN_X, riskScore: 10 }),
          token({ tokenAddress: TOKEN_Y, riskScore: 20 }),
        ],
      });
      expect(s).to.not.include("high-risk");
    });

    it("never uses 'serial rugger', 'safe', 'trusted', 'team', or 'project'", () => {
      const s = sum({
        tokens: [
          token({ tokenAddress: TOKEN_X, riskScore: 80 }),
          token({ tokenAddress: TOKEN_Y, riskScore: 10 }),
        ],
      }).toLowerCase();
      expect(s).to.not.include("serial");
      expect(s).to.not.include("rugger");
      expect(s).to.not.include("safe");
      expect(s).to.not.include("trusted");
      expect(s).to.not.include("team");
      expect(s).to.not.include("project");
    });

    it("uses isHighRisk through W.shield, never a duplicated threshold", () => {
      let calls = 0;
      global.W.shield = {
        isHighRisk: () => {
          calls++;
          return false;
        },
      };
      sum({
        tokens: [token({ tokenAddress: TOKEN_X, riskScore: 999 })],
      });
      expect(calls).to.equal(1);
    });

    it("treats a token as non-high-risk when the predicate is unavailable", () => {
      global.W.shield = undefined;
      const s = sum({
        tokens: [token({ tokenAddress: TOKEN_X, riskScore: 999 })],
      });
      expect(s).to.equal("Deployer previously created 1 qualified token");
    });

    it("does not throw when the predicate throws", () => {
      global.W.shield = {
        isHighRisk: () => {
          throw new Error("simulated failure");
        },
      };
      const s = sum({
        tokens: [token({ tokenAddress: TOKEN_X, riskScore: 999 })],
      });
      expect(s).to.be.a("string");
    });
  });

  // ── reset ──────────────────────────────────────────────────

  describe("reset", () => {
    it("clears all cached profiles", () => {
      global.W.deployerGraph.record(CHAIN, DEPLOYER_A, profile());
      expect(global.W.deployerGraph.get(CHAIN, TOKEN_X)).to.be.an("object");
      global.W.deployerGraph.reset();
      expect(global.W.deployerGraph.get(CHAIN, TOKEN_X)).to.equal(null);
    });
  });

  // ── Evidence preservation ──────────────────────────────────

  describe("evidence preservation", () => {
    const rec = (...args) => global.W.deployerGraph.record(...args);
    const get = (...args) => global.W.deployerGraph.get(...args);

    it("preserves deploymentTxHash and deploymentEvidence on each token", () => {
      rec(
        CHAIN,
        DEPLOYER_A,
        profile({
          tokens: [
            token({
              tokenAddress: TOKEN_X,
              deploymentTxHash: "0xabc",
              deploymentEvidence: {
                source: "bitquery",
                method: "evm-call-create",
                deployerAddress: DEPLOYER_A_LOWER,
                callType: "factory",
              },
            }),
          ],
        }),
      );
      const p = get(CHAIN, TOKEN_X);
      expect(p.tokens[0].deploymentTxHash).to.equal("0xabc");
      expect(p.tokens[0].deploymentEvidence.callType).to.equal("factory");
      expect(p.tokens[0].deploymentEvidence.method).to.equal("evm-call-create");
    });

    it("preserves creatorMetadata when supplied", () => {
      rec(
        CHAIN,
        DEPLOYER_A,
        profile({
          creatorMetadata: {
            goplusCreatorAddress: "0xaaaa000000000000000000000000000000000001",
            agreement: "mismatch",
          },
        }),
      );
      const p = get(CHAIN, TOKEN_X);
      expect(p.creatorMetadata.agreement).to.equal("mismatch");
    });

    it("preserves filteredContractCount when supplied", () => {
      rec(CHAIN, DEPLOYER_A, profile({ filteredContractCount: 7 }));
      const p = get(CHAIN, TOKEN_X);
      expect(p.filteredContractCount).to.equal(7);
    });
  });

  // ── Failure isolation ──────────────────────────────────────

  describe("failure isolation", () => {
    it("record returns false and does not throw when W.store.set throws", () => {
      const saved = global.W.store.set;
      global.W.store.set = () => {
        throw new Error("simulated quota exceeded");
      };
      try {
        const ok = global.W.deployerGraph.record(CHAIN, DEPLOYER_A, profile());
        expect(ok).to.equal(false);
      } finally {
        global.W.store.set = saved;
      }
    });

    it("get returns null and does not throw when W.store.get throws", () => {
      const saved = global.W.store.get;
      global.W.store.get = () => {
        throw new Error("simulated read error");
      };
      try {
        expect(global.W.deployerGraph.get(CHAIN, TOKEN_X)).to.equal(null);
      } finally {
        global.W.store.get = saved;
      }
    });

    it("summarise does not throw on malformed tokens", () => {
      expect(() =>
        global.W.deployerGraph.summarise({ tokens: [null, "string", 42] }),
      ).to.not.throw();
    });
  });
});
