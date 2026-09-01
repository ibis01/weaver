// ========== proxy-server.js – SECURE & ROBUST ==========
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const dns = require("dns").promises;

const app = express();
const PORT = 3001;

// ── Allowed Domains ──────────────────────────────────────
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

// ── Private IP ranges (IPv4 & IPv6) ─────────────────────
const PRIVATE_IP_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^::1$/,
  /^fc00:/,
  /^fe80:/,
];

// ── Rate limiting ──────────────────────────────────────
const rateLimit = new Map();
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

// ── Validate domain/IP ──────────────────────────────────
async function isPrivateIP(hostname) {
  try {
    const ips = await dns.resolve(hostname);
    for (const ip of ips) {
      if (PRIVATE_IP_RANGES.some((pattern) => pattern.test(ip))) return true;
    }
    return false;
  } catch {
    return false;
  }
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
  if (await isPrivateIP(hostname)) throw new Error("Private IP not allowed");
  return url;
}

// ── Express setup ──────────────────────────────────────
app.use(cors({ origin: true }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  next();
});

// ── Proxy endpoint ──────────────────────────────────────
app.get("/proxy", async (req, res) => {
  const clientIp = req.ip || req.connection.remoteAddress || "unknown";
  try {
    checkRateLimit(clientIp);
    const targetUrl = req.query.url;
    let url = await validateUrl(targetUrl);
    let redirectCount = 0;
    const MAX_REDIRECTS = 5;

    // ── Fetch with manual redirect handling ──────────
    const fetchUrl = async (currentUrl) => {
      const response = await axios({
        method: "GET",
        url: currentUrl.href,
        headers: {
          "User-Agent": "Weaver/1.0",
          Accept: "application/json, application/xml, text/*;q=0.9",
        },
        timeout: 10000,
        maxRedirects: 0, // manual redirects
        validateStatus: (status) =>
          status < 400 ||
          status === 301 ||
          status === 302 ||
          status === 307 ||
          status === 308,
        responseType: "text",
        maxContentLength: 1048576, // 1MB
      });

      // ── Handle redirects ────────────────────────────
      if ([301, 302, 307, 308].includes(response.status)) {
        redirectCount++;
        if (redirectCount > MAX_REDIRECTS)
          throw new Error("Too many redirects");
        const location = response.headers.location;
        if (!location) throw new Error("Redirect without Location header");
        const newUrl = new URL(location, currentUrl);
        // Validate new URL
        await validateUrl(newUrl.href);
        return await fetchUrl(newUrl);
      }

      return response;
    };

    const response = await fetchUrl(url);
    console.log(`[Proxy] ✅ ${url.href} (${response.data.length} bytes)`);
    res.set(
      "Content-Type",
      response.headers["content-type"] || "application/json",
    );
    res.status(response.status).send(response.data);
  } catch (error) {
    console.error(`[Proxy] Error: ${error.message}`);
    let statusCode = 500,
      message = "Proxy request failed";
    if (error.message.includes("Rate limit")) {
      statusCode = 429;
      message = "Too many requests";
    } else if (
      error.message.includes("not permitted") ||
      error.message.includes("not allowed") ||
      error.message.includes("Private IP")
    ) {
      statusCode = 403;
      message = "Access denied";
    } else if (
      error.message.includes("Invalid URL") ||
      error.message.includes("Missing")
    ) {
      statusCode = 400;
      message = "Bad request";
    } else if (error.response) {
      statusCode = error.response.status || 502;
      message = "Upstream service error";
    }
    res.set("Content-Type", "text/plain").status(statusCode).send(message);
  }
});

// ── Health check ──────────────────────────────────────
app.get("/health", (req, res) => res.send("Proxy running securely"));

app.listen(PORT, () => {
  console.log(`🚀 Secure proxy on http://localhost:${PORT}`);
  console.log(`   Allowed domains: ${ALLOWED_DOMAINS.join(", ")}`);
  console.log(
    `   Rate limit: 30 req/min per IP, max 1MB response, max 5 redirects`,
  );
});

// ── Cleanup rate limit entries ──────────────────────
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimit) {
    if (now > entry.reset) rateLimit.delete(ip);
  }
}, 60000);
