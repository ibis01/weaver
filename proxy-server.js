// ========== proxy-server.js – SECURE & WORKING ==========
const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
const PORT = 3001;

// ── Allowed Domains (crypto APIs only) ──────────────────────
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

// ── Rate limiting (simple) ──────────────────────────────────
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
  if (entry.count > maxRequests) {
    throw new Error("Rate limit exceeded");
  }
}

// ── URL Validation (simplified & robust) ──────────────────
function validateUrl(urlString) {
  if (!urlString || typeof urlString !== "string") {
    throw new Error("Missing URL parameter");
  }
  let url;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error("Invalid URL format");
  }
  // Protocol must be http or https
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only HTTP/HTTPS allowed");
  }
  // Domain must be in allow-list (exact or subdomain)
  const hostname = url.hostname.toLowerCase();
  const allowed = ALLOWED_DOMAINS.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  );
  if (!allowed) {
    throw new Error(`Domain "${hostname}" is not permitted`);
  }
  // Block private IPs (simple check)
  const isPrivate =
    /^127\.|^10\.|^172\.(1[6-9]|2[0-9]|3[0-1])\.|^192\.168\./.test(hostname);
  if (isPrivate) {
    throw new Error("Private IP addresses are not allowed");
  }
  // Return the full URL string
  return url.href;
}

// ── Express setup ────────────────────────────────────────────
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

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  next();
});

// ── Proxy Endpoint ──────────────────────────────────────────
app.get("/proxy", async (req, res) => {
  const clientIp = req.ip || req.connection.remoteAddress || "unknown";

  try {
    // 1. Rate limit
    checkRateLimit(clientIp);

    // 2. Validate URL
    const targetUrl = req.query.url;
    const validatedUrl = validateUrl(targetUrl);

    console.log(`[Proxy] ${clientIp} → ${validatedUrl}`);

    // 3. Fetch with timeout
    const response = await axios.get(validatedUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; WeaverBot/1.0; +https://weaver.app)",
        Accept: "application/json, application/xml, text/*;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
      },
      timeout: 10000,
      maxRedirects: 5,
      validateStatus: (status) => status < 400,
      responseType: "text",
    });

    console.log(
      `[Proxy] ✅ Success: ${validatedUrl} (${response.data.length} bytes)`,
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
      message = "Too many requests. Please wait.";
    } else if (
      error.message.includes("not permitted") ||
      error.message.includes("not allowed")
    ) {
      statusCode = 403;
      message = "Access denied – domain not allowed";
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

    res.set("Content-Type", "text/plain");
    res.status(statusCode).send(message);
  }
});

// ── Health check ────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.send("Proxy is running securely");
});

// ── Start server ────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Weaver secure proxy running on http://localhost:${PORT}`);
  console.log(`   Allowed domains: ${ALLOWED_DOMAINS.join(", ")}`);
  console.log(`   Rate limit: 30 requests/minute per IP`);
});

// ── Cleanup rate limit entries ─────────────────────────────
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimit) {
    if (now > entry.reset) {
      rateLimit.delete(ip);
    }
  }
}, 60000);
