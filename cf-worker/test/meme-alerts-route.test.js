import { describe, it, expect } from "vitest";
import { handleRequest } from "../index.js";

function makeEnv(alerts = []) {
  const store = new Map(alerts);
  return {
    MEME_ALERTS: {
      list: async ({ prefix = "", limit = 1000 } = {}) => {
        const keys = [...store.keys()]
          .filter((k) => k.startsWith(prefix))
          .sort()
          .slice(0, limit);
        return {
          keys: keys.map((name) => ({ name })),
          list_complete: true,
          cursor: undefined,
        };
      },
      get: async (k) => store.get(k) || null,
    },
  };
}

function req(path, method = "GET") {
  return new Request("https://example.com" + path, {
    method,
    headers: { Origin: "https://ibis01.github.io" },
  });
}

describe("GET /meme/alerts", () => {
  it("rejects non-GET", async () => {
    const r = await handleRequest(req("/meme/alerts", "POST"), makeEnv(), {});
    expect(r.status).toBe(405);
  });

  it("returns 503 when binding is missing", async () => {
    const r = await handleRequest(req("/meme/alerts"), {}, {});
    expect(r.status).toBe(503);
  });

  it("returns alerts within the requested window", async () => {
    const env = makeEnv([
      [
        "weaver:meme:alert:v2:1000:ethereum:0xa",
        JSON.stringify({ market: { priceUsd: 1 } }),
      ],
      [
        "weaver:meme:alert:v2:2000:ethereum:0xb",
        JSON.stringify({ market: { priceUsd: 2 } }),
      ],
      [
        "weaver:meme:alert:v2:3000:ethereum:0xc",
        JSON.stringify({ market: { priceUsd: 3 } }),
      ],
    ]);
    const r = await handleRequest(
      req("/meme/alerts?since=1500&until=2500"),
      env,
      {},
    );
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.alerts.length).toBe(1);
    expect(body.alerts[0].market.priceUsd).toBe(2);
    expect(body.scanned).toBe(3);
  });

  it("skips keys with malformed timestamps", async () => {
    const env = makeEnv([
      [
        "weaver:meme:alert:v2:notanumber:ethereum:0xa",
        JSON.stringify({ market: { priceUsd: 1 } }),
      ],
      [
        "weaver:meme:alert:v2:1000:ethereum:0xb",
        JSON.stringify({ market: { priceUsd: 2 } }),
      ],
    ]);
    const r = await handleRequest(req("/meme/alerts"), env, {});
    const body = await r.json();
    expect(body.alerts.length).toBe(1);
    expect(body.alerts[0].market.priceUsd).toBe(2);
  });
});
