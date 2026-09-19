const { expect } = require("chai");

require("../../js/features/track-record.js");

describe("Track Record — Public Gem Calls", () => {
  beforeEach(() => {
    W.store.set(W.trackRecord.STORAGE_KEY, []);
  });

  it("createFromGemAlert tags the record origin as gem-agent", () => {
    const record = W.trackRecord.createFromGemAlert({
      symbol: "FLOKI2",
      chainId: "solana",
      contractAddress: "SoMeAddr111",
      priceAtCapture: 0.001,
      scenario: "Bullish scenario",
      confidence: 82,
      reasons: ["Healthy liquidity", "Strong momentum"],
      methodologyVersion: "gems-v1",
    });
    expect(record.origin).to.equal("gem-agent");
    expect(record.assetId.contractAddress).to.equal("SoMeAddr111");
    expect(record.assetId.chainId).to.equal("solana");
    expect(record.weaverSnapshot.priceAtCapture).to.equal(0.001);
    expect(record.weaverSnapshot.explanation).to.include("Strong momentum");
  });

  it("returns null for missing required fields instead of creating a broken record", () => {
    const record = W.trackRecord.createFromGemAlert({ symbol: "X" });
    expect(record).to.equal(null);
  });

  it("does not create a duplicate record for the same contract+chain", () => {
    const first = W.trackRecord.createFromGemAlert({
      symbol: "FLOKI2",
      chainId: "solana",
      contractAddress: "SoMeAddr111",
      priceAtCapture: 0.001,
      confidence: 82,
    });
    const second = W.trackRecord.createFromGemAlert({
      symbol: "FLOKI2",
      chainId: "solana",
      contractAddress: "SoMeAddr111", // same token, e.g. re-scanned later
      priceAtCapture: 0.002, // price moved, should NOT create a new entry
      confidence: 91,
    });
    expect(second.id).to.equal(first.id);
    expect(W.trackRecord.all().length).to.equal(1);
  });

  it("a manual (non-gem) record is unaffected by gem dedup logic", () => {
    W.trackRecord.createFromAnalysis(
      { asset: "BTC", scenario: "Bullish scenario", confidence: 70 },
      { symbol: "BTC" },
    );
    const gem = W.trackRecord.createFromGemAlert({
      symbol: "BTC", // same symbol, unrelated record — should not collide
      chainId: "ethereum",
      contractAddress: "0xABC",
      priceAtCapture: 100,
      confidence: 80,
    });
    expect(W.trackRecord.all().length).to.equal(2);
    expect(gem.origin).to.equal("gem-agent");
  });

  describe("evaluateGemOutcomes", () => {
    let originalFetch;
    beforeEach(() => {
      originalFetch = global.fetch;
    });
    afterEach(() => {
      global.fetch = originalFetch;
    });

    it("marks a record REPORTED_GAIN when price rose beyond the flat threshold", async () => {
      W.trackRecord.createFromGemAlert({
        symbol: "FLOKI2",
        chainId: "solana",
        contractAddress: "SoMeAddr111",
        priceAtCapture: 1.0,
        confidence: 82,
      });
      global.fetch = async () => ({
        ok: true,
        json: async () => ({
          pairs: [
            {
              chainId: "solana",
              baseToken: { address: "SoMeAddr111" },
              priceUsd: "1.5", // +50%
            },
          ],
        }),
      });

      const result = await W.trackRecord.evaluateGemOutcomes();
      expect(result.updated).to.equal(1);
      const record = W.trackRecord.all()[0];
      expect(record.outcome.status).to.equal("REPORTED_GAIN");
      expect(record.outcome.realizedResultPct).to.be.closeTo(50, 0.1);
    });

    it("marks a record REPORTED_LOSS when price fell beyond the flat threshold", async () => {
      W.trackRecord.createFromGemAlert({
        symbol: "RUGZILLA",
        chainId: "solana",
        contractAddress: "SoMeAddr222",
        priceAtCapture: 1.0,
        confidence: 75,
      });
      global.fetch = async () => ({
        ok: true,
        json: async () => ({
          pairs: [
            {
              chainId: "solana",
              baseToken: { address: "SoMeAddr222" },
              priceUsd: "0.5", // -50%
            },
          ],
        }),
      });

      await W.trackRecord.evaluateGemOutcomes();
      const record = W.trackRecord.all()[0];
      expect(record.outcome.status).to.equal("REPORTED_LOSS");
      expect(record.outcome.realizedResultPct).to.be.closeTo(-50, 0.1);
    });

    it("marks a record REPORTED_FLAT within the small-move threshold", async () => {
      W.trackRecord.createFromGemAlert({
        symbol: "STABLEISH",
        chainId: "solana",
        contractAddress: "SoMeAddr333",
        priceAtCapture: 1.0,
        confidence: 60,
      });
      global.fetch = async () => ({
        ok: true,
        json: async () => ({
          pairs: [
            {
              chainId: "solana",
              baseToken: { address: "SoMeAddr333" },
              priceUsd: "1.005", // +0.5%, within flat threshold
            },
          ],
        }),
      });

      await W.trackRecord.evaluateGemOutcomes();
      expect(W.trackRecord.all()[0].outcome.status).to.equal("REPORTED_FLAT");
    });

    it("does not fabricate an outcome when the upstream fetch fails", async () => {
      W.trackRecord.createFromGemAlert({
        symbol: "FLOKI2",
        chainId: "solana",
        contractAddress: "SoMeAddr111",
        priceAtCapture: 1.0,
        confidence: 82,
      });
      global.fetch = async () => {
        throw new Error("network down");
      };

      const result = await W.trackRecord.evaluateGemOutcomes();
      expect(result.updated).to.equal(0);
      expect(W.trackRecord.all()[0].outcome.status).to.equal("UNKNOWN");
    });

    it("does not re-evaluate an already-resolved record", async () => {
      const record = W.trackRecord.createFromGemAlert({
        symbol: "FLOKI2",
        chainId: "solana",
        contractAddress: "SoMeAddr111",
        priceAtCapture: 1.0,
        confidence: 82,
      });
      W.trackRecord.updateOutcome(record.id, {
        status: "REPORTED_GAIN",
        outcomeSource: "MARKET_OBSERVATION",
      });

      let fetchCalled = false;
      global.fetch = async () => {
        fetchCalled = true;
        return { ok: true, json: async () => ({ pairs: [] }) };
      };

      const result = await W.trackRecord.evaluateGemOutcomes();
      expect(result.checked).to.equal(0);
      expect(fetchCalled).to.equal(false);
    });
  });
});
