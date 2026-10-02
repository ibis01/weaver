// test/setup.js
const { JSDOM } = require("jsdom");
const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
  resources: "usable",
});

global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.crypto = dom.window.crypto;
global.localStorage = dom.window.localStorage;
global.HTMLElement = dom.window.HTMLElement;
global.location = global.window.location;

// Initialize Weaver namespace with mocks for modules that the unit
// tests deliberately isolate. Do NOT mock modules that the tests
// exercise as real code — those are required at the bottom of this
// file so they attach to the same global.W the tests read.
global.W = {
  store: {
    _data: {},
    get: function (key, fallback) {
      return this._data[key] !== undefined ? this._data[key] : fallback;
    },
    set: function (key, value) {
      this._data[key] = value;
    },
    delete: function (key) {
      delete this._data[key];
    },
    clearAll: function () {
      this._data = {};
    },
  },
  fmt: {
    escapeHTML: (str) =>
      str
        ? String(str).replace(
            /[&<>'"]/g,
            (tag) =>
              ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                "'": "&#39;",
                '"': "&quot;",
              })[tag] || tag,
          )
        : "",
    maskAddress: (addr) =>
      addr && addr.length > 10
        ? `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`
        : addr,
  },
  intelligence: {
    computeConfidence: () => 0.8,
    computeFreshness: () => 1.0,
    getSourceReliability: () => 0.9,
  },
  evidence: {
    build: (signal, metadata) => ({
      signalId: signal.id,
      strength: 0.8,
      supportingFacts: ["Mocked supporting fact"],
      conflictingFacts: [],
      sourceReliability: 0.9,
      dataFreshnessScore: 1.0,
      confidence: 0.8,
    }),
  },
  thesisHealth: {
    evaluate: (thesis, marketData, evidence) => {
      if (marketData.price < thesis.entryPrice * 0.6)
        return {
          healthScore: 20,
          status: "Invalidated",
          reasons: ["Price dropped >40%"],
        };
      if (
        marketData.price > thesis.entryPrice &&
        marketData.regime === "RISK-ON"
      )
        return {
          healthScore: 90,
          status: "Strengthening",
          reasons: ["Price and regime align"],
        };
      return { healthScore: 80, status: "Healthy", reasons: [] };
    },
  },
  // Placeholders for modules loaded at the bottom of this file. If a
  // require throws (e.g. JSDOM missing an API), the parity test fails
  // cleanly rather than throwing on undefined.
  gems: {},
  shield: { CHAINS: {} },
  sentry: {
    init: async () => false,
    beforeSend: (e) => e,
    isInitialized: () => false,
  },
  sentryBuffer: [],
  // NOTE: decisionEngine is intentionally NOT mocked. Integration
  // tests load the real module via require() below. If a future
  // unit test needs an isolated decision engine, mock it locally
  // inside that test file, not globally here.
};

// ── Load real modules that the tests exercise directly ─────────
// These are required AFTER the mock block so they attach to the
// same global.W the tests read. `window.W` is bridged to `global.W`
// because JSDOM's window is a different object in Node.
global.W.api = {
  search: async () => ({ coins: [] }),
  markets: async () => [],
};

global.window.W = global.W;

require("../js/models/asset.js");
require("../js/utils/format.js");
require("../js/lib/crypto/secure.js");
require("../js/lib/crypto/secure-session.js");
require("../js/utils/logger.js");
require("../js/intelligence/decision-engine.js");
require("../js/intelligence/calibration.js");

// Load the real gems and shield modules so the chain-parity test
// exercises the actual chain lists. If either throws, the parity
// test will fail on empty CHAINS rather than crash on undefined.
try {
  require("../js/features/shield.js");
} catch (e) {
  console.warn("[setup] shield.js load failed:", e.message);
}
try {
  require("../js/features/gems.js");
} catch (e) {
  console.warn("[setup] gems.js load failed:", e.message);
}
try {
  require("../js/features/track-record.js");
require("../js/features/portfolio.js");
} catch (e) {
  console.warn("[setup] track-record.js load failed:", e.message);
}

console.log("✅ Test environment initialized with JSDOM and W namespace.");
