// test/unit/owner-associations.test.js
//
// Owner associations — session-scoped owner observations.
//
// Design reference: docs/owner-associations-design.md

const { expect } = require("chai");

const path = require.resolve("../../js/intelligence/owner-associations.js");

describe("Owner associations — session module", () => {
  const CHAIN = "ethereum";
  const OWNER = "0xAbCdEf0000000000000000000000000000000001";
  const OWNER_LOWER = OWNER.toLowerCase();
  const TOKEN_A = "0x1111111111111111111111111111111111111111";
  const TOKEN_B = "0x2222222222222222222222222222222222222222";
  const TOKEN_C = "0x3333333333333333333333333333333333333333";

  let originalShield;

  before(() => {
    // Force-fresh load so this suite is self-contained regardless of
    // Mocha's file ordering.
    delete require.cache[path];
    require(path);
    originalShield = global.W.shield;
  });

  after(() => {
    global.W.shield = originalShield;
  });

  beforeEach(() => {
    global.W.ownerAssociations.reset();
    // Default Shield stub: mirrors the real isHighRisk contract.
    // Individual tests override this when they need a specific
    // behavior.
    global.W.shield = {
      isHighRisk: (a) => {
        if (!a || a.error || a.noData || a.unsupported) return false;
        const score = Number(a.riskScore);
        return Number.isFinite(score) && score >= 40;
      },
    };
  });

  function assessment(overrides = {}) {
    return {
      riskScore: 10,
      owner: { address: OWNER, source: "goplus-evm" },
      ...overrides,
    };
  }

  // ── Guard cases ────────────────────────────────────────────

  describe("observe — guard cases", () => {
    // Deferred lookup — describe bodies evaluate before before() runs.
    const obs = (...args) => global.W.ownerAssociations.observe(...args);

    it("returns null for a null assessment", () => {
      expect(obs(null, CHAIN, TOKEN_A, "A")).to.equal(null);
    });

    it("returns null when the assessment has no owner block", () => {
      expect(obs({ riskScore: 10 }, CHAIN, TOKEN_A, "A")).to.equal(null);
    });

    it("returns null when owner.address is null", () => {
      const a = { owner: { address: null, source: "goplus-evm" } };
      expect(obs(a, CHAIN, TOKEN_A, "A")).to.equal(null);
    });

    it("returns null when owner.address is an empty string", () => {
      const a = { owner: { address: "", source: "goplus-evm" } };
      expect(obs(a, CHAIN, TOKEN_A, "A")).to.equal(null);
    });

    it("returns null when owner.address is whitespace-only", () => {
      const a = { owner: { address: "   ", source: "goplus-evm" } };
      expect(obs(a, CHAIN, TOKEN_A, "A")).to.equal(null);
    });

    it("returns null when owner.address is not a string", () => {
      const a = { owner: { address: 12345, source: "goplus-evm" } };
      expect(obs(a, CHAIN, TOKEN_A, "A")).to.equal(null);
    });

    it("returns null for a missing or empty chainKey", () => {
      expect(obs(assessment(), null, TOKEN_A, "A")).to.equal(null);
      expect(obs(assessment(), "", TOKEN_A, "A")).to.equal(null);
      expect(obs(assessment(), "   ", TOKEN_A, "A")).to.equal(null);
    });

    it("returns null for a missing or empty tokenAddress", () => {
      expect(obs(assessment(), CHAIN, null, "A")).to.equal(null);
      expect(obs(assessment(), CHAIN, "", "A")).to.equal(null);
      expect(obs(assessment(), CHAIN, "   ", "A")).to.equal(null);
    });

    it("returns null for a shield error state", () => {
      expect(obs({ error: true }, CHAIN, TOKEN_A, "A")).to.equal(null);
    });

    it("returns null for a shield noData state", () => {
      expect(obs({ noData: true }, CHAIN, TOKEN_A, "A")).to.equal(null);
    });

    it("returns null for a shield unsupported state", () => {
      expect(obs({ unsupported: true }, CHAIN, TOKEN_A, "A")).to.equal(null);
    });
  });

  // ── Happy path ─────────────────────────────────────────────

  describe("observe — happy path", () => {
    it("returns an observation for a valid EVM owner", () => {
      const o = global.W.ownerAssociations.observe(
        assessment(),
        CHAIN,
        TOKEN_A,
        "A",
      );
      expect(o).to.be.an("object");
      expect(o.chain).to.equal(CHAIN);
      expect(o.ownerAddress).to.equal(OWNER_LOWER);
      expect(o.methodologyVersion).to.equal("owner-associations-v1");
      expect(o.seenOnTokens).to.have.length(1);
      expect(o.seenOnTokens[0].tokenAddress).to.equal(TOKEN_A);
      expect(o.seenOnTokens[0].symbol).to.equal("A");
      expect(o.seenOnTokens[0].source).to.equal("goplus-evm");
    });

    it("lowercases the owner address", () => {
      const o = global.W.ownerAssociations.observe(
        assessment(),
        CHAIN,
        TOKEN_A,
        "A",
      );
      expect(o.ownerAddress).to.equal(OWNER_LOWER);
      expect(o.ownerAddress).to.not.equal(OWNER);
    });

    it("records the observedAt timestamp on the token entry", () => {
      const before = Date.now();
      const o = global.W.ownerAssociations.observe(
        assessment(),
        CHAIN,
        TOKEN_A,
        "A",
      );
      const after = Date.now();
      expect(o.seenOnTokens[0].observedAt).to.be.at.least(before);
      expect(o.seenOnTokens[0].observedAt).to.be.at.most(after);
    });

    it("handles a missing symbol without crashing", () => {
      const o = global.W.ownerAssociations.observe(
        assessment(),
        CHAIN,
        TOKEN_A,
        undefined,
      );
      expect(o).to.be.an("object");
      expect(o.seenOnTokens[0].symbol).to.equal(null);
    });
  });

  // ── Chain separation ───────────────────────────────────────

  describe("observe — chain separation", () => {
    it("treats the same owner address on two chains as two associations", () => {
      const o1 = global.W.ownerAssociations.observe(
        assessment(),
        "ethereum",
        TOKEN_A,
        "A",
      );
      const o2 = global.W.ownerAssociations.observe(
        assessment(),
        "base",
        TOKEN_A,
        "A",
      );
      expect(o1.ownerAddress).to.equal(o2.ownerAddress);
      expect(o1.chain).to.equal("ethereum");
      expect(o2.chain).to.equal("base");
      // The two associations do not share state — each sees only its
      // own observation.
      expect(o1.seenOnTokens).to.have.length(1);
      expect(o2.seenOnTokens).to.have.length(1);
    });
  });

  // ── Token accumulation and deduplication ───────────────────

  describe("observe — token accumulation", () => {
    it("accumulates distinct tokens under the same owner", () => {
      global.W.ownerAssociations.observe(assessment(), CHAIN, TOKEN_A, "A");
      global.W.ownerAssociations.observe(assessment(), CHAIN, TOKEN_B, "B");
      const o = global.W.ownerAssociations.observe(
        assessment(),
        CHAIN,
        TOKEN_C,
        "C",
      );
      expect(o.seenOnTokens).to.have.length(3);
      const addrs = o.seenOnTokens.map((t) => t.tokenAddress).sort();
      expect(addrs).to.deep.equal([TOKEN_A, TOKEN_B, TOKEN_C].sort());
    });

    it("does NOT increase the count when the same token is observed twice", () => {
      global.W.ownerAssociations.observe(assessment(), CHAIN, TOKEN_A, "A");
      const o = global.W.ownerAssociations.observe(
        assessment(),
        CHAIN,
        TOKEN_A,
        "A",
      );
      expect(o.seenOnTokens).to.have.length(1);
    });

    it("updates the entry with the latest observation when re-observing", async () => {
      const o1 = global.W.ownerAssociations.observe(
        assessment({ riskScore: 10 }),
        CHAIN,
        TOKEN_A,
        "A",
      );
      const firstAt = o1.seenOnTokens[0].observedAt;

      await new Promise((r) => setTimeout(r, 5));

      const o2 = global.W.ownerAssociations.observe(
        assessment({ riskScore: 80 }),
        CHAIN,
        TOKEN_A,
        "A",
      );
      expect(o2.seenOnTokens).to.have.length(1);
      expect(o2.seenOnTokens[0].observedAt).to.be.greaterThan(firstAt);
      expect(o2.seenOnTokens[0].riskScore).to.equal(80);
      expect(o2.seenOnTokens[0].isHighRisk).to.equal(true);
    });

    it("normalizes token addresses for deduplication", () => {
      const mixedCase = "0xAAAA111111111111111111111111111111111111";
      global.W.ownerAssociations.observe(assessment(), CHAIN, mixedCase, "A");
      const o = global.W.ownerAssociations.observe(
        assessment(),
        CHAIN,
        mixedCase.toLowerCase(),
        "A",
      );
      expect(o.seenOnTokens).to.have.length(1);
    });
  });

  // ── isHighRisk authority ──────────────────────────────────

  describe("observe — isHighRisk authority", () => {
    it("obtains isHighRisk through W.shield.isHighRisk", () => {
      let calls = 0;
      global.W.shield = {
        isHighRisk: (a) => {
          calls++;
          return a && a.riskScore >= 40;
        },
      };
      const o = global.W.ownerAssociations.observe(
        assessment({ riskScore: 80 }),
        CHAIN,
        TOKEN_A,
        "A",
      );
      expect(calls).to.equal(1);
      expect(o.seenOnTokens[0].isHighRisk).to.equal(true);
    });

    it("reports isHighRisk false when W.shield.isHighRisk is unavailable", () => {
      global.W.shield = undefined;
      const o = global.W.ownerAssociations.observe(
        assessment({ riskScore: 80 }),
        CHAIN,
        TOKEN_A,
        "A",
      );
      expect(o.seenOnTokens[0].isHighRisk).to.equal(false);
    });

    it("never duplicates the Shield threshold", () => {
      // A predicate that always returns false, even for a high risk
      // score. The module must not short-circuit to its own threshold.
      global.W.shield = { isHighRisk: () => false };
      const o = global.W.ownerAssociations.observe(
        assessment({ riskScore: 99 }),
        CHAIN,
        TOKEN_A,
        "A",
      );
      expect(o.seenOnTokens[0].isHighRisk).to.equal(false);
    });

    it("reports isHighRisk false when the risk score is malformed", () => {
      const o = global.W.ownerAssociations.observe(
        assessment({ riskScore: "not a number" }),
        CHAIN,
        TOKEN_A,
        "A",
      );
      expect(o.seenOnTokens[0].isHighRisk).to.equal(false);
      expect(o.seenOnTokens[0].riskScore).to.equal(null);
    });
  });

  // ── summarise ──────────────────────────────────────────────

  describe("summarise", () => {
    // Deferred lookup — describe bodies evaluate before before() runs.
    const summarise = (...args) =>
      global.W.ownerAssociations.summarise(...args);

    it("returns null for a null observation", () => {
      expect(summarise(null)).to.equal(null);
    });

    it("returns null for an observation with no tokens", () => {
      expect(summarise({ seenOnTokens: [] })).to.equal(null);
    });

    it("returns the 'first seen' summary for a single-token observation", () => {
      const o = {
        seenOnTokens: [
          { tokenAddress: TOKEN_A, isHighRisk: false, riskScore: 10 },
        ],
      };
      expect(summarise(o)).to.equal("Owner address: first seen this session");
    });

    it("states the token count when no token is high-risk", () => {
      const o = {
        seenOnTokens: [
          { tokenAddress: TOKEN_A, isHighRisk: false },
          { tokenAddress: TOKEN_B, isHighRisk: false },
          { tokenAddress: TOKEN_C, isHighRisk: false },
        ],
      };
      expect(summarise(o)).to.equal("Owner address seen on 3 tokens");
    });

    it("states both counts when any token is high-risk", () => {
      const o = {
        seenOnTokens: [
          { tokenAddress: TOKEN_A, isHighRisk: true },
          { tokenAddress: TOKEN_B, isHighRisk: false },
          { tokenAddress: TOKEN_C, isHighRisk: false },
        ],
      };
      expect(summarise(o)).to.equal(
        "Owner address seen on 3 tokens — 1 flagged high-risk",
      );
    });

    it("counts multiple high-risk tokens correctly", () => {
      const o = {
        seenOnTokens: [
          { tokenAddress: TOKEN_A, isHighRisk: true },
          { tokenAddress: TOKEN_B, isHighRisk: true },
          { tokenAddress: TOKEN_C, isHighRisk: false },
        ],
      };
      expect(summarise(o)).to.equal(
        "Owner address seen on 3 tokens — 2 flagged high-risk",
      );
    });

    it("never uses 'deployer', 'launched', 'safe', 'trusted', or 'same team'", () => {
      const o = {
        seenOnTokens: [
          { tokenAddress: TOKEN_A, isHighRisk: true },
          { tokenAddress: TOKEN_B, isHighRisk: false },
        ],
      };
      const s = summarise(o).toLowerCase();
      expect(s).to.not.include("deployer");
      expect(s).to.not.include("launched");
      expect(s).to.not.include("safe");
      expect(s).to.not.include("trusted");
      expect(s).to.not.include("same team");
      expect(s).to.not.include("creator");
    });
  });

  // ── get (read-only accessor) ───────────────────────────────

  describe("get", () => {
    it("returns null when no association exists for the token", () => {
      expect(global.W.ownerAssociations.get(CHAIN, TOKEN_A)).to.equal(null);
    });

    it("returns null for missing or invalid inputs", () => {
      expect(global.W.ownerAssociations.get(null, TOKEN_A)).to.equal(null);
      expect(global.W.ownerAssociations.get("", TOKEN_A)).to.equal(null);
      expect(global.W.ownerAssociations.get(CHAIN, null)).to.equal(null);
      expect(global.W.ownerAssociations.get(CHAIN, "")).to.equal(null);
      expect(global.W.ownerAssociations.get(CHAIN, "   ")).to.equal(null);
    });

    it("returns the association when the token has been observed", () => {
      global.W.ownerAssociations.observe(assessment(), CHAIN, TOKEN_A, "A");
      const o = global.W.ownerAssociations.get(CHAIN, TOKEN_A);
      expect(o).to.be.an("object");
      expect(o.ownerAddress).to.equal(OWNER_LOWER);
      expect(o.seenOnTokens).to.have.length(1);
    });

    it("does not mutate session state", async () => {
      global.W.ownerAssociations.observe(assessment(), CHAIN, TOKEN_A, "A");
      const first = global.W.ownerAssociations.get(CHAIN, TOKEN_A);
      const firstAt = first.seenOnTokens[0].observedAt;

      await new Promise((r) => setTimeout(r, 5));

      const second = global.W.ownerAssociations.get(CHAIN, TOKEN_A);
      expect(second.seenOnTokens[0].observedAt).to.equal(firstAt);
    });

    it("returns the accumulated association across multiple tokens", () => {
      global.W.ownerAssociations.observe(assessment(), CHAIN, TOKEN_A, "A");
      global.W.ownerAssociations.observe(assessment(), CHAIN, TOKEN_B, "B");
      const o = global.W.ownerAssociations.get(CHAIN, TOKEN_A);
      expect(o.seenOnTokens).to.have.length(2);
    });

    it("scopes the lookup by chain", () => {
      global.W.ownerAssociations.observe(
        assessment(),
        "ethereum",
        TOKEN_A,
        "A",
      );
      expect(global.W.ownerAssociations.get("base", TOKEN_A)).to.equal(null);
      expect(global.W.ownerAssociations.get("ethereum", TOKEN_A)).to.be.an(
        "object",
      );
    });

    it("returns a clone so the caller cannot mutate session state", () => {
      global.W.ownerAssociations.observe(assessment(), CHAIN, TOKEN_A, "A");
      const o1 = global.W.ownerAssociations.get(CHAIN, TOKEN_A);
      o1.seenOnTokens[0].symbol = "CORRUPTED";
      const o2 = global.W.ownerAssociations.get(CHAIN, TOKEN_A);
      expect(o2.seenOnTokens[0].symbol).to.equal("A");
    });

    it("does not throw for any input", () => {
      expect(() => global.W.ownerAssociations.get()).to.not.throw();
      expect(() => global.W.ownerAssociations.get(null, null)).to.not.throw();
      expect(() => global.W.ownerAssociations.get(123, 456)).to.not.throw();
    });
  });

  // ── reset ──────────────────────────────────────────────────

  describe("reset", () => {
    it("clears session state", () => {
      global.W.ownerAssociations.observe(assessment(), CHAIN, TOKEN_A, "A");
      global.W.ownerAssociations.reset();
      const o = global.W.ownerAssociations.observe(
        assessment(),
        CHAIN,
        TOKEN_B,
        "B",
      );
      expect(o.seenOnTokens).to.have.length(1);
      expect(o.seenOnTokens[0].tokenAddress).to.equal(TOKEN_B);
    });
  });

  // ── Failure isolation ──────────────────────────────────────

  describe("failure isolation", () => {
    it("observe does not throw when W.shield.isHighRisk throws", () => {
      global.W.shield = {
        isHighRisk: () => {
          throw new Error("simulated predicate failure");
        },
      };
      expect(() =>
        global.W.ownerAssociations.observe(assessment(), CHAIN, TOKEN_A, "A"),
      ).to.not.throw();
    });

    it("reports isHighRisk false when the predicate throws", () => {
      global.W.shield = {
        isHighRisk: () => {
          throw new Error("simulated predicate failure");
        },
      };
      const o = global.W.ownerAssociations.observe(
        assessment(),
        CHAIN,
        TOKEN_A,
        "A",
      );
      expect(o).to.be.an("object");
      expect(o.seenOnTokens[0].isHighRisk).to.equal(false);
    });

    it("summarise does not throw for malformed input", () => {
      expect(() =>
        global.W.ownerAssociations.summarise("not an object"),
      ).to.not.throw();
      expect(() => global.W.ownerAssociations.summarise(null)).to.not.throw();
      expect(() => global.W.ownerAssociations.summarise({})).to.not.throw();
      expect(() =>
        global.W.ownerAssociations.summarise({ seenOnTokens: "nope" }),
      ).to.not.throw();
    });
  });

  // ── Return-value isolation ─────────────────────────────────

  describe("return-value isolation", () => {
    it("mutating the returned observation does not affect session state", () => {
      const o1 = global.W.ownerAssociations.observe(
        assessment(),
        CHAIN,
        TOKEN_A,
        "A",
      );
      o1.seenOnTokens[0].symbol = "CORRUPTED";
      o1.seenOnTokens[0].riskScore = 999;

      const o2 = global.W.ownerAssociations.observe(
        assessment(),
        CHAIN,
        TOKEN_A,
        "A",
      );
      expect(o2.seenOnTokens[0].symbol).to.equal("A");
      expect(o2.seenOnTokens[0].riskScore).to.equal(10);
    });
  });
});
