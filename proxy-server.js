// ===============================================================
//         Weaver Secure Proxy Server
// ===============================================================
// Purpose: SSRF-hardened HTTP proxy for external crypto data APIs.
//
// State backend (rate limiting, circuit breaking): Redis in production;
// in-memory is available only during local development.
// ===============================================================

const express = require("express");
const axios = require("axios");
const cors = require("cors");
const dns = require("dns").promises;
const net = require("net");
const http = require("http");
const https = require("https");
const { createState } = require("./server/redis-state");
const { Telemetry } = require("./server/telemetry");
const { loadConfig } = require("./server/config");

const app = express();
const config = loadConfig();
const PORT = config.port;
const isProduction = config.production;
let allowedOrigins = config.origins;
if (!isProduction && !allowedOrigins.length)
  allowedOrigins = [
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "http://localhost:3000",
  ];

// Without this, req.ip is the direct socket peer — behind any reverse
// proxy/load balancer that's the proxy's own IP for every request, so
// per-client rate limiting (checkRateLimit below) silently collapses
// into one shared bucket for the whole app. Config enforces this is
// set in production (see server/config.js); 0 in dev means "no proxy
// in front, trust nothing," matching Express's own default.
app.set("trust proxy", config.trustProxyHops ?? 0);

const ALLOWED_DOMAINS = [
  "api.coingecko.com",
  "api.binance.com",
  "api.alternative.me",
  "eth.blockscout.com",
  "api.mainnet-beta.solana.com",
  "api.bscscan.com",
  "api.polygonscan.com",
  "api.arbiscan.io",
  "api.snowtrace.io",
  "mempool.space",
  "api.gopluslabs.io",
  "api.dexscreener.com",
  "api.solscan.io",
  "api.etherscan.io",
];

// Populated in start(). Never read before then.
let redisState = null;

const telemetry = new Telemetry({
  alertUrl: config.alertWebhookUrl,
  failureAlertThreshold: config.failureAlertThreshold,
});

// Legacy in-process fallbacks used only if redisState is somehow null.
// In normal operation the MemoryState backend handles these.
const memoryRateLimit = new Map();
const memoryCircuits = new Map();

function ipv4ToNumber(ip) {
  return ip.split(".").reduce((n, octet) => n * 256 + Number(octet), 0);
}

function isPrivateAddress(address) {
  const value = String(address)
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  if (net.isIPv4(value)) {
    const n = ipv4ToNumber(value);
    return [
      ["0.0.0.0", "0.255.255.255"],
      ["10.0.0.0", "10.255.255.255"],
      ["100.64.0.0", "100.127.255.255"],
      ["127.0.0.0", "127.255.255.255"],
      ["169.254.0.0", "169.254.255.255"],
      ["172.16.0.0", "172.31.255.255"],
      ["192.0.0.0", "192.0.0.255"],
      ["192.168.0.0", "192.168.255.255"],
      ["198.18.0.0", "198.19.255.255"],
      ["224.0.0.0", "255.255.255.255"],
    ].some(([a, b]) => n >= ipv4ToNumber(a) && n <= ipv4ToNumber(b));
  }
  if (net.isIPv6(value))
    return (
      value === "::1" ||
      value === "::" ||
      /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(value) ||
      value.startsWith("::ffff:")
    );
  return true;
}

async function resolvePublicAddresses(hostname) {
  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new Error("Private IP not allowed");
    return [{ address: hostname, family: net.isIPv6(hostname) ? 6 : 4 }];
  }
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  if (
    !records.length ||
    records.some((record) => isPrivateAddress(record.address))
  )
    throw new Error("Private or unresolved address not allowed");
  return records;
}

async function validateUrl(urlString) {
  if (!urlString || typeof urlString !== "string")
    throw new Error("Missing URL");
  let url;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error("Invalid URL format");
  }
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("Only HTTP/HTTPS allowed");
  const hostname = url.hostname.toLowerCase();
  if (
    !ALLOWED_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    )
  )
    throw new Error(`Domain "${hostname}" is not permitted`);
  return { url, addresses: await resolvePublicAddresses(hostname) };
}

function makePinnedAgent(url, addresses) {
  const Agent = url.protocol === "https:" ? https.Agent : http.Agent;
  const selected = addresses[0];
  return new Agent({
    keepAlive: false,
    lookup: (_host, options, callback) => {
      // Node 22 may request all addresses for autoSelectFamily. Honor that
      // callback contract while still returning only the DNS-pinned address.
      if (options?.all) return callback(null, [selected]);
      return callback(null, selected.address, selected.family);
    },
  });
}

async function checkRateLimit(identity) {
  // redisState is guaranteed non-null after start(). MemoryState also
  // reports connected=true, so this branch covers both backends.
  if (redisState && redisState.connected) {
    const result = await redisState.consumeRateLimit(identity, {
      windowMs: config.rateLimitWindowMs,
      maxRequests: config.rateLimitMaxRequests,
    });
    if (!result.allowed) throw new Error("Rate limit exceeded");
    return;
  }
  // Fallback if called before start() or if redisState is missing.
  const now = Date.now();
  const entry = memoryRateLimit.get(identity) || {
    count: 0,
    reset: now + config.rateLimitWindowMs,
  };
  if (now >= entry.reset) {
    entry.count = 0;
    entry.reset = now + config.rateLimitWindowMs;
  }
  if (++entry.count > config.rateLimitMaxRequests)
    throw new Error("Rate limit exceeded");
  memoryRateLimit.set(identity, entry);
}

async function beforeUpstream(hostname) {
  if (redisState && redisState.connected) {
    if ((await redisState.circuitOpen(hostname)).open)
      throw new Error(`Upstream circuit open for ${hostname}`);
    return;
  }
  const circuit = memoryCircuits.get(hostname);
  if (circuit && circuit.openUntil > Date.now())
    throw new Error(`Upstream circuit open for ${hostname}`);
  if (circuit) memoryCircuits.delete(hostname);
}

async function upstreamSuccess(hostname) {
  if (redisState && redisState.connected)
    await redisState.recordCircuitSuccess(hostname);
  else memoryCircuits.delete(hostname);
}

async function upstreamFailure(hostname, status) {
  let result;
  if (redisState && redisState.connected) {
    result = await redisState.recordCircuitFailure(hostname);
  } else {
    const circuit = memoryCircuits.get(hostname) || {
      failures: 0,
      openUntil: 0,
    };
    circuit.failures += 1;
    if (circuit.failures >= 5) circuit.openUntil = Date.now() + 30000;
    memoryCircuits.set(hostname, circuit);
    result = {
      failures: circuit.failures,
      opened: circuit.failures === 5,
      openUntil: circuit.openUntil,
    };
  }
  await telemetry.recordApiFailure(hostname, status || 0, redisState);
  if (result.opened)
    await telemetry.circuitOpened(hostname, result.failures, result.openUntil);
}

app.use(
  cors({
    origin: (origin, callback) =>
      !origin || allowedOrigins.includes(origin)
        ? callback(null, true)
        : callback(new Error("Origin not allowed by CORS")),
    methods: ["GET"],
    credentials: false,
  }),
);

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

app.get("/proxy", async (req, res) => {
  try {
    await checkRateLimit(req.ip || req.connection.remoteAddress || "unknown");
    let current = await validateUrl(req.query.url);
    let redirects = 0;

    while (true) {
      await beforeUpstream(current.url.hostname);
      let response;
      try {
        response = await axios({
          method: "GET",
          url: current.url.href,
          headers: {
            "User-Agent": "Weaver/1.0",
            Accept: "application/json, application/xml, text/*;q=0.9",
          },
          timeout: 10000,
          maxRedirects: 0,
          validateStatus: (status) =>
            status < 400 || [301, 302, 307, 308].includes(status),
          responseType: "text",
          maxContentLength: 1048576,
          maxBodyLength: 1048576,
          httpAgent:
            current.url.protocol === "http:"
              ? makePinnedAgent(current.url, current.addresses)
              : undefined,
          httpsAgent:
            current.url.protocol === "https:"
              ? makePinnedAgent(current.url, current.addresses)
              : undefined,
        });

        if (response.status >= 500 || response.status === 429)
          await upstreamFailure(current.url.hostname, response.status);
        else await upstreamSuccess(current.url.hostname);
      } catch (error) {
        await upstreamFailure(current.url.hostname, error.response?.status);
        throw error;
      }

      if (![301, 302, 307, 308].includes(response.status)) {
        res.set(
          "Content-Type",
          response.headers["content-type"] || "application/json",
        );
        return res.status(response.status).send(response.data);
      }

      if (++redirects > 5 || !response.headers.location)
        throw new Error("Too many redirects");

      current = await validateUrl(
        new URL(response.headers.location, current.url).href,
      );
    }
  } catch (error) {
    let status = 500;
    let message = "Proxy request failed";
    let code = "PROXY_REQUEST_FAILED";
    let retryable = false;

    if (error.message.includes("Rate limit"))
      [status, message, code, retryable] = [
        429,
        "Too many requests",
        "RATE_LIMITED",
        true,
      ];
    else if (error.message.includes("Upstream circuit open"))
      [status, message, code, retryable] = [
        503,
        "Upstream temporarily unavailable",
        "UPSTREAM_CIRCUIT_OPEN",
        true,
      ];
    else if (/not permitted|not allowed|Private|unresolved/.test(error.message))
      [status, message, code] = [403, "Access denied", "REQUEST_BLOCKED"];
    else if (/Invalid URL|Missing/.test(error.message))
      [status, message, code] = [400, "Bad request", "INVALID_REQUEST"];
    else if (error.response)
      [status, message, code, retryable] = [
        error.response.status || 502,
        "Upstream service error",
        "UPSTREAM_ERROR",
        true,
      ];
    else if (error.message.includes("Origin not allowed"))
      [status, message, code] = [
        403,
        "CORS origin not allowed",
        "CORS_ORIGIN_BLOCKED",
      ];
    else if (
      /timeout|timed out|ETIMEDOUT|ECONNRESET|ENETUNREACH|EAI_AGAIN/i.test(
        error.message,
      )
    )
      [status, message, code, retryable] = [
        504,
        "Upstream provider unavailable",
        "UPSTREAM_UNAVAILABLE",
        true,
      ];

    console.error(
      JSON.stringify({ event: "proxy_error", status, message: error.message }),
    );
    return res.status(status).json({
      error: code,
      message,
      retryable,
      requestId: req.headers["x-request-id"] || null,
    });
  }
});

// ── Health ─────────────────────────────────────────────────────
// Reports the actual backend in use. Only Redis can be "degraded" —
// the memory backend cannot disconnect.
app.get("/health", async (_req, res) => {
  const result = {
    service: "weaver-proxy",
    status: "ok",
    backend: redisState ? redisState.backend : "uninitialized",
    timestamp: new Date().toISOString(),
  };

  if (redisState && redisState.backend === "redis" && redisState.client) {
    try {
      await redisState.client.ping();
    } catch {
      result.status = "degraded";
      result.backend = "redis-unhealthy";
    }
  }

  res.status(result.status === "ok" ? 200 : 503).json(result);
});

// ── Ready ──────────────────────────────────────────────────────
app.get("/ready", (_req, res) => {
  const requiresRedis = isProduction;
  const ready =
    !requiresRedis || (redisState && redisState.backend === "redis");
  res.status(ready ? 200 : 503).json({
    ready,
    backend: redisState ? redisState.backend : "uninitialized",
  });
});

async function start() {
  redisState = await createState({
    url: config.redisUrl,
    required: isProduction,
    namespace: config.redisNamespace,
  });

  console.log(
    JSON.stringify({
      event: `shared_state_${redisState.backend}`,
      backend: redisState.backend,
    }),
  );

  return app.listen(PORT, () =>
    console.log(`Secure proxy listening on ${PORT}`),
  );
}

if (require.main === module)
  start().catch((error) => {
    console.error(
      JSON.stringify({ event: "proxy_start_failed", message: error.message }),
    );
    process.exit(1);
  });

module.exports = {
  app,
  start,
  isPrivateAddress,
  resolvePublicAddresses,
  validateUrl,
  getRedisState: () => redisState,
};
