const { expect } = require("chai");

// This test exists because test/unit/gems.test.js's chain-parity check
// only verified that the CHAINS config object was a correct subset —
// it never verified that scan() actually filters results by it. A
// bug where CHAINS was declared correctly but never consulted at
// runtime (i.e. exactly the bug this test would have caught) shipped
// and passed the old test suite. This test calls the real render()
// entrypoint with mixed-chain mock data and asserts on the rendered
// output, not on a config object's shape.

describe("Gem Agent chain filter (behavioral)", () => {
  let originalFetch;
  let originalUi;
  let originalTg;
  let originalTheses;
  let originalFmtPct;

  const SUPPORTED_ADDR = "0xSUPPORTED1";
  const UNSUPPORTED_ADDR = "0xUNSUPPORTED1";

  function mockPair(chainId, address, symbol) {
    return {
      chainId,
      baseToken: { address, symbol },
      liquidity: { usd: 50000 },
      volume: { h24: 100000 },
      priceChange: { h1: 5, h6: 5, h24: 10 },
      pairCreatedAt: Date.now() - 20 * 3600 * 1000,
    };
  }

  before(() => {
    originalFetch = global.fetch;
    originalUi = global.W.ui;
    originalTg = global.W.tg;
    originalTheses = global.W.theses;
    originalFmtPct = global.W.fmt.pct;

    // Minimal local mocks — scoped to this file, restored in after().
    global.W.ui = {
      spinner: () => "<div>loading</div>",
      empty: (msg) => `<div>${msg}</div>`,
      toast: () => {},
    };
    global.W.tg = undefined; // exercise the "if (W.tg)" guarded path
    global.W.theses = undefined; // exercise the "if (!W.theses) return" guard
    // setup.js's W.fmt mock doesn't include pct(), which gems.js's card
    // rendering uses for 1h/6h/24h change — add it without touching the
    // shared setup file.
    global.W.fmt.pct = (n) =>
      n === undefined || n === null
        ? "—"
        : (n >= 0 ? "+" : "") + n.toFixed(1) + "%";

    const mockPairs = [
      mockPair("ethereum", SUPPORTED_ADDR, "GOODCHAIN"), // in gems.js CHAINS
      mockPair("tron", UNSUPPORTED_ADDR, "BADCHAIN"), // not in gems.js CHAINS
    ];

    global.fetch = async (url) => {
      const u = String(url);
      if (u.includes("token-boosts")) {
        return {
          ok: true,
          json: async () => [
            { tokenAddress: SUPPORTED_ADDR, totalBoosts: 5 },
            { tokenAddress: UNSUPPORTED_ADDR, totalBoosts: 5 },
          ],
        };
      }
      if (u.includes("token-profiles")) {
        return { ok: true, json: async () => [] };
      }
      if (u.includes("/latest/dex/tokens/")) {
        return { ok: true, json: async () => mockPairs };
      }
      throw new Error("Unexpected fetch in test: " + u);
    };
  });

  after(() => {
    global.fetch = originalFetch;
    global.W.ui = originalUi;
    global.W.tg = originalTg;
    global.W.theses = originalTheses;
    global.W.fmt.pct = originalFmtPct;
  });

  it("excludes tokens on chains not in Gem Agent's CHAINS allowlist from scan results", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);

    await global.W.gems.render(root);
    // scan() runs async work after render() returns; give it a tick.
    await new Promise((resolve) => setTimeout(resolve, 20));

    const html = root.querySelector("#g-body").innerHTML;

    expect(html, "supported-chain token should appear in results").to.include(
      "GOODCHAIN",
    );
    expect(
      html,
      "unsupported-chain token must NOT appear in results, even though DexScreener returned it",
    ).to.not.include("BADCHAIN");

    root.remove();
  });
});
