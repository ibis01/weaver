// cf-worker/test/proxy-cache.test.js
//
// Gate 0 cache behavior tests. Roadmap acceptance: "Tests confirm TTL,
// coalescing, expiration, and safe failure behavior."
//
// Coalescing is not implemented; the last test documents that absence.

import { env, fetchMock } from "cloudflare:test";
import { afterEach, beforeAll, describe, it, expect } from "vitest";
import { handleRequest } from "../index.js";

const ALLOWED_ORIGIN = "https://ibis01.github.io";
const UPSTREAM = "https://api.dexscreener.com";
const CACHE_ALIVE_SECONDS = 600; // must exceed the stale ceiling, or the
                                 // cache evicts before the handler can read

function makeCtx() {
  const promises = [];
  return {
    waitUntil: (p) => promises.push(Promise.resolve(p)),
    passThroughOnException: () => {},
    _drain: () => Promise.all(promises),
  };
}

function proxyReq(target, method = "GET") {
  const u = new URL("https://worker.example/proxy");
  u.searchParams.set("url", target);
  return new Request(u.toString(), {
    method,
    headers: { Origin: ALLOWED_ORIGIN },
  });
}

function cacheKeyFor(target) {
  return new Request(target, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
}

async function primeCache(target, body, ageSeconds) {
  const resp = new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      // Miniflare's Cache API refuses to store a response without
      // cacheability directives. Set a TTL >= the handler's stale
      // ceiling so the entry survives long enough to be read.
      "Cache-Control": `public, max-age=${CACHE_ALIVE_SECONDS}`,
      "X-Weaver-Cached-At": String(Date.now() - ageSeconds * 1000),
    },
  });
  await caches.default.put(cacheKeyFor(target), resp);
}

beforeAll(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});

afterEach(() => {
  fetchMock.assertNoPendingInterceptors();
});

describe("relayAllowedProxy cache behavior", () => {
  it("MISS on cold cache, then HIT on subsequent request within TTL", async () => {
    const target = UPSTREAM + "/latest/dex/tokens/0xcold";
    const body = JSON.stringify({ token: "cold" });

    fetchMock
      .get(UPSTREAM)
      .intercept({ path: "/latest/dex/tokens/0xcold", method: "GET" })
      .reply(200, body, { headers: { "content-type": "application/json" } })
      .times(1);

    const ctx = makeCtx();
    const r1 = await handleRequest(proxyReq(target), env, ctx);
    await ctx._drain();

    expect(r1.status).toBe(200);
    expect(r1.headers.get("X-Weaver-Cache")).toBe("MISS");
    expect(await r1.text()).toBe(body);

    const r2 = await handleRequest(proxyReq(target), env, makeCtx());
    expect(r2.status).toBe(200);
    expect(r2.headers.get("X-Weaver-Cache")).toBe("HIT");
    expect(await r2.text()).toBe(body);
  });

  it("HIT when cached entry is fresh (< 60s), no upstream call", async () => {
    const target = UPSTREAM + "/latest/dex/tokens/0xfresh";
    const body = JSON.stringify({ token: "fresh" });
    await primeCache(target, body, 30);

    // No interceptor registered: any upstream fetch would fail hard.
    const r = await handleRequest(proxyReq(target), env, makeCtx());
    expect(r.status).toBe(200);
    expect(r.headers.get("X-Weaver-Cache")).toBe("HIT");
    expect(await r.text()).toBe(body);
  });

  it("REVALIDATED when cached entry is stale (60s to 600s) and upstream OK", async () => {
    const target = UPSTREAM + "/latest/dex/tokens/0xreval";
    await primeCache(target, JSON.stringify({ token: "old" }), 120);
    const fresh = JSON.stringify({ token: "new" });

    fetchMock
      .get(UPSTREAM)
      .intercept({ path: "/latest/dex/tokens/0xreval", method: "GET" })
      .reply(200, fresh, { headers: { "content-type": "application/json" } })
      .times(1);

    const ctx = makeCtx();
    const r = await handleRequest(proxyReq(target), env, ctx);
    await ctx._drain();

    expect(r.status).toBe(200);
    expect(r.headers.get("X-Weaver-Cache")).toBe("REVALIDATED");
    expect(await r.text()).toBe(fresh);
  });

  it("STALE when cached entry is stale and upstream fails (within ceiling)", async () => {
    const target = UPSTREAM + "/latest/dex/tokens/0xstale";
    const body = JSON.stringify({ token: "stale" });
    await primeCache(target, body, 300);

    fetchMock
      .get(UPSTREAM)
      .intercept({ path: "/latest/dex/tokens/0xstale", method: "GET" })
      .reply(500, "upstream exploded")
      .times(1);

    const r = await handleRequest(proxyReq(target), env, makeCtx());
    expect(r.status).toBe(200);
    expect(r.headers.get("X-Weaver-Cache")).toBe("STALE");
    const age = Number(r.headers.get("X-Weaver-Stale-Age"));
    expect(age).toBeGreaterThanOrEqual(299);
    expect(age).toBeLessThanOrEqual(302);
    expect(await r.text()).toBe(body);
  });

  it("propagates upstream error when cache is beyond stale ceiling (> 600s)", async () => {
    const target = UPSTREAM + "/latest/dex/tokens/0xexpired";
    await primeCache(target, JSON.stringify({ token: "expired" }), 700);

    fetchMock
      .get(UPSTREAM)
      .intercept({ path: "/latest/dex/tokens/0xexpired", method: "GET" })
      .reply(503, "upstream down")
      .times(1);

    const r = await handleRequest(proxyReq(target), env, makeCtx());
    expect(r.status).toBe(503);
    expect(r.headers.get("X-Weaver-Cache")).toBe("NONE");
  });

  it("POST requests bypass the cache (no HIT header)", async () => {
    const target = UPSTREAM + "/latest/dex/tokens/0xpost";
    const body = JSON.stringify({ token: "post" });

    fetchMock
      .get(UPSTREAM)
      .intercept({ path: "/latest/dex/tokens/0xpost", method: "POST" })
      .reply(200, body, { headers: { "content-type": "application/json" } })
      .times(1);

    const r = await handleRequest(proxyReq(target, "POST"), env, makeCtx());
    expect(r.status).toBe(200);
    expect(r.headers.get("X-Weaver-Cache")).not.toBe("HIT");
  });

  it("does NOT coalesce concurrent identical GETs (documents current absence)", async () => {
    const target = UPSTREAM + "/latest/dex/tokens/0xconc";
    const body = JSON.stringify({ token: "conc" });

    fetchMock
      .get(UPSTREAM)
      .intercept({ path: "/latest/dex/tokens/0xconc", method: "GET" })
      .reply(200, body, { headers: { "content-type": "application/json" } })
      .times(2);

    const ctxA = makeCtx();
    const ctxB = makeCtx();
    const [a, b] = await Promise.all([
      handleRequest(proxyReq(target), env, ctxA),
      handleRequest(proxyReq(target), env, ctxB),
    ]);
    await Promise.all([ctxA._drain(), ctxB._drain()]);

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
  });
});
