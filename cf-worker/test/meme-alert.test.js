import { describe, it, expect } from "vitest";
import { handleMemeAlert } from "../src/meme-alert.js";

function makeEnv() {
  const store = new Map();
  return {
    MEME_ALERTS: {
      put: async (k, v) => {
        store.set(k, v);
      },
      get: async (k) => store.get(k) || null,
    },
    _store: store,
  };
}

function req(body, method = "POST") {
  return new Request("https://example.com/meme/alert", {
    method,
    headers: { "content-type": "application/json" },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
}

describe("POST /meme/alert", () => {
  it("rejects non-POST", async () => {
    const r = await handleMemeAlert(req(null, "GET"), makeEnv());
    expect(r.status).toBe(405);
  });

  it("rejects missing identity", async () => {
    const r = await handleMemeAlert(req({ assessment: {} }), makeEnv());
    expect(r.status).toBe(400);
  });

  it("rejects missing priceUsd", async () => {
    const r = await handleMemeAlert(
      req({
        assessment: {
          identity: { chain: "ethereum", tokenAddress: "0xabc" },
          observedAtMs: Date.now(),
        },
        market: {},
      }),
      makeEnv(),
    );
    expect(r.status).toBe(400);
  });

  it("stores a well-formed alert", async () => {
    const env = makeEnv();
    const body = {
      assessment: {
        identity: { chain: "ethereum", tokenAddress: "0xabc" },
        observedAtMs: 1700000000000,
        confidence: 0.72,
        scores: { opportunity: 65, survivability: null, executionRisk: 20 },
        category: "WATCH_FOR_CONFIRMATION",
      },
      market: {
        priceUsd: 1.23,
        liquidityUsd: 100000,
        observedAt: "2026-01-01T00:00:00.000Z",
      },
      pairAddress: "0xpair",
      symbol: "TKN",
    };
    const r = await handleMemeAlert(req(body), env);
    expect(r.status).toBe(200);
    const stored = await env.MEME_ALERTS.get(
      "weaver:meme:alert:v1:ethereum:0xabc:1700000000000",
    );
    expect(typeof stored).toBe("string");
    const parsed = JSON.parse(stored);
    expect(parsed.schemaVersion).toBe("meme-alert-v1");
    expect(parsed.assessment.category).toBe("WATCH_FOR_CONFIRMATION");
    expect(parsed.market.priceUsd).toBe(1.23);
  });

  it("returns 502 when KV.put fails", async () => {
    const env = {
      MEME_ALERTS: {
        put: async () => {
          throw new Error("quota exceeded");
        },
      },
    };
    const body = {
      assessment: {
        identity: { chain: "ethereum", tokenAddress: "0xabc" },
        observedAtMs: Date.now(),
      },
      market: { priceUsd: 1 },
    };
    const r = await handleMemeAlert(req(body), env);
    expect(r.status).toBe(502);
  });
});
