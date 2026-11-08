// test/unit/smart-radar-auto-telegram.test.js
//
// Telegram wiring for the auto-scan radar. A persisted radar alert
// (ok === true, SMART_MONEY_ENTRY) is also eligible for an opt-in
// Telegram notification, mirroring the gems.js precedent. notify()
// itself owns the enabled gate, rate limiting, and per-key dedup;
// this suite verifies the eligibility gate, the per-token dedup key
// shape, HTML-escaped message content, and that the runCycle wiring
// actually invokes the notification path.

const { expect } = require("chai");

const autoPath = require.resolve("../../js/features/smart-radar-auto.js");

const ADDR = "0xabc0000000000000000000000000000000000001";

function loadAuto() {
  delete require.cache[autoPath];
  require(autoPath);
  return global.W.smartRadar.auto;
}

function goodResult(overrides = {}) {
  return Object.assign(
    {
      ok: true,
      tokenAddress: ADDR,
      currentPrice: 0.00015,
      coin: { symbol: "PEPE" },
      signal: { type: "SMART_MONEY_ENTRY", timestamp: 1700000000000 },
      convergence: {
        convergence: true,
        independentWalletCount: 3,
        reason: "independent entries",
      },
      momentum: { momentumState: "BUILDING" },
    },
    overrides,
  );
}

describe("SmartRadar.auto — Telegram wiring", () => {
  let originalTg;
  let originalFetch;
  let originalPipeline;
  let calls;

  before(() => {
    originalTg = global.W.tg;
    originalFetch = global.fetch;
    originalPipeline = global.W.smartRadar;
  });

  after(() => {
    global.W.tg = originalTg;
    global.fetch = originalFetch;
    global.W.smartRadar = originalPipeline;
  });

  beforeEach(() => {
    calls = [];
    global.W.tg = {
      notify: (key, text) => {
        calls.push({ key, text });
      },
    };
    // safeGet/safeSet read and write through W.store (the setup.js
    // in-memory mock), not localStorage directly. Reset it so each
    // test starts from a clean watchlist/signals/state slate.
    global.W.store._data = {};
    loadAuto();
  });

  it("notifies for an ok SMART_MONEY_ENTRY result with a per-token key", () => {
    const auto = global.W.smartRadar.auto;
    auto._internal.notifyRadarTelegram(goodResult());
    expect(calls).to.have.lengthOf(1);
    expect(calls[0].key).to.equal("radar:" + ADDR);
    expect(calls[0].text).to.include("Smart Radar");
    expect(calls[0].text).to.include("PEPE");
    expect(calls[0].text).to.include("BUILDING");
    expect(calls[0].text).to.include("Convergence: 3 independent wallets");
  });

  it("HTML-escapes the symbol in the message body", () => {
    const auto = global.W.smartRadar.auto;
    auto._internal.notifyRadarTelegram(
      goodResult({ coin: { symbol: "PEPE<script>alert(1)</script>" } }),
    );
    expect(calls).to.have.lengthOf(1);
    expect(calls[0].text).to.not.include("<script>");
    expect(calls[0].text).to.include("&lt;script&gt;");
  });

  it("falls back to Unknown when the coin block is missing", () => {
    const auto = global.W.smartRadar.auto;
    auto._internal.notifyRadarTelegram(
      goodResult({ coin: undefined, convergence: null, momentum: null }),
    );
    expect(calls).to.have.lengthOf(1);
    expect(calls[0].text).to.include("Unknown");
    expect(calls[0].text).to.not.include("Convergence");
    expect(calls[0].text).to.not.include("Momentum");
  });

  it("omits the price line when the price is not usable", () => {
    const auto = global.W.smartRadar.auto;
    auto._internal.notifyRadarTelegram(
      goodResult({ currentPrice: Number.NaN, convergence: null, momentum: null }),
    );
    expect(calls).to.have.lengthOf(1);
    expect(calls[0].text).to.not.include("Price:");
  });

  it("skips when the result is not ok", () => {
    const auto = global.W.smartRadar.auto;
    auto._internal.notifyRadarTelegram(goodResult({ ok: false }));
    expect(calls).to.be.empty;
  });

  it("skips when the signal type is not SMART_MONEY_ENTRY", () => {
    const auto = global.W.smartRadar.auto;
    auto._internal.notifyRadarTelegram(
      goodResult({ signal: { type: "OTHER", timestamp: 1700000000000 } }),
    );
    expect(calls).to.be.empty;
  });

  it("skips when the token address is missing", () => {
    const auto = global.W.smartRadar.auto;
    auto._internal.notifyRadarTelegram(goodResult({ tokenAddress: "" }));
    expect(calls).to.be.empty;
  });

  it("skips when W.tg is absent (Telegram module not loaded)", () => {
    global.W.tg = undefined;
    const auto = global.W.smartRadar.auto;
    expect(() => auto._internal.notifyRadarTelegram(goodResult())).to.not.throw();
  });

  it("never throws on null or hostile inputs", () => {
    const auto = global.W.smartRadar.auto;
    expect(() => auto._internal.notifyRadarTelegram(null)).to.not.throw();
    expect(() => auto._internal.notifyRadarTelegram(undefined)).to.not.throw();
    expect(() => auto._internal.notifyRadarTelegram(42)).to.not.throw();
    expect(calls).to.be.empty;
  });

  it("runCycle wiring: an alert-worthy scan produces exactly one notification", async () => {
    const auto = global.W.smartRadar.auto;
    auto.toggle(true);

    global.W.store.set(
      auto._internal.WATCHLIST_KEY,
      [
        {
          id: "pepe",
          symbol: "PEPE",
          name: "Pepe",
          tokenAddress: ADDR,
          addedAt: Date.now(),
        },
      ],
    );

    global.W.smartRadar = {
      _internal: {
        runPipeline: async () => goodResult(),
        renderResult: () => {},
      },
    };

    global.fetch = async (url) => {
      const u = String(url);
      if (u.includes("/meme/alert")) {
        return { ok: true, json: async () => ({ ok: true, key: "test" }) };
      }
      throw new Error("Unexpected fetch: " + u);
    };

    const outcome = await auto.runCycle();
    expect(outcome.ran).to.equal(true);
    expect(calls).to.have.lengthOf(1);
    expect(calls[0].key).to.equal("radar:" + ADDR);
  });

  it("runCycle wiring: a failed scan never notifies", async () => {
    const auto = global.W.smartRadar.auto;
    auto.toggle(true);

    global.W.store.set(
      auto._internal.WATCHLIST_KEY,
      [
        {
          id: "pepe",
          symbol: "PEPE",
          name: "Pepe",
          tokenAddress: ADDR,
          addedAt: Date.now(),
        },
      ],
    );

    global.W.smartRadar = {
      _internal: {
        runPipeline: async () => ({ ok: false, reason: "upstream-down" }),
        renderResult: () => {},
      },
    };

    global.fetch = async () => {
      throw new Error("no network in test");
    };

    const outcome = await auto.runCycle();
    expect(outcome.ran).to.equal(true);
    expect(calls).to.be.empty;
  });
});
