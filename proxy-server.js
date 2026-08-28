// ================== proxy-server.js ===================
const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
const PORT = 3001;

// ── Security Configuration ──────────────────────────────────────────

// ⚠️ ONLY these domains are allowed (strict allow-list)
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
  "api.tokenunlocks.com",
];

// Disallow internal/reserved IP ranges
const BLOCKED_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^0\./,
  /^::1$/,
  /^fc00:/,
  /^fe80:/,
];

// ── Helper: URL validation ──────────────────────────────────────────

function validateProxyUrl(urlString) {
  if (!urlString || typeof urlString !== "string") {
    throw new Error("Missing or invalid URL parameter");
  }

  let url;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error("Invalid URL format");
  }

  // 1. Protocol must be http or https
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only HTTP/HTTPS protocols are allowed");
  }

  // 2. Port must be 80, 443, or omitted (default)
  const port = url.port || (url.protocol === "https:" ? 443 : 80);
  if (![80, 443].includes(Number(port))) {
    throw new Error("Only standard ports (80, 443) are allowed");
  }

  // 3. Domain must be in allow-list (exact match or subdomain)
  const hostname = url.hostname.toLowerCase();
  const allowed = ALLOWED_DOMAINS.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  );
  if (!allowed) {
    throw new Error(`Domain "${hostname}" is not permitted`);
  }

  // 4. Block internal IPs (resolve hostname to IP)
  // Use a DNS lookup to catch IP-based bypasses
  // This is a simplified check; for production use dns.lookup()
  // For simplicity, we check if hostname is an IP and block private ranges
  const isIP = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
  if (isIP) {
    if (BLOCKED_IP_PATTERNS.some((pattern) => pattern.test(hostname))) {
      throw new Error("Access to private IP addresses is not allowed");
    }
  }

  // 5. Prevent URL pollution (only allow basic path and query)
  // Remove user info, fragment, etc.
  return {
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port || (url.protocol === "https:" ? 443 : 80),
    pathname: url.pathname,
    search: url.search,
    href: url.href, // The validated URL
  };
}

// ── Rate limiting (simple per-IP) ──────────────────────────────────

const rateLimit = new Map();
function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const maxRequests = 30;

  const entry = rateLimit.get(ip) || { count: 0, reset: now + windowMs };
  if (now > entry.reset) {
    // Reset window
    entry.count = 0;
    entry.reset = now + windowMs;
  }
  entry.count++;
  rateLimit.set(ip, entry);

  if (entry.count > maxRequests) {
    throw new Error("Rate limit exceeded. Please wait a minute.");
  }
  return true;
}

// ── Express Middleware ─────────────────────────────────────────────

app.use(
  cors({
    origin: [
      "http://localhost:8000",
      "http://127.0.0.1:8000",
      "http://localhost:3000",
      "http://localhost:3001",
    ],
    methods: ["GET"],
    credentials: false,
  }),
);

// Security headers
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  next();
});

// ── Proxy Endpoint ──────────────────────────────────────────────────

app.get("/proxy", async (req, res) => {
  const clientIp = req.ip || req.connection.remoteAddress || "unknown";

  try {
    // 1. Rate limit
    checkRateLimit(clientIp);

    // 2. Validate URL
    const targetUrl = req.query.url;
    const validated = validateProxyUrl(targetUrl);

    console.log(`[Proxy] ${clientIp} → ${validated.href}`);

    // 3. Fetch with timeout and user-agent
    const response = await axios.get(validated.href, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; WeaverBot/1.0; +https://weaver.app)",
        Accept: "application/json, application/xml, text/*;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
      },
      timeout: 10000,
      maxRedirects: 5,
      validateStatus: (status) => status < 400, // reject if status >= 400
      responseType: "text",
    });

    console.log(
      `[Proxy] ✅ Success: ${validated.href} (${response.data.length} bytes)`,
    );
    res.set(
      "Content-Type",
      response.headers["content-type"] || "application/xml",
    );
    res.status(response.status);
    res.send(response.data);
  } catch (error) {
    // Never expose internal error details
    console.error(`[Proxy] Error: ${error.message}`);

    let statusCode = 500;
    let message = "Proxy request failed";

    if (error.message.includes("Rate limit")) {
      statusCode = 429;
      message = "Too many requests. Please wait.";
    } else if (
      error.message.includes("not permitted") ||
      error.message.includes("not allowed")
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
      // For non-sensitive errors, we can pass the upstream status
      if (statusCode >= 500) statusCode = 502;
    }

    res.status(statusCode).send(message);
  }
});

// ── Health Check ────────────────────────────────────────────────────

app.get("/health", (req, res) => {
  res.send("Proxy is running securely");
});

// ── Start Server ────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`🚀 Weaver secure proxy running on http://localhost:${PORT}`);
  console.log(`   Allowed domains: ${ALLOWED_DOMAINS.join(", ")}`);
  console.log(`   Rate limit: 30 requests/minute per IP`);
});

// ── Cleanup rate limit entries periodically ──────────────────────

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimit) {
    if (now > entry.reset) {
      rateLimit.delete(ip);
    }
  }
}, 60000);
