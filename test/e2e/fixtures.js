// test/e2e/fixtures.js
//
// Hermetic E2E fixture. Installs a page-level route interceptor that
// serves deterministic canned payloads for the market-data vendors the
// app reads (CoinLore, CoinPaprika, Coinbase, Alternative.me, Binance)
// and for the Weaver worker's /proxy walk, and aborts every other
// non-localhost request. CI must never depend on live vendor health:
// a provider outage is a vendor problem, not a Weaver regression, and
// it must not fail main (observed 2026-11-08 on the premium-dark
// merge).
//
// Design notes:
//   - Interception happens at the network edge only. The app runs its
//     REAL fetch path (fetchWithProxy walk, cache, schema validation,
//     normalization) — only the wire is faked. The dispatcher returns
//     the same payload whether the app reached the vendor through the
//     worker proxy or direct, because fetchWithProxy falls back
//     between the two paths and the mock must be path-independent.
//   - Unknown hosts are aborted, never continued. An e2e run must not
//     leak traffic to the live internet; that is the whole point of
//     hermetic CI.
//   - Per-test overrides still work: Playwright matches routes LIFO,
//     so a test that registers its own page.route(...) after the
//     fixture wins (dashboard-acceptance.spec.js relies on this for
//     its offline-resilience cases).
//   - Escape hatch: set WEAVER_E2E_LIVE=1 to skip mock installation
//     for an explicit live-upstream smoke run. Never use in CI.
//   - Payloads are intentionally small, valid, and vendor-shaped.
//     They are not fixtures for correctness assertions (unit tests
//     own those); they exist so the app renders its healthy or
//     gracefully-degraded states deterministically.

const { test: base, expect } = require("@playwright/test");

const WORKER_HOST_SUFFIX = ".workers.dev";

// ── Canned payloads (vendor-shaped) ────────────────────
const TICKERS = {
  data: [
    {
      id: "90",
      symbol: "BTC",
      name: "Bitcoin",
      nameid: "bitcoin",
      rank: 1,
      price_usd: "65000.12",
      percent_change_24h: 1.2,
      percent_change_7d: 3.4,
      market_cap_usd: "1280000000000",
      volume24: 28000000000,
      volume24_native: 430000,
      csupply: "19700000",
      tsupply: "21000000",
      msupply: "21000000",
    },
    {
      id: "80",
      symbol: "ETH",
      name: "Ethereum",
      nameid: "ethereum",
      rank: 2,
      price_usd: "3200.55",
      percent_change_24h: -0.8,
      percent_change_7d: 1.1,
      market_cap_usd: "385000000000",
      volume24: 14000000000,
      volume24_native: 4375000,
      csupply: "120400000",
      tsupply: "120400000",
      msupply: "0",
    },
    {
      id: "48543",
      symbol: "SOL",
      name: "Solana",
      nameid: "solana",
      rank: 5,
      price_usd: "145.20",
      percent_change_24h: 2.9,
      percent_change_7d: -1.7,
      market_cap_usd: "66000000000",
      volume24: 3100000000,
      volume24_native: 21340000,
      csupply: "454000000",
      tsupply: "454000000",
      msupply: "0",
    },
    {
      id: "257",
      symbol: "UNI",
      name: "Uniswap",
      nameid: "uniswap",
      rank: 22,
      price_usd: "7.85",
      percent_change_24h: 0.4,
      percent_change_7d: 2.2,
      market_cap_usd: "4700000000",
      volume24: 190000000,
      volume24_native: 24200000,
      csupply: "600000000",
      tsupply: "1000000000",
      msupply: "1000000000",
    },
  ],
};

const GLOBAL = [
  {
    coins_count: 13000,
    active_markets: 920,
    total_mcap: 1700000000000,
    total_volume: 80000000000,
    btc_d: 52.4,
    mcap_change: 1.2,
    volume_change: -0.4,
    dominance_change: 0.1,
  },
];

function paprikaTicker(id, symbol, name, price, pct24, pct7, pct30, mcap) {
  return {
    id,
    symbol,
    name,
    rank: 1,
    circulating_supply: 19700000,
    total_supply: 21000000,
    max_supply: 21000000,
    quotes: {
      USD: {
        price,
        volume_24h: 28000000000,
        volume_24h_reported: 29000000000,
        volume_7d: 190000000000,
        volume_30d: 810000000000,
        percent_change_1h: 0.1,
        percent_change_6h: 0.3,
        percent_change_12h: 0.6,
        percent_change_24h: pct24,
        percent_change_7d: pct7,
        percent_change_30d: pct30,
        market_cap: mcap,
      },
    },
  };
}

const PAPRIKA_TICKERS = [
  paprikaTicker(
    "btc-bitcoin",
    "BTC",
    "Bitcoin",
    65000.12,
    1.2,
    3.4,
    5.6,
    1280000000000,
  ),
  paprikaTicker(
    "eth-ethereum",
    "ETH",
    "Ethereum",
    3200.55,
    -0.8,
    1.1,
    2.4,
    385000000000,
  ),
  paprikaTicker("sol-solana", "SOL", "Solana", 145.2, 2.9, -1.7, 4.1, 66000000000),
  paprikaTicker(
    "uni-uniswap",
    "UNI",
    "Uniswap",
    7.85,
    0.4,
    2.2,
    -0.9,
    4700000000,
  ),
];

const PAPRIKA_GLOBAL = {
  quotes: {
    USD: {
      total_market_cap: 1700000000000,
      total_volume_24h: 80000000000,
      bitcoin_dominance_percentage: 52.4,
      market_cap_change_percentage_24h_usd: 1.2,
    },
  },
};

const PAPRIKA_SEARCH = {
  currencies: [
    { id: "btc-bitcoin", symbol: "BTC", name: "Bitcoin", rank: 1 },
    { id: "eth-ethereum", symbol: "ETH", name: "Ethereum", rank: 2 },
  ],
};

const FNG = {
  name: "Fear and Greed Index",
  data: [
    {
      value: "50",
      value_classification: "Neutral",
      timestamp: "1700000000",
      time_until_update: "600",
    },
  ],
};

// One canonical Binance kline row:
// [openTime, open, high, low, close, volume, closeTime, quoteVolume,
//  trades, takerBase, takerQuote, ignore]
const KLINES = [
  [
    1700000000000,
    "64000",
    "65500",
    "63000",
    "65000.12",
    "100.5",
    1700003599999,
    "6445000",
    300,
    50,
    "3200000",
    "0",
  ],
];

const SPOT = {
  BTC: "65000.12",
  ETH: "3200.55",
  SOL: "145.20",
  UNI: "7.85",
  WBTC: "64800.00",
  WETH: "3190.00",
  STETH: "3201.10",
  RETH: "3450.00",
  CBBTC: "64950.00",
};

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type",
};

function jsonResponse(body, status = 200) {
  return {
    status,
    contentType: "application/json",
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  };
}

// ── Vendor dispatcher ─────────────────────────────────
// Classifies the ORIGINAL vendor URL (direct or the decoded inner URL
// of a worker /proxy request) and returns a Playwright fulfill plan,
// or null when the vendor is not mocked.
function vendorPlan(vendorUrl) {
  let u;
  try {
    u = new URL(vendorUrl);
  } catch {
    return null;
  }
  const h = u.hostname;
  const p = u.pathname;

  if (h === "api.coinlore.net") {
    if (p.startsWith("/api/tickers/")) return jsonResponse(TICKERS);
    if (p.startsWith("/api/global/")) return jsonResponse(GLOBAL);
    return jsonResponse({ error: "coinlore: not mocked" }, 404);
  }

  if (h === "api.coinpaprika.com") {
    if (p === "/v1/tickers") return jsonResponse(PAPRIKA_TICKERS);
    if (/^\/v1\/tickers\/.+/.test(p)) return jsonResponse(PAPRIKA_TICKERS[0]);
    if (/^\/v1\/coins\/.+/.test(p)) {
      return jsonResponse({
        id: "btc-bitcoin",
        symbol: "BTC",
        name: "Bitcoin",
        description: "Hermetic E2E stub.",
        links: { website: ["https://bitcoin.org"] },
      });
    }
    if (p === "/v1/global" || p === "/v1/global/") {
      return jsonResponse(PAPRIKA_GLOBAL);
    }
    if (p === "/v1/search") return jsonResponse(PAPRIKA_SEARCH);
    return jsonResponse({ error: "paprika: not mocked" }, 404);
  }

  if (h === "api.coinbase.com") {
    const m = /^\/v2\/prices\/([^/]+)\/spot$/.exec(p);
    if (m) {
      const pair = decodeURIComponent(m[1]);
      const baseCcy = pair.split("-")[0] || "BTC";
      return jsonResponse({
        data: {
          base: baseCcy,
          currency: "USD",
          amount: SPOT[baseCcy] || "100.00",
        },
      });
    }
    return jsonResponse({ error: "coinbase: not mocked" }, 404);
  }

  if (h === "api.exchange.coinbase.com") {
    // Candles/products: empty array is a valid, boring answer.
    return jsonResponse([]);
  }

  if (h === "api.alternative.me") {
    if (p.startsWith("/fng/")) return jsonResponse(FNG);
    return jsonResponse({ error: "fng: not mocked" }, 404);
  }

  if (h === "api.binance.com") {
    if (p === "/api/v3/klines") return jsonResponse(KLINES);
    return jsonResponse({ error: "binance: not mocked" }, 404);
  }

  return null;
}

function isWorkerHost(hostname) {
  return (
    hostname === "weaver-proxy.ibis01-weaver.workers.dev" ||
    hostname.endsWith(WORKER_HOST_SUFFIX)
  );
}

// Single wildcard handler. Registered first, so per-test routes
// (LIFO) override it when a spec wants finer control.
async function hermeticRoute(route) {
  const req = route.request();
  let u;
  try {
    u = new URL(req.url());
  } catch {
    return route.abort();
  }

  const method = req.method().toUpperCase();

  // Local app assets: pass straight through to the http-server.
  if (u.hostname === "localhost" || u.hostname === "127.0.0.1") {
    return route.continue();
  }

  // CORS preflights never leave the sandbox.
  if (method === "OPTIONS") {
    return route.fulfill({ status: 204, headers: CORS_HEADERS });
  }

  // Worker proxy walk: classify the DECODED inner vendor URL so the
  // answer is identical to the direct path.
  if (isWorkerHost(u.hostname)) {
    if (u.pathname === "/proxy") {
      const inner = u.searchParams.get("url") || "";
      const plan = vendorPlan(inner);
      if (plan) return route.fulfill(plan);
      // An unmocked vendor behind the proxy is a deterministic 502,
      // which exercises the app's real refusal-fallthrough path.
      return route.fulfill(
        jsonResponse({ error: "hermetic-e2e: vendor not mocked" }, 502),
      );
    }
    // Worker-native endpoints (meme alerts, signals, news, deployer,
    // health, ...): deterministic 502 keeps every consumer inside its
    // documented error path without touching the live worker.
    return route.fulfill(
      jsonResponse({ error: "hermetic-e2e: worker not mocked" }, 502),
    );
  }

  // Direct vendor hit (DIRECT_ONLY domains skip the worker first).
  const plan = vendorPlan(u.href);
  if (plan) return route.fulfill(plan);

  // Anything else — including Telegram, Sentry, unknown CDNs — never
  // leaves the sandbox.
  return route.abort();
}

async function installHermeticMocks(page) {
  await page.route("**/*", hermeticRoute);
}

const test = base.test.extend({
  // Auto-fixture: every test that uses { page } gets hermetic mocks
  // unless WEAVER_E2E_LIVE=1 opts out.
  page: async ({ page }, use) => {
    if (!process.env.WEAVER_E2E_LIVE) {
      await installHermeticMocks(page);
    }
    await use(page);
  },
});

module.exports = { test, expect, installHermeticMocks };
