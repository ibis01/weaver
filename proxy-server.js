// ========== proxy-server.js – SECURE & ROBUST ==========
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const dns = require("dns").promises;
const net = require("net");
const http = require("http");
const https = require("https");

const app = express();
const PORT = process.env.PROXY_PORT || process.env.PORT || 3001;

const ALLOWED_ORIGINS_ENV = process.env.ALLOWED_ORIGINS || "";
const isProduction = process.env.NODE_ENV === "production";
let allowedOrigins = ALLOWED_ORIGINS_ENV.split(",")
  .map((o) => o.trim())
  .filter(Boolean);

if (isProduction && allowedOrigins.length === 0) {
  console.error("ERROR: ALLOWED_ORIGINS must be configured in production.");
  process.exit(1);
}

const DEFAULT_ORIGINS = [
  "http://localhost:8000",
  "http://127.0.0.1:8000",
  "http://localhost:3000",
];
if (!isProduction && allowedOrigins.length === 0) {
  allowedOrigins = DEFAULT_ORIGINS;
  console.log(
    `[Proxy] Using default development origins: ${allowedOrigins.join(", ")}`,
  );
}

const ALLOWED_DOMAINS = [
  "api.coingecko.com",
  "api.binance.com",
  "api.alternative.me",
  "api.allorigins.win",
  "api.codetabs.com",
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

function ipv4ToNumber(ip) {
  return ip.split(".").reduce((n, octet) => n * 256 + Number(octet), 0);
}

function isPrivateAddress(address) {
  const normalized = String(address)
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  if (net.isIPv4(normalized)) {
    const n = ipv4ToNumber(normalized);
    const ranges = [
      [ipv4ToNumber("0.0.0.0"), ipv4ToNumber("0.255.255.255")],
      [ipv4ToNumber("10.0.0.0"), ipv4ToNumber("10.255.255.255")],
      [ipv4ToNumber("100.64.0.0"), ipv4ToNumber("100.127.255.255")],
      [ipv4ToNumber("127.0.0.0"), ipv4ToNumber("127.255.255.255")],
      [ipv4ToNumber("169.254.0.0"), ipv4ToNumber("169.254.255.255")],
      [ipv4ToNumber("172.16.0.0"), ipv4ToNumber("172.31.255.255")],
      [ipv4ToNumber("192.0.0.0"), ipv4ToNumber("192.0.0.255")],
      [ipv4ToNumber("192.168.0.0"), ipv4ToNumber("192.168.255.255")],
      [ipv4ToNumber("198.18.0.0"), ipv4ToNumber("198.19.255.255")],
      [ipv4ToNumber("224.0.0.0"), ipv4ToNumber("255.255.255.255")],
    ];
    return ranges.some(([start, end]) => n >= start && n <= end);
  }
  if (net.isIPv6(normalized)) {
    return (
      normalized === "::1" ||
      normalized === "::" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb") ||
      normalized.startsWith("ff") ||
      normalized.startsWith("::ffff:10.") ||
      normalized.startsWith("::ffff:127.") ||
      normalized.startsWith("::ffff:192.168.") ||
      normalized.startsWith("::ffff:169.254.")
    );
  }
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
  ) {
    throw new Error("Private or unresolved address not allowed");
  }
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
  const allowed = ALLOWED_DOMAINS.some(
    (d) => hostname === d || hostname.endsWith(`.${d}`),
  );
  if (!allowed) throw new Error(`Domain "${hostname}" is not permitted`);
  const addresses = await resolvePublicAddresses(hostname);
  return { url, addresses };
}

function makePinnedAgent(url, addresses) {
  const Agent = url.protocol === "https:" ? https.Agent : http.Agent;
  const selected = addresses[0];
  return new Agent({
    keepAlive: false,
    lookup: (_hostname, _options, callback) =>
      callback(null, selected.address, selected.family),
  });
}

const rateLimit = new Map();
const upstreamCircuits = new Map();

function beforeUpstream(hostname) {
  const circuit = upstreamCircuits.get(hostname);
  if (circuit && circuit.openUntil > Date.now()) {
    throw new Error(`Upstream circuit open for ${hostname}`);
  }
  if (circuit && circuit.openUntil <= Date.now())
    upstreamCircuits.delete(hostname);
}

function recordUpstreamSuccess(hostname) {
  upstreamCircuits.delete(hostname);
}

function recordUpstreamFailure(hostname) {
  const circuit = upstreamCircuits.get(hostname) || {
    failures: 0,
    openUntil: 0,
  };
  circuit.failures += 1;
  if (circuit.failures >= 5) circuit.openUntil = Date.now() + 30000;
  upstreamCircuits.set(hostname, circuit);
}

function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxRequests = 30;
  const entry = rateLimit.get(ip) || { count: 0, reset: now + windowMs };
  if (now > entry.reset) {
    entry.count = 0;
    entry.reset = now + windowMs;
  }
  entry.count++;
  rateLimit.set(ip, entry);
  if (entry.count > maxRequests) throw new Error("Rate limit exceeded");
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin))
        return callback(null, true);
      return callback(new Error("Origin not allowed by CORS"));
    },
    methods: ["GET"],
    credentials: false,
  }),
);
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

app.get("/proxy", async (req, res) => {
  const clientIp = req.ip || req.connection.remoteAddress || "unknown";
  try {
    checkRateLimit(clientIp);
    let validated = await validateUrl(req.query.url);
    let redirectCount = 0;
    const MAX_REDIRECTS = 5;

    const fetchUrl = async (current) => {
      beforeUpstream(current.url.hostname);
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
          recordUpstreamFailure(current.url.hostname);
        else recordUpstreamSuccess(current.url.hostname);
      } catch (error) {
        recordUpstreamFailure(current.url.hostname);
        throw error;
      }
      if ([301, 302, 307, 308].includes(response.status)) {
        if (++redirectCount > MAX_REDIRECTS)
          throw new Error("Too many redirects");
        const location = response.headers.location;
        if (!location) throw new Error("Redirect without Location header");
        validated = await validateUrl(new URL(location, current.url).href);
        return fetchUrl(validated);
      }
      return response;
    };

    const response = await fetchUrl(validated);
    console.log(
      `[Proxy] request completed (${String(response.data).length} bytes)`,
    );
    res.set(
      "Content-Type",
      response.headers["content-type"] || "application/json",
    );
    res.status(response.status).send(response.data);
  } catch (error) {
    console.error(`[Proxy] Error: ${error.message}`);
    let statusCode = 500;
    let message = "Proxy request failed";
    if (error.message.includes("Rate limit")) {
      statusCode = 429;
      message = "Too many requests";
    } else if (
      /not permitted|not allowed|Private|unresolved/.test(error.message)
    ) {
      statusCode = 403;
      message = "Access denied";
    } else if (/Invalid URL|Missing/.test(error.message)) {
      statusCode = 400;
      message = "Bad request";
    } else if (error.response) {
      statusCode = error.response.status || 502;
      message = "Upstream service error";
    } else if (error.message.includes("Origin not allowed")) {
      statusCode = 403;
      message = "CORS origin not allowed";
    } else if (error.message.includes("Upstream circuit open")) {
      statusCode = 503;
      message = "Upstream temporarily unavailable";
    }
    res.set("Content-Type", "text/plain").status(statusCode).send(message);
  }
});

app.get("/health", (req, res) => res.send("Proxy running securely"));
app.listen(PORT, () => {
  console.log(`🚀 Secure proxy on http://localhost:${PORT}`);
  console.log(`   Allowed origins: ${allowedOrigins.join(", ")}`);
});

module.exports = { isPrivateAddress, resolvePublicAddresses, validateUrl };
