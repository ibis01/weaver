#!/usr/bin/env node
const path = require("path");
const { createClient } = require("redis");
const { createSmartMoneyStore } = require("../server/smart-money-store");
const { createProvenanceStore } = require("../server/provenance-store");
const { installShim } = require("../server/smart-money-shim");

const WORKER_BASE = process.env.WEAVER_WORKER_BASE || "https://weaver-proxy.ibis01-weaver.workers.dev";
const CYCLE_MS = Number(process.env.SMART_MONEY_CYCLE_MS || 60000);
const WATCHLIST_SEED = require("../data/eth-watchlist.json");

const SEED_BY_ID = Object.create(null);
for (const t of WATCHLIST_SEED) SEED_BY_ID[t.id] = t;

function installIpv4Fetch() {
  const dns = require("dns");
  const http = require("http");
  const https = require("https");
  const { URL } = require("url");
  const lookup4 = (hostname, opts, cb) => {
    if (typeof opts === "function") { cb = opts; opts = {}; }
    return dns.lookup(hostname, { ...opts, family: 4 }, cb);
  };
  function fetchViaLib(protocol, urlObj, init) {
    return new Promise((resolve, reject) => {
      const lib = protocol === "http:" ? http : https;
      const req = lib.request({
        protocol, hostname: urlObj.hostname, port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        method: init.method || "GET", headers: init.headers || {},
        lookup: lookup4, signal: init.signal,
      }, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const body = Buffer.concat(chunks);
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            headers: { get: (k) => res.headers[String(k).toLowerCase()] || null },
            async json() { return JSON.parse(body.toString("utf8")); },
            async text() { return body.toString("utf8"); },
          });
        });
      });
      req.on("error", reject);
      if (init.body) req.write(init.body);
      req.end();
    });
  }
  const original = global.fetch;
  global.fetch = function (input, init = {}) {
    let url;
    try { url = new URL(typeof input === "string" ? input : input.url); }
    catch { return original(input, init); }
    if (url.protocol !== "http:" && url.protocol !== "https:") return original(input, init);
    return fetchViaLib(url.protocol, url, init);
  };
  console.log("[sm.worker] IPv4-only fetch installed");
}

function classifyResult(result) {
  if (!result || typeof result !== "object") {
    return { status: "ERROR", reason: "invalid-result" };
  }
  if (result.ok === true && result.signal && result.signal.type === "SMART_MONEY_ENTRY") {
    return { status: "SIGNAL", reason: "smart-money-entry" };
  }
  if (result.ok === true) {
    // Analysis completed, but smartEntryEngine refused to emit.
    const convReason = (result.convergence && result.convergence.reason) || "no-signal";
    return { status: "REFUSED_ANALYSIS", reason: convReason };
  }
  // Pipeline refused before analysis completed.
  return { status: "REFUSED_PIPELINE", reason: result.reason || "unknown" };
}

async function postProvenance(entry) {
  try {
    const r = await fetch(`${WORKER_BASE}/provenance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(entry),
    });
    if (!r.ok) {
      console.warn("[sm.worker] POST /provenance failed:", r.status);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[sm.worker] POST /provenance error:", e.message);
    return false;
  }
}

async function postSignal(signal) {
  try {
    const r = await fetch(`${WORKER_BASE}/signal`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ signal }),
    });
    if (!r.ok) { console.warn("[sm.worker] POST /signal failed:", r.status); return false; }
    return true;
  } catch (e) { console.warn("[sm.worker] POST /signal error:", e.message); return false; }
}

async function ensureWatchlist() {
  const current = global.W.store.get("sm.radar-watchlist.v1", null);
  if (Array.isArray(current) && current.length > 0) return current;
  const seeded = WATCHLIST_SEED.map((t) => ({
    id: t.id, symbol: t.symbol, name: t.name,
    tokenAddress: t.tokenAddress.toLowerCase(), addedAt: Date.now(),
  }));
  global.W.store.set("sm.radar-watchlist.v1", seeded);
  return seeded;
}

function rebuildApiWithSeedCoin() {
  const api = global.W.api;
  if (!api) { console.warn("[sm.worker] W.api missing"); return; }
  const original = api.coin;
  const wrappedCoin = async function (id) {
    const seed = SEED_BY_ID[id];
    if (seed && seed.tokenAddress) {
      return {
        id, symbol: seed.symbol, name: seed.name,
        platforms: { ethereum: seed.tokenAddress.toLowerCase() },
        market_data: { current_price: { usd: null }, market_cap: { usd: null } },
      };
    }
    if (typeof original === "function") return original(id);
    throw new Error("no seeded coin and no original coin fn for " + id);
  };
  const rebuilt = Object.create(Object.getPrototypeOf(api) || Object.prototype);
  for (const key of Object.getOwnPropertyNames(api)) {
    if (key === "coin") continue;
    const desc = Object.getOwnPropertyDescriptor(api, key);
    if (desc) try { Object.defineProperty(rebuilt, key, desc); } catch {}
  }
  Object.defineProperty(rebuilt, "coin", { value: wrappedCoin, writable: true, configurable: true, enumerable: true });
  global.W.api = rebuilt;
  console.log("[sm.worker] W.api rebuilt — coin resolves from seed");
}

async function runCycle({ provenance, index }) {
  const watchlist = await ensureWatchlist();
  if (!watchlist.length) return { skipped: "empty-watchlist" };
  const token = watchlist[index % watchlist.length];
  console.log(`[sm.worker] cycling on ${token.symbol} (${token.tokenAddress})`);

  if (!global.W.smartRadar || typeof global.W.smartRadar._internal?.runPipeline !== "function") {
    return { skipped: "runPipeline-unavailable" };
  }

  let result;
  const ranAt = Date.now();
  try {
    result = await global.W.smartRadar._internal.runPipeline(token);
  } catch (e) {
    console.warn("[sm.worker] pipeline threw:", e.message);
    result = { ok: false, reason: "pipeline-error", message: e.message };
  }

  console.log("[sm.worker] pipeline result:", JSON.stringify(result).slice(0, 400));

  await provenance.record({
    symbol: token.symbol,
    tokenAddress: token.tokenAddress,
    ranAt,
    result,
  });

  // Dual-write to the CF Worker KV so the frontend can read it.
  const { status, reason } = classifyResult(result);
  await postProvenance({
    symbol: token.symbol,
    tokenAddress: token.tokenAddress,
    ranAt, status, reason, result,
  }).catch(() => {});

  if (result && result.ok === true && result.signal && result.signal.type === "SMART_MONEY_ENTRY") {
    const ok = await postSignal(result.signal);
    if (ok) console.log("[sm.worker] SMART_MONEY_ENTRY published:", result.signal.id);
  }
  return result;
}

async function main() {
  installIpv4Fetch();

  const redis = createClient({ url: process.env.REDIS_URL });
  redis.on("error", (e) => console.error("[redis] error:", e.message));
  await redis.connect();
  console.log("[sm.worker] Redis client connected");

  const store = createSmartMoneyStore({ client: redis });
  installShim(store);
  await store.hydrate();
  store.startFlush();

  const provenance = createProvenanceStore({ client: redis });

  require(path.join(__dirname, "..", "dist", "bundle.js"));

  if (!global.W.smartRadar || typeof global.W.smartRadar._internal?.runPipeline !== "function") {
    console.error("[sm.worker] fatal: W.smartRadar._internal.runPipeline missing");
    process.exit(1);
  }

  rebuildApiWithSeedCoin();

  const seeded = WATCHLIST_SEED.map((t) => ({
    id: t.id, symbol: t.symbol, name: t.name,
    tokenAddress: t.tokenAddress.toLowerCase(), addedAt: Date.now(),
  }));
  const persisted = await store.setSync("sm.radar-watchlist.v1", seeded);
  console.log(persisted ? "[sm.worker] watchlist persisted" : "[sm.worker] watchlist persist FAILED");

  let i = 0;
  const tick = async () => {
    try { await runCycle({ provenance, index: i }); i += 1; }
    catch (e) { console.error("[sm.worker] cycle error:", e.message); }
  };

  console.log(`[sm.worker] starting, cycle=${CYCLE_MS}ms`);
  await tick();
  setInterval(tick, CYCLE_MS);

  process.on("SIGTERM", async () => {
    console.log("[sm.worker] shutting down...");
    await store.stop();
    if (redis.isOpen) await redis.quit();
    process.exit(0);
  });
}

main().catch((e) => { console.error("[sm.worker] fatal:", e); process.exit(1); });
