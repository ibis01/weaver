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
    setSecureSettings: async function (data, password) {
      this.set("encrypted_settings", "mock_encrypted_blob");
    },
    getSecureSettings: async function (password) {
      return { ai: { key: "mock_key" }, telegram: { token: "mock_token" } };
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
  crypto: {
    secure: {
      encrypt: async (plaintext, password) => `encrypted_${plaintext}`,
      decrypt: async (ciphertext, password) =>
        password === "myPassword123"
          ? ciphertext.replace("encrypted_", "")
          : null,
    },
  },
  portfolio: {
    _holdings: [],
    add: function (holding) {
      if (
        !holding ||
        !holding.symbol ||
        holding.qty <= 0 ||
        holding.buyPrice < 0
      )
        return false;
      const existing = this._holdings.find((h) => h.symbol === holding.symbol);
      if (existing) {
        const totalQty = existing.qty + holding.qty;
        existing.buyPrice =
          (existing.qty * existing.buyPrice + holding.qty * holding.buyPrice) /
          totalQty;
        existing.qty = totalQty;
      } else {
        this._holdings.push({ ...holding });
      }
      return true;
    },
    all: function () {
      return this._holdings;
    },
    clear: function () {
      this._holdings = [];
    },
  },
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
require("../js/utils/logger.js");  
require("../js/intelligence/decision-engine.js");
require("../js/intelligence/calibration.js"); 

console.log("✅ Test environment initialized with JSDOM and W namespace.");
