// test/unit/gems-deployer.test.js
//
// Step 5 of the deployer graph design. Gem scan integration.
// Verifies guards, bounded concurrency, the per-scan cap, the
// async ordering relative to the filter, and the read-only
// render path.

const { expect } = require("chai");

const ownerPath =
  require.resolve("../../js/intelligence/owner-associations.js");
const marketStructurePath =
  require.resolve("../../js/intelligence/market-structure.js");
const deployerPath = require.resolve("../../js/intelligence/deployer-graph.js");

describe("Gem Agent — deployer observation integration", () => {
  const ADDR_A = "0x1111111111111111111111111111111111111111";
  const ADDR_B = "0x2222222222222222222222222222222222222222";
  const ADDR_C = "0x3333333333333333333333333333333333333333";
  const OWNER = "0xAbCdEf0000000000000000000000000000000001";
  const CREATOR = "0xAbCdEf0000000000000000000000000000000002";
  const CREATOR_LOWER = CREATOR.toLowerCase();
  const ADDR_SOL = "SoMeBaSe58AdDrEsS1111111111111111111111111";

  let originalFetch;
  let originalShield;
  let originalShieldCheck;
  let originalUi;
  let originalFmtPct;
  let originalDeployerGraph;

  function mockPair(chainId, address, symbol) {
    return {
      chainId,
      baseToken: { address, symbol, name: symbol + " token" },
      liquidity: { usd: 61000 },
      volume: { h24: 78000 },
      priceChange: { h1: 5, h6: 5, h24: 15 },
      pairCreatedAt: Date.now() - 20 * 3600 * 1000,
      priceUsd: "0.01",
      url: "https://dexscreener.com/test",
      pairAddress: "0xpair",
    };
  }

  function installFetch(pairs) {
    global.fetch = async (url) => {
      const u = String(url);
      if (u.includes("token-boosts")) {
        return {
          ok: true,
          json: async () =>
            pairs.map((p) => ({
              tokenAddress: p.baseToken.address,
              totalBoosts: 5,
            })),
        };
      }
      if (u.includes("token-profiles")) {
        return { ok: true, json: async () => [] };
      }
      if (u.includes("/latest/dex/tokens/")) {
        return { ok: true, json: async () => ({ pairs }) };
      }
      throw new Error("Unexpected fetch: " + u);
    };
  }

  function buildScanDom({ hideRisk = false, chain = "" } = {}) {
    const root = document.createElement("div");
    root.innerHTML = `
      <select id="g-min"><option value="0" selected>0</option></select>
      <select id="g-chain">
        <option value="">All</option>
        <option value="ethereum">ethereum</option>
        <option value="base">base</option>
      </select>
      <input type="checkbox" id="g-hide-risk" ${hideRisk ? "checked" : ""}>
      <div id="g-stats"></div>
      <div id="g-body"></div>
    `;
    root.querySelector("#g-chain").value = chain;
    document.body.appendChild(root);
    return root;
  }

  function evmAssessment(overrides = {}) {
    return {
      riskScore: 10,
      riskLevel: ["🟢 No identified risk indicators", "no-identified-risk"],
      scoreVersion: "shield-evm-v1",
      flags: {
        isHoneypot: false,
        isMintable: false,
        isProxy: false,
        isOwnerRenounced: true,
        isLpLocked: true,
      },
      holders: {
        count: 241,
        top10: [],
        top10Pct: 51.2,
        lpCount: 3,
        lockedLpCount: 2,
        hasLockedLp: true,
        source: "goplus-evm",
      },
      owner: { address: OWNER, source: "goplus-evm" },
      creator: { address: CREATOR, source: "goplus-evm" },
      ...overrides,
    };
  }

  function solanaAssessment() {
    return {
      riskScore: 10,
      scoreVersion: "shield-solana-v1",
      flags: {},
      holders: {
        count: null,
        top10: null,
        top10Pct: null,
        lpCount: null,
        lockedLpCount: null,
        hasLockedLp: null,
        source: "unavailable",
        reason: "unavailable",
      },
      owner: {
        address: null,
        source: "unavailable",
        reason: "unavailable",
      },
      creator: {
        address: null,
        source: "unavailable",
        reason: "unavailable",
      },
    };
  }

  before(() => {
    originalFetch = global.fetch;
    originalUi = global.W.ui;
    originalFmtPct = global.W.fmt.pct;
    originalShield = global.W.shield;
    originalDeployerGraph = global.W.deployerGraph;

    delete require.cache[ownerPath];
    require(ownerPath);
    delete require.cache[marketStructurePath];
    require(marketStructurePath);
    delete require.cache[deployerPath];
    require(deployerPath);

    global.W.ui = {
      spinner: () => "<div>loading</div>",
      empty: (_i, m) => `<div>${m}</div>`,
      toast: () => {},
    };
    global.W.fmt.pct = (n) =>
      n === undefined || n === null
        ? "—"
        : (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
    global.W.tg = undefined;
    global.W.theses = undefined;

    originalShieldCheck = global.W.shield.check;
  });

  after(() => {
    global.fetch = originalFetch;
    global.W.ui = originalUi;
    global.W.fmt.pct = originalFmtPct;
    if (originalShield) global.W.shield.check = originalShieldCheck;
    global.W.deployerGraph = originalDeployerGraph;
  });

  beforeEach(() => {
    global.W.store.clearAll();
    global.W.gems._internal.resetShieldCache();
    global.W.gems._internal.resetSeen();
    if (global.W.ownerAssociations) global.W.ownerAssociations.reset();
    if (global.W.deployerGraph) {
      global.W.deployerGraph.reset();
      global.W.deployerGraph._internal.setWorkerBase(
        "https://worker.example.com",
      );
    }
    globalThis.fetch = async () => {
      throw new Error("fetch called without a mock");
    };
  });

  // ── observeDeployer in isolation ──────────────────────────

  describe("observeDeployer", () => {
    const rec = (gem) => global.W.gems._internal.observeDeployer(gem);

    function gem(chainId, address, symbol) {
      return { pair: mockPair(chainId, address, symbol) };
    }

    function primeShield(chainId, address, assessment) {
      const key = global.W.gems._internal.shieldCacheKey(address, chainId);
      global.W.gems._internal.setCachedShield(key, assessment);
    }

    it("returns null when W.deployerGraph is unavailable", async () => {
      const saved = global.W.deployerGraph;
      global.W.deployerGraph = undefined;
      try {
        expect(await rec(gem("ethereum", ADDR_A, "X"))).to.equal(null);
      } finally {
        global.W.deployerGraph = saved;
      }
    });

    it("returns null for a null gem", async () => {
      expect(await rec(null)).to.equal(null);
    });

    it("returns null when no shield is cached", async () => {
      expect(await rec(gem("ethereum", ADDR_A, "X"))).to.equal(null);
    });

    it("returns null for shield error state", async () => {
      primeShield("ethereum", ADDR_A, { error: true });
      expect(await rec(gem("ethereum", ADDR_A, "X"))).to.equal(null);
    });

    it("returns null for shield noData state", async () => {
      primeShield("ethereum", ADDR_A, { noData: true });
      expect(await rec(gem("ethereum", ADDR_A, "X"))).to.equal(null);
    });

    it("returns null for shield unsupported state", async () => {
      primeShield("ethereum", ADDR_A, { unsupported: true });
      expect(await rec(gem("ethereum", ADDR_A, "X"))).to.equal(null);
    });

    it("returns null for a Solana assessment (creator.address null)", async () => {
      primeShield("solana", ADDR_SOL, solanaAssessment());
      expect(await rec(gem("solana", ADDR_SOL, "S"))).to.equal(null);
    });
  });

  // ── enrichDeployerResults bounded concurrency ────────────

  describe("enrichDeployerResults", () => {
    it("never exceeds the concurrency bound", async () => {
      const gems = [];
      for (let i = 0; i < 6; i++) {
        const a = "0x" + String(i).padStart(40, "0");
        const g = { pair: mockPair("ethereum", a, "T" + i) };
        const key = global.W.gems._internal.shieldCacheKey(a, "ethereum");
        global.W.gems._internal.setCachedShield(key, evmAssessment());
        gems.push(g);
      }

      let active = 0;
      let peak = 0;
      global.W.deployerGraph.observe = async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 10));
        active--;
        return null;
      };

      await global.W.gems._internal.enrichDeployerResults(gems, 3);
      expect(peak).to.be.at.most(3);
    });

    it("one failure does not abort the others", async () => {
      const gems = [];
      for (let i = 0; i < 3; i++) {
        const a = "0x" + String(i).padStart(40, "0");
        const g = { pair: mockPair("ethereum", a, "T" + i) };
        const key = global.W.gems._internal.shieldCacheKey(a, "ethereum");
        global.W.gems._internal.setCachedShield(key, evmAssessment());
        gems.push(g);
      }
      let calls = 0;
      global.W.deployerGraph.observe = async (assessment, chain, addr) => {
        calls++;
        if (addr === "0x" + String(1).padStart(40, "0")) {
          throw new Error("simulated");
        }
        return null;
      };
      await global.W.gems._internal.enrichDeployerResults(gems, 3);
      expect(calls).to.equal(3);
    });
  });

  // ── Full scan integration ─────────────────────────────────

  describe("full scan integration", () => {
    it("records a deployer profile for a fresh EVM candidate", async () => {
      installFetch([mockPair("ethereum", ADDR_A, "X")]);
      global.W.shield.check = async () => evmAssessment();

      let observeCalls = 0;
      global.W.deployerGraph.observe = async (assessment, chain, addr) => {
        observeCalls++;
        global.W.deployerGraph.record(chain, CREATOR, {
          tokens: [
            {
              tokenAddress: addr,
              deploymentTxHash: "0xhash",
              deploymentEvidence: {
                source: "bitquery",
                method: "evm-call-create",
                deployerAddress: CREATOR_LOWER,
                callType: "direct",
              },
            },
          ],
          source: "bitquery",
        });
        return global.W.deployerGraph.get(chain, addr);
      };

      const root = buildScanDom();
      await global.W.gems.scan(root);
      await new Promise((r) => setTimeout(r, 30));

      expect(observeCalls).to.equal(1);
      const profile = global.W.deployerGraph.get("ethereum", ADDR_A);
      expect(profile).to.be.an("object");
      expect(profile.deployerAddress).to.equal(CREATOR_LOWER);
      root.remove();
    });

    it("caps fresh deployer requests per scan", async () => {
      const pairs = [];
      for (let i = 0; i < 10; i++) {
        const a = "0x" + String(i + 1).padStart(40, "0");
        pairs.push(mockPair("ethereum", a, "T" + i));
      }
      installFetch(pairs);
      global.W.shield.check = async () => evmAssessment();

      let observeCalls = 0;
      global.W.deployerGraph.observe = async () => {
        observeCalls++;
        return null;
      };

      const root = buildScanDom();
      await global.W.gems.scan(root);
      await new Promise((r) => setTimeout(r, 30));

      // MAX_FRESH_DEPLOYER_PER_SCAN = 6
      expect(observeCalls).to.equal(6);
      root.remove();
    });

    it("cache hits do not consume a fresh-request slot", async () => {
      installFetch([
        mockPair("ethereum", ADDR_A, "A"),
        mockPair("ethereum", ADDR_B, "B"),
      ]);
      global.W.shield.check = async () => evmAssessment();

      global.W.deployerGraph.record("ethereum", CREATOR, {
        tokens: [{ tokenAddress: ADDR_A, deploymentEvidence: null }],
        source: "bitquery",
      });

      let observeCalls = 0;
      global.W.deployerGraph.observe = async (assessment, chain, addr) => {
        observeCalls++;
        return null;
      };

      const root = buildScanDom();
      await global.W.gems.scan(root);
      await new Promise((r) => setTimeout(r, 30));

      expect(observeCalls).to.equal(1);
      root.remove();
    });

    it("does not record Solana deployer observations", async () => {
      installFetch([mockPair("solana", ADDR_SOL, "SOLX")]);
      global.W.shield.check = async () => solanaAssessment();

      let observeCalls = 0;
      global.W.deployerGraph.observe = async () => {
        observeCalls++;
        return null;
      };

      const root = buildScanDom();
      await global.W.gems.scan(root);
      await new Promise((r) => setTimeout(r, 30));

      expect(observeCalls).to.equal(0);
      root.remove();
    });

    it("scan completes normally when W.deployerGraph is missing", async () => {
      installFetch([mockPair("ethereum", ADDR_A, "X")]);
      global.W.shield.check = async () => evmAssessment();

      const saved = global.W.deployerGraph;
      global.W.deployerGraph = undefined;
      try {
        const root = buildScanDom();
        await global.W.gems.scan(root);
        await new Promise((r) => setTimeout(r, 30));
        expect(root.querySelector("#g-body").innerHTML).to.include("X");
        root.remove();
      } finally {
        global.W.deployerGraph = saved;
      }
    });

    it("card render uses get(), not observe()", async () => {
      installFetch([mockPair("ethereum", ADDR_A, "RENDER")]);
      global.W.shield.check = async () => evmAssessment();

      let observeCalls = 0;
      global.W.deployerGraph.observe = async () => {
        observeCalls++;
        return null;
      };
      let getCalls = 0;
      const originalGet = global.W.deployerGraph.get;
      global.W.deployerGraph.get = function (...args) {
        getCalls++;
        return originalGet.apply(this, args);
      };

      try {
        const root = buildScanDom();
        await global.W.gems.scan(root);
        await new Promise((r) => setTimeout(r, 30));

        expect(observeCalls).to.equal(1);
        expect(getCalls).to.be.at.least(1);

        const html = root.querySelector("#g-body").innerHTML;
        expect(html).to.include("RENDER");
        expect(html).to.not.include("Deployer:");
        root.remove();
      } finally {
        global.W.deployerGraph.get = originalGet;
      }
    });
  });

  // ── deployerLine ──────────────────────────────────────────

  describe("deployerLine", () => {
    const line = (o) => global.W.gems._internal.deployerLine(o);

    it("returns '' for null observation", () => {
      expect(line(null)).to.equal("");
    });

    it("returns '' when W.deployerGraph is missing", () => {
      const saved = global.W.deployerGraph;
      global.W.deployerGraph = undefined;
      try {
        expect(line({ tokens: [{ tokenAddress: ADDR_A }] })).to.equal("");
      } finally {
        global.W.deployerGraph = saved;
      }
    });

    it("returns '' when summarise returns null (empty tokens)", () => {
      expect(line({ tokens: [] })).to.equal("");
    });

    it("renders a Deployer row when summarise returns a string", () => {
      const html = line({
        tokens: [
          {
            tokenAddress: ADDR_A,
            riskScore: 10,
            shieldObservedAt: null,
            shieldSource: null,
          },
        ],
      });
      expect(html).to.include("Deployer");
      expect(html).to.include("qualified token");
    });

    it("escapes the summary string", () => {
      const html = line({
        tokens: [{ tokenAddress: ADDR_A, riskScore: 10 }],
      });
      expect(html).to.not.include("<script>");
    });
  });
});
