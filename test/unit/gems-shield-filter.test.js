
// P0 — Gem Agent high-risk filter correctness.
//
// NOTE: These tests bypass W.gems.render() and construct the scan
// controls directly, then call W.gems.scan(). render() rebuilds the
// entire toolbar DOM on every call, which would wipe any pre-set
// checkbox/select state. The real render() entry point is exercised
// end-to-end in gems-chain-filter.test.js.

const { expect } = require("chai");

describe("Gem Agent — Shield filter correctness (P0)", () => {
  const ADDR_A = "0x1111111111111111111111111111111111111111";
  const ADDR_B = "0x2222222222222222222222222222222222222222";
  const ADDR_C = "0x3333333333333333333333333333333333333333";
  const ADDR_HIGH = "0x4444444444444444444444444444444444444444";
  const ADDR_MIXED = "0xAbCdEf0000000000000000000000000000000001";

  let originalFetch;
  let originalShield;
  let originalShieldCheck;
  let originalUi;
  let originalTg;
  let originalTheses;
  let originalFmtPct;

  function mockPair(chainId, address, symbol, opts = {}) {
    return {
      chainId,
      baseToken: { address, symbol, name: symbol + " token" },
      liquidity: { usd: opts.liq ?? 200000 },
      volume: { h24: opts.vol ?? 500000 },
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

  // Builds a scan-ready DOM. Includes every control scan() reads:
  //   #g-min, #g-chain, #g-hide-risk, #g-stats, #g-body.
  function buildScanDom({ minScore = 0, chain = "", hideRisk = false } = {}) {
    const root = document.createElement("div");
    root.innerHTML = `
      <select id="g-min">
        <option value="0">0</option>
        <option value="40">40</option>
        <option value="60">60</option>
        <option value="70">70</option>
      </select>
      <select id="g-chain">
        <option value="">All</option>
        <option value="ethereum">ethereum</option>
        <option value="base">base</option>
        <option value="bsc">bsc</option>
        <option value="arbitrum">arbitrum</option>
        <option value="polygon">polygon</option>
        <option value="avalanche">avalanche</option>
        <option value="solana">solana</option>
      </select>
      <input type="checkbox" id="g-hide-risk">
      <div id="g-stats"></div>
      <div id="g-body"></div>
    `;
    root.querySelector("#g-min").value = String(minScore);
    root.querySelector("#g-chain").value = chain;
    root.querySelector("#g-hide-risk").checked = !!hideRisk;
    document.body.appendChild(root);
    return root;
  }

  async function scanAndSettle(root) {
    await global.W.gems.scan(root);
    await new Promise((r) => setTimeout(r, 30));
  }

  before(() => {
    originalFetch = global.fetch;
    originalUi = global.W.ui;
    originalTg = global.W.tg;
    originalTheses = global.W.theses;
    originalFmtPct = global.W.fmt.pct;
    originalShield = global.W.shield;

    global.W.ui = {
      spinner: () => "<div>loading</div>",
      empty: (_i, m) => `<div>${m}</div>`,
      toast: () => {},
    };
    global.W.tg = undefined;
    global.W.theses = undefined;
    global.W.fmt.pct = (n) =>
      n === undefined || n === null
        ? "—"
        : (n >= 0 ? "+" : "") + n.toFixed(1) + "%";

    originalShieldCheck = global.W.shield.check;
  });

  after(() => {
    global.fetch = originalFetch;
    global.W.ui = originalUi;
    global.W.tg = originalTg;
    global.W.theses = originalTheses;
    global.W.fmt.pct = originalFmtPct;
    if (originalShield) global.W.shield.check = originalShieldCheck;
  });

  beforeEach(() => {
    global.W.gems._internal.resetShieldCache();
    global.W.gems._internal.resetSeen();
  });

  // ── Test 1 ────────────────────────────────────────────
  it("Test 1 — fresh high-risk result is hidden when hideRisk=true", async () => {
    installFetch([mockPair("ethereum", ADDR_A, "RISKY")]);
    global.W.shield.check = async () => ({
      riskScore: 70,
      riskLevel: ["🔴 High identified risk indicators", "high-risk"],
      scoreVersion: "shield-evm-v1",
    });

    const root = buildScanDom({ hideRisk: true });
    await scanAndSettle(root);

    expect(root.querySelector("#g-body").innerHTML).to.not.include("RISKY");
    root.remove();
  });

  // ── Test 2 ────────────────────────────────────────────
  it("Test 2 — fresh low-risk result is visible when hideRisk=true", async () => {
    installFetch([mockPair("ethereum", ADDR_A, "SAFEISH")]);
    global.W.shield.check = async () => ({
      riskScore: 20,
      riskLevel: ["🟢 No identified risk indicators", "no-identified-risk"],
      scoreVersion: "shield-evm-v1",
    });

    const root = buildScanDom({ hideRisk: true });
    await scanAndSettle(root);

    expect(root.querySelector("#g-body").innerHTML).to.include("SAFEISH");
    root.remove();
  });

  // ── Test 3 ────────────────────────────────────────────
  it("Test 3 — no Shield result: candidate remains visible and not labelled safe", async () => {
    installFetch([mockPair("ethereum", ADDR_A, "UNCHECKED")]);
    global.W.shield.check = async () => null; // resolves to noData

    const root = buildScanDom({ hideRisk: true });
    await scanAndSettle(root);

    const html = root.querySelector("#g-body").innerHTML;
    expect(html).to.include("UNCHECKED");
    expect(html.toLowerCase()).to.not.include("verified safe");
    expect(html.toLowerCase()).to.not.include("no risk");
    root.remove();
  });

  // ── Test 4 ────────────────────────────────────────────
  it("Test 4 — cached high-risk result is hidden without duplicate Shield request", async () => {
    let calls = 0;
    global.W.shield.check = async () => {
      calls++;
      return { riskScore: 70 };
    };

    // Prime the cache via the TTL-aware helper so the entry shape
    // matches what checkShield() writes.
    const key = global.W.gems._internal.shieldCacheKey(ADDR_A, "ethereum");
    global.W.gems._internal.setCachedShield(key, {
      riskScore: 70,
      riskLevel: ["🔴 High identified risk indicators", "high-risk"],
      scoreVersion: "shield-evm-v1",
    });

    installFetch([mockPair("ethereum", ADDR_A, "CACHED_RISKY")]);
    const root = buildScanDom({ hideRisk: true });
    await scanAndSettle(root);

    expect(root.querySelector("#g-body").innerHTML).to.not.include(
      "CACHED_RISKY",
    );
    expect(calls, "cached result should prevent a fresh Shield call").to.equal(
      0,
    );
    root.remove();
  });

  // ── Test 5 ────────────────────────────────────────────
  it("Test 5 — hideRisk=false shows high-risk candidates", async () => {
    installFetch([mockPair("ethereum", ADDR_A, "RISKY")]);
    global.W.shield.check = async () => ({
      riskScore: 70,
      riskLevel: ["🔴 High identified risk indicators", "high-risk"],
      scoreVersion: "shield-evm-v1",
    });

    const root = buildScanDom({ hideRisk: false });
    await scanAndSettle(root);

    expect(root.querySelector("#g-body").innerHTML).to.include("RISKY");
    root.remove();
  });

  // ── Test 6 ────────────────────────────────────────────
  it("Test 6 — chain + hideRisk compose without bypassing each other", async () => {
    installFetch([
      mockPair("ethereum", ADDR_A, "ETH_SAFE"),
      mockPair("base", ADDR_B, "BASE_RISKY"),
    ]);
    global.W.shield.check = async (addr) =>
      addr === ADDR_B ? { riskScore: 80 } : { riskScore: 10 };

    const root = buildScanDom({ chain: "ethereum", hideRisk: true });
    await scanAndSettle(root);

    const html = root.querySelector("#g-body").innerHTML;
    expect(html).to.include("ETH_SAFE");
    expect(html).to.not.include("BASE_RISKY");
    root.remove();
  });

  // ── Test 7 ────────────────────────────────────────────
  it("Test 7 — malformed cached riskScore never causes a hide (NaN regression)", () => {
    const { isHighRisk } = global.W.gems._internal;
    expect(isHighRisk({ riskScore: undefined })).to.equal(false);
    expect(isHighRisk({ riskScore: null })).to.equal(false);
    expect(isHighRisk({ riskScore: "not-a-number" })).to.equal(false);
    expect(isHighRisk({ riskScore: NaN })).to.equal(false);
    expect(isHighRisk({})).to.equal(false);
    expect(isHighRisk(null)).to.equal(false);
    expect(isHighRisk({ error: true })).to.equal(false);
    expect(isHighRisk({ noData: true })).to.equal(false);
    expect(isHighRisk({ unsupported: true })).to.equal(false);
    expect(isHighRisk({ riskScore: 39 })).to.equal(false);
    expect(isHighRisk({ riskScore: 40 })).to.equal(true);
    expect(isHighRisk({ riskScore: 70 })).to.equal(true);
  });

  // ── Test 8 ────────────────────────────────────────────
  it("Test 8 — invalid address is not hidden, not labelled safe", async () => {
    installFetch([mockPair("ethereum", "invalid-address", "BAD")]);
    global.W.shield.check = async () => {
      throw new Error("Invalid ethereum address");
    };

    const root = buildScanDom({ hideRisk: true });
    await scanAndSettle(root);

    const html = root.querySelector("#g-body").innerHTML;
    // Shield failure → error state → visible.
    expect(html).to.include("BAD");
    expect(html.toLowerCase()).to.not.include("verified safe");
    root.remove();
  });

  // ── Test 9 ────────────────────────────────────────────
  it("Test 9 — EVM cache key normalizes case", () => {
    const { shieldCacheKey } = global.W.gems._internal;
    expect(shieldCacheKey(ADDR_MIXED, "ethereum")).to.equal(
      shieldCacheKey(ADDR_MIXED.toLowerCase(), "ethereum"),
    );
  });

  // ── Test 10 ───────────────────────────────────────────
  it("Test 10 — bounded concurrency and per-scan cap", async () => {
    const pairs = [];
    for (let i = 0; i < 20; i++) {
      const a = "0x" + String(i).padStart(40, "0");
      pairs.push(mockPair("ethereum", a, "T" + i));
    }
    installFetch(pairs);

    let active = 0;
    let peak = 0;
    let total = 0;
    global.W.shield.check = async () => {
      active++;
      total++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
      return {
        riskScore: 10,
        riskLevel: ["🟢 No identified risk indicators", "no-identified-risk"],
        scoreVersion: "shield-evm-v1",
      };
    };

    const root = buildScanDom({ hideRisk: true });
    await global.W.gems.scan(root);
    await new Promise((r) => setTimeout(r, 300));

    expect(peak, "concurrent Shield requests must not exceed 4").to.be.at.most(
      4,
    );
    expect(total, "fresh Shield requests must not exceed 12").to.be.at.most(12);
    root.remove();
  });

  // ── Test 11 ───────────────────────────────────────────
  it("Test 11 — warm-cache toggle does not trigger fresh Shield requests", async () => {
    installFetch([mockPair("ethereum", ADDR_A, "WARM")]);
    let calls = 0;
    global.W.shield.check = async () => {
      calls++;
      return {
        riskScore: 70,
        riskLevel: ["🔴 High identified risk indicators", "high-risk"],
        scoreVersion: "shield-evm-v1",
      };
    };

    const root = buildScanDom({ hideRisk: false });
    await scanAndSettle(root);
    expect(calls).to.equal(1);

    // Toggle on the SAME root — checkbox state persists across scans.
    root.querySelector("#g-hide-risk").checked = true;
    await scanAndSettle(root);
    expect(calls, "warm cache must prevent refetch").to.equal(1);

    root.remove();
  });

  // ── Test 12 ───────────────────────────────────────────
  it("Test 12 — one Shield failure does not abort the scan", async () => {
    installFetch([
      mockPair("ethereum", ADDR_A, "THROWS"),
      mockPair("ethereum", ADDR_HIGH, "HIGH"),
      mockPair("ethereum", ADDR_C, "LOW"),
    ]);
    global.W.shield.check = async (addr) => {
      if (addr === ADDR_A) throw new Error("timeout");
      if (addr === ADDR_HIGH)
        return {
          riskScore: 80,
          riskLevel: ["🔴 High identified risk indicators", "high-risk"],
          scoreVersion: "shield-evm-v1",
        };
      return {
        riskScore: 10,
        riskLevel: ["🟢 No identified risk indicators", "no-identified-risk"],
        scoreVersion: "shield-evm-v1",
      };
    };

    const root = buildScanDom({ hideRisk: true });
    await scanAndSettle(root);

    const html = root.querySelector("#g-body").innerHTML;
    expect(html).to.include("THROWS"); // failed → visible
    expect(html).to.include("LOW"); // low risk → visible
    expect(html).to.not.include("HIGH"); // high risk → hidden
    root.remove();
  });

  // ── Test 13 ───────────────────────────────────────────
  it("Test 13 — seen candidate with cached high-risk is not notified again", async () => {
    installFetch([mockPair("ethereum", ADDR_A, "SEEN")]);

    let notifyCount = 0;
    let thesesCount = 0;
    global.W.tg = {
      notify: () => {
        notifyCount++;
      },
    };
    global.W.theses = {
      findBySourceRef: () => false,
      create: () => {
        thesesCount++;
      },
    };
    global.W.shield.check = async () => ({
      riskScore: 80,
      riskLevel: ["🔴 High identified risk indicators", "high-risk"],
      scoreVersion: "shield-evm-v1",
    });

    // Prime cache via the TTL-aware helper.
    const key = global.W.gems._internal.shieldCacheKey(ADDR_A, "ethereum");
    global.W.gems._internal.setCachedShield(key, {
      riskScore: 80,
      riskLevel: ["🔴 High identified risk indicators", "high-risk"],
      scoreVersion: "shield-evm-v1",
    });

    let root = buildScanDom({ hideRisk: true });
    await scanAndSettle(root);
    const firstNotify = notifyCount;
    const firstTheses = thesesCount;
    expect(firstNotify, "first scan should notify once").to.equal(1);
    expect(firstTheses, "first scan should create one thesis").to.equal(1);
    root.remove();

    // Second scan — `seen` should suppress notification/thesis.
    root = buildScanDom({ hideRisk: true });
    await scanAndSettle(root);
    expect(notifyCount).to.equal(firstNotify);
    expect(thesesCount).to.equal(firstTheses);

    root.remove();
    global.W.tg = originalTg;
    global.W.theses = originalTheses;
  });

  // ── Amendment 7 regression ────────────────────────────
  it("Amendment 7 — cross-chain cache isolation (Ethereum vs Base)", () => {
    const { shieldCacheKey, getCachedShield, setCachedShield } =
      global.W.gems._internal;
    const ethKey = shieldCacheKey(ADDR_MIXED, "ethereum");
    const baseKey = shieldCacheKey(ADDR_MIXED, "base");
    expect(ethKey).to.not.equal(baseKey);

    // Write through the production helper so the entry shape matches
    // what checkShield() stores in real scans. A raw write here would
    // bypass the { assessment, observedAt } wrapper and pass trivially.
    setCachedShield(ethKey, { riskScore: 10 });
    setCachedShield(baseKey, { riskScore: 90 });

    // Read through the TTL-aware helper. If the two keys collided,
    // one of these would return the other chain's assessment.
    expect(getCachedShield(ethKey).riskScore).to.equal(10);
    expect(getCachedShield(baseKey).riskScore).to.equal(90);
  });
});
