#!/usr/bin/env node
const path = require("path");
const { createSmartMoneyStore } = require("../server/smart-money-store");
const { installShim } = require("../server/smart-money-shim");

const WORKER_BASE =
  process.env.WEAVER_WORKER_BASE ||
  "https://weaver-proxy.ibis01-weaver.workers.dev";
const CYCLE_MS = Number(process.env.SMART_MONEY_CYCLE_MS || 60000);
const WATCHLIST_SEED = require("../data/eth-watchlist.json");

// Node 22 fetch tries IPv6 first by default. The container has no
// IPv6 route, so every request hangs until the OS-level timeout.
// Install a global fetch wrapper that resolves via dns.lookup with
// family: 4 to force IPv4.
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
        protocol: protocol,
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        method: init.method || "GET",
        headers: init.headers || {},
        lookup: lookup4,
        signal: init.signal,
      }, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const body = Buffer.concat(chunks);
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            headers: {
              get: (k) => res.headers[String(k).toLowerCase()] || null,
            },
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
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return original(input, init);
    }
    return fetchViaLib(url.protocol, url, init);
  };
  console.log("[sm.worker] IPv4-only fetch installed");
}

const SEED_BY_ID = Object.create(null);
for (const t of WATCHLIST_SEED) {
  SEED_BY_ID[t.id] = t;
}

async function postSignal(signal) {
  try {
    const r = await fetch(`${WORKER_BASE}/signal`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signal }),
    });
    if (!r.ok) {
      console.warn("[sm.worker] POST /signal failed:", r.status);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[sm.worker] POST /signal error:", e.message);
    return false;
  }
}

async function ensureWatchlist() {
  const current = global.W.store.get("sm.radar-watchlist.v1", null);
  if (Array.isArray(current) && current.length > 0) {
    console.log(`[sm.worker] watchlist has ${current.length} entries`);
    return current;
  }
  const seeded = WATCHLIST_SEED.map((t) => ({
    id: t.id,
    symbol: t.symbol,
    name: t.name,
    tokenAddress: t.tokenAddress.toLowerCase(),
    addedAt: Date.now(),
  }));
  global.W.store.set("sm.radar-watchlist.v1", seeded);
  console.log(`[sm.worker] seeded watchlist with ${seeded.length} ETH tokens`);
  return seeded;
}

// The bundle freezes W.api via Object.freeze. Rebuild the object
// preserving all descriptors, then swap coin for a seed-only lookup.
function rebuildApiWithSeedCoin() {
  const api = global.W.api;
  if (!api) {
    console.warn("[sm.worker] W.api missing; cannot rebuild coin");
    return;
  }
  const original = api.coin;

  const wrappedCoin = async function (id) {
    const seed = SEED_BY_ID[id];
    if (seed && seed.tokenAddress) {
      return {
        id,
        symbol: seed.symbol,
        name: seed.name,
        platforms: { ethereum: seed.tokenAddress.toLowerCase() },
        market_data: {
          current_price: { usd: null },
          market_cap: { usd: null },
        },
      };
    }
    if (typeof original === "function") return original(id);
    throw new Error("no seeded coin and no original coin fn for " + id);
  };

  const rebuilt = Object.create(Object.getPrototypeOf(api) || Object.prototype);
  for (const key of Object.getOwnPropertyNames(api)) {
    // Skip coin — the original descriptor from Object.freeze is
    // non-configurable and cannot be redefined. We add our own next.
    if (key === "coin") continue;
    const desc = Object.getOwnPropertyDescriptor(api, key);
    if (desc) {
      try { Object.defineProperty(rebuilt, key, desc); } catch {}
    }
  }
  Object.defineProperty(rebuilt, "coin", {
    value: wrappedCoin,
    writable: true,
    configurable: true,
    enumerable: true,
  });
  global.W.api = rebuilt;
  console.log("[sm.worker] VERSION 3 — W.api rebuilt, coin resolves from seed");
}

async function runCycle(index) {
  const watchlist = await ensureWatchlist();
  if (!watchlist.length) return { skipped: "empty-watchlist" };
  const token = watchlist[index % watchlist.length];
  console.log(`[sm.worker] cycling on ${token.symbol} (${token.tokenAddress})`);

  if (!global.W.smartRadar || typeof global.W.smartRadar._internal?.runPipeline !== "function") {
    console.warn("[sm.worker] W.smartRadar._internal.runPipeline not available");
    return { skipped: "runPipeline-unavailable" };
  }

  let result;
  try {
    result = await global.W.smartRadar._internal.runPipeline(token);
  } catch (e) {
    console.warn("[sm.worker] pipeline threw:", e.message);
    return { skipped: "pipeline-error", error: e.message };
  }

  console.log("[sm.worker] pipeline result:", JSON.stringify(result).slice(0, 400));

  if (result && result.ok === true && result.signal && result.signal.type === "SMART_MONEY_ENTRY") {
    const ok = await postSignal(result.signal);
    if (ok) console.log("[sm.worker] SMART_MONEY_ENTRY published:", result.signal.id);
  }
  return result;
}

async function main() {
  installIpv4Fetch();
  const store = createSmartMoneyStore({ url: process.env.REDIS_URL });
  installShim(store);

  console.log(`[sm.worker] REDIS_URL=${process.env.REDIS_URL}`);
  try {
    await store.connect();
    console.log("[sm.worker] Redis connected.");
  } catch (e) {
    console.error("[sm.worker] Redis connect failed:", e.message);
    process.exit(1);
  }

  await store.hydrate();
  store.startFlush();

  require(path.join(__dirname, "..", "dist", "bundle.js"));

  if (!global.W.smartRadar || typeof global.W.smartRadar._internal?.runPipeline !== "function") {
    console.error("[sm.worker] fatal: W.smartRadar._internal.runPipeline missing");
    process.exit(1);
  }

  rebuildApiWithSeedCoin();

  // Force-persist the watchlist synchronously before the first cycle,
  // so a restart cannot lose it.
  const seeded = WATCHLIST_SEED.map((t) => ({
    id: t.id,
    symbol: t.symbol,
    name: t.name,
    tokenAddress: t.tokenAddress.toLowerCase(),
    addedAt: Date.now(),
  }));
  const persisted = await store.setSync("sm.radar-watchlist.v1", seeded);
  if (persisted) {
    console.log("[sm.worker] watchlist persisted to Redis.");
  } else {
    console.error("[sm.worker] watchlist persist FAILED — continuing in-memory");
  }

  let i = 0;
  const tick = async () => {
    try { await runCycle(i); i += 1; }
    catch (e) { console.error("[sm.worker] cycle error:", e.message); }
  };

  console.log(`[sm.worker] starting, cycle=${CYCLE_MS}ms`);
  await tick();
  setInterval(tick, CYCLE_MS);

  process.on("SIGTERM", async () => {
    console.log("[sm.worker] shutting down...");
    await store.stop();
    process.exit(0);
  });
}

main().catch((e) => { console.error("[sm.worker] fatal:", e); process.exit(1); });
