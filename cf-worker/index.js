// ================================================================
// cf-worker/index.js – Weaver's own CORS proxy (replaces public
// proxies like allorigins.win / corsproxy.io / codetabs.com)
// ================================================================
//
// Routes (path-based, NOT a generic ?url= passthrough by design):
//   GET  /goplus/evm/:chainId?contract_addresses=0x...
//   GET  /goplus/solana?contract_addresses=...
//   POST /bitquery/deployer    body: { chain, deployerAddress }
//   GET  /meme/alerts?since=&until=&limit=&cursor=   (calibration read)
//   POST /meme/alert           body: { assessment, market, ... }
//   GET/POST /proxy?url=...    host-allowlisted market/news relay
//
// SOLANA RPC — KEYED PROVIDER INJECTION:
//   Every keyless Solana RPC is now closed to Cloudflare Worker
//   egress. Verified failures:
//     - api.mainnet-beta.solana.com    → 403 IP block
//     - solana.llamarpc.com            → 403 IP block
//     - solana-rpc.publicnode.com      → 429 under load
//     - solana.api.onfinality.io/public → -32029 rate limit
//     - rpc.ankr.com/solana            → -32052 key required
//   The client now points at Helius (mainnet.helius-rpc.com) with a
//   placeholder api-key. This Worker swaps the placeholder for the
//   real key stored as HELIUS_KEY before forwarding upstream. The
//   key never reaches the browser bundle or git history.
//
//   Set the secret with:  npx wrangler secret put HELIUS_KEY
//   Without it, /proxy returns 403 to the client for Helius hosts,
//   which surfaces as a clean "Solana unreachable" in the UI.
//
// MARKET DATA AUTHENTICATION NOTE:
//   CoinGecko, Binance, and CoinCap have all been removed.
//     - CoinGecko: needs a key on datacenter egress; keyed path 401,
//       anonymous 429.
//     - Binance:   blocks Cloudflare Worker IPs with 403.
//     - CoinCap:   v2 API (api.coincap.io) no longer resolves — 530.
//   The client sources prices from CoinLore (primary), CoinBase
//   (secondary), and CoinPaprika (tertiary). None require a key.
//
// BITQUERY ROUTE — DESIGN NOTES:
//   The client sends only { chain, deployerAddress }. It does NOT
//   send a GraphQL query. The Worker constructs the query from a
//   fixed template and forwards it with the API key. This is the
//   only way to prevent a caller who discovers the Worker URL from
//   running arbitrary queries against the account.
//
//   The Bitquery API key lives in the Worker environment. Set it
//   with:  npx wrangler secret put BITQUERY_KEY
//   Without it, the /bitquery route returns 503.
//
//   The query uses dataset: realtime because Bitquery's `combined`
//   dataset spans realtime + archive and requires a paid plan. A
//   free/trial key gets "access restricted" on `combined`. `realtime`
//   is included on all plans. Tradeoff: results cover recent blocks
//   only, so a deployer address that has not been active lately will
//   return an empty Calls array — an honest answer, not an error.
//
//   QUOTA EXHAUSTION (HTTP 402):
//   Bitquery returns 402 "access restricted by points limit" when
//   the account's points are exhausted or no active plan exists.
//   This is NOT a transient failure — retrying makes it worse and
//   wastes any remaining quota on rejected calls. The Worker
//   surfaces 402 with code "BITQUERY_QUOTA_EXHAUSTED" and
//   retryable: false so the client can open its circuit breaker
//   for the rest of the session instead of retrying.
//
// GOPLUS RATE LIMITING:
//   GoPlus returns HTTP 200 with a JSON body { code: 4029 } when it
//   rate-limits the shared Cloudflare egress IP pool. Checking HTTP
//   status alone is not sufficient — we must inspect the body. The
//   relay() function below retries up to 3 times with exponential
//   backoff + jitter and, if still limited, returns HTTP 429 so the
//   client can distinguish "rate limited" from "real error".
//
// GOPLUS AUTHENTICATION:
//   Set GOPLUS_KEY with `npx wrangler secret put GOPLUS_KEY` to move
//   from the shared unauthenticated rate pool to a dedicated access
//   token with a higher per-minute limit. The key is attached as a
//   Bearer token on every GoPlus fetch. When GOPLUS_KEY is not set,
//   the Worker still works — it just uses the shared channel and is
//   more likely to be rate-limited.
//
// /proxy ROUTE — DESIGN NOTES:
//   The market/news relay exists because some upstreams do not send
//   CORS headers, so a browser cannot fetch them directly. Unlike
//   the GoPlus and Bitquery routes, the destination URL is
//   client-supplied. To keep this from becoming an open proxy, every
//   target host must appear in ALLOWED_PROXY_HOSTS. A request to any
//   other host returns 403 with the rejected hostname in the body,
//   before any upstream connection is attempted. This makes SSRF to
//   localhost, RFC1918 ranges, and Cloudflare metadata endpoints
//   structurally impossible — those hostnames simply are not on the
//   list.
//
//   HTTPS-only, no redirects followed (redirect: "manual" on every
//   upstream fetch — a 3xx is treated as a failure and never cached,
//   so an allowlisted host with an open redirect cannot poison the
//   edge cache), no client headers forwarded except Content-Type on
//   POST. The client's Origin is still gated by ALLOWED_ORIGINS above.
//
//   EDGE CACHE (§3.4, §3.6):
//   GET requests are cached at the Cloudflare edge for
//   PROXY_CACHE_FRESH_SECONDS (60). During upstream failures
//   (429/5xx/timeout), a cached entry up to
//   PROXY_CACHE_STALE_MAX_SECONDS (600) old is served instead of
//   propagating the error, so a CoinLore hiccup degrades to a
//   ≤10-minute-old price — never to a 1-day-old snapshot. The
//   X-Weaver-Cache header reports HIT / MISS / REVALIDATED / STALE /
//   NONE so clients and operators can see which path served a
//   response. Failures are never cached.
//
// SECURITY NOTE — ORIGIN IS NOT A RATE LIMITER:
//   The ALLOWED_ORIGINS check is a CORS access-control check. It
//   prevents a browser on an unauthorized origin from reading the
//   response. It does NOT prevent a scripted caller from sending a
//   spoofed Origin header, nor a curl call with no Origin at all.
//   There is no application-level rate limiting in this Worker.
//   Concrete abuse protection should be applied at the deployment
//   level (Cloudflare Rate Limiting Rules scoped to
//   /bitquery/deployer and /proxy). Treat the origin check as an
//   access-control gate, never as abuse prevention.
//
// Deploy: see cf-worker/README.md in this folder.

// ── Imports ──────────────────────────────────────────────────────
import { handleMemeAlert } from "./src/meme-alert.js";

// Only these origins may call this worker from a browser.
const ALLOWED_ORIGINS = [
  "https://ibis01.github.io",
  "http://localhost:3000",
  "http://localhost:5500",
  "http://localhost:8080",
  "http://127.0.0.1:5500",
];

const GOPLUS_EVM_BASE = "https://api.gopluslabs.io/api/v1/token_security";
const GOPLUS_SOLANA_BASE =
  "https://api.gopluslabs.io/api/v1/solana/token_security";

const BITQUERY_ENDPOINT = "https://streaming.bitquery.io/graphql";

const ALLOWED_EVM_CHAIN_IDS = new Set([
  "1",
  "56",
  "8453",
  "42161",
  "137",
  "43114",
  "10",
  "250",
  "25",
  "100",
]);

// Hosts the /proxy route may forward to. Mirrors the connect-src
// hosts in index.html's CSP. Keep the two in sync.
//
// Removed over the course of the provider migration:
//   api.coingecko.com, pro-api.coingecko.com   (401 keyed, 429 anon)
//   api.binance.com                             (403 CloudFront)
//   api.coincap.io                              (DNS dead)
//   api.bscscan.com                             (301 → HTML)
//   api.mainnet-beta.solana.com                 (403 IP block)
//   solana.llamarpc.com                         (403 IP block)
//   solana-rpc.publicnode.com                   (429)
//   solana.api.onfinality.io                    (-32029 rate limit)
//   rpc.ankr.com                                (-32052 key required)
//   rpc.publicnode.com                          (404 — EVM-only)
const ALLOWED_PROXY_HOSTS = new Set([
  // ── Market data ──
  "api.coinpaprika.com",
  "api.coinlore.net",
  "api.coinbase.com",
  "api.alternative.me",
  "api.dexscreener.com",
  "api.llama.fi",
  // ── Security / analysis ──
  "api.gopluslabs.io",
  "api.etherscan.io",
  "api.polygonscan.com",
  "api.arbiscan.io",
  "api.snowtrace.io",
  "api.solscan.io",
  // ── EVM RPCs ──
  "ethereum.publicnode.com",
  "bsc-rpc.publicnode.com",
  // ── Solana RPC (keyed, injected by relayAllowedProxy) ──
  "mainnet.helius-rpc.com",
  // ── Explorers / misc ──
  "eth.blockscout.com",
  "mempool.space",
  // ── News RSS ──
  "www.coindesk.com",
  "cointelegraph.com",
  "decrypt.co",
]);

// Bitquery network names for the chains the deployer route supports.
// Deliberately narrower than ALLOWED_EVM_CHAIN_IDS — the V2 streaming
// endpoint does not support every EVM chain. Chains absent from this
// map are rejected with 400 before any upstream call.
const CHAIN_TO_BITQUERY_NETWORK = {
  ethereum: "eth",
  bsc: "bsc",
  base: "base",
  arbitrum: "arbitrum",
  polygon: "matic",
  optimism: "optimism",
};

// Fixed GraphQL query. The client never sees or supplies this. Only
// the variables (network, address, limit) are per-request.
//
// EVIDENCE SEMANTICS — do not remove Receipt.ContractAddress:
//   Bitquery distinguishes two creation cases:
//     - Top-level deployment: the deployed address is
//       Receipt.ContractAddress.
//     - Factory/internal deployment: the deployed address is
//       Call.To on the create call.
//   Requesting only Call.To would silently misclassify every
//   top-level deployment. Requesting both lets the client apply
//   an explicit extraction policy (see deployer-graph.js).
const DEPLOYER_QUERY = `query DeployerContracts(
  $network: evm_network!
  $address: String!
  $limit: Int!
) {
  EVM(network: $network, dataset: realtime) {
    Calls(
      limit: { count: $limit }
      orderBy: { ascending: Block_Time }
      where: { Call: { Create: true, From: { is: $address } } }
    ) {
      Call {
        To
        From
        Create
        Index
      }
      Receipt {
        ContractAddress
      }
      Transaction {
        Hash
        From
      }
      Block {
        Time
      }
    }
  }
}`;

const DEPLOYER_QUERY_LIMIT = 50;
const EVM_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const FETCH_TIMEOUT_MS = 10000;

// Hard cap on any single upstream response body. Protects the Worker
// isolate from a misbehaving or hostile allowlisted host streaming
// unbounded bytes. Cloudflare caps isolate memory well below this,
// but hitting that ceiling takes the route down for every caller
// until the isolate is recycled — better to fail the single request.
const MAX_UPSTREAM_BYTES = 5 * 1024 * 1024; // 5 MB

const GOPLUS_RATE_LIMIT_CODE = 4029;
const GOPLUS_MAX_ATTEMPTS = 3;
const GOPLUS_BASE_DELAY_MS = 400;

const PROXY_CACHE_FRESH_SECONDS = 60;
const PROXY_CACHE_STALE_MAX_SECONDS = 600;

// ----------------------------------------------------------------
// CORS
// ----------------------------------------------------------------
function corsHeaders(origin) {
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : "null";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function jsonResponse(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

// Read a response body as text, enforcing the size cap from the
// declared Content-Length when present, and from the actual read
// length afterwards. The post-read check covers upstreams that
// omit Content-Length or send a lie.
//
// The declared check is in bytes; the post-read check is in UTF-16
// code units. For JSON this is close enough — the intent is a
// coarse ceiling, not byte-exact enforcement.
async function readTextWithCap(resp) {
  const declared = Number(resp.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_UPSTREAM_BYTES) {
    throw new Error("Upstream response too large (declared)");
  }
  const text = await resp.text();
  if (text.length > MAX_UPSTREAM_BYTES) {
    throw new Error("Upstream response too large (actual)");
  }
  return text;
}

// ----------------------------------------------------------------
// Upstream relays
// ----------------------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(ms) {
  return Math.floor(Math.random() * ms);
}

async function fetchGoPlusOnce(upstreamUrl, env) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  const headers = { "User-Agent": "WeaverProxy/1.0" };
  if (env && typeof env.GOPLUS_KEY === "string" && env.GOPLUS_KEY) {
    headers.Authorization = `Bearer ${env.GOPLUS_KEY}`;
  }

  try {
    const resp = await fetch(upstreamUrl, {
      signal: controller.signal,
      headers,
      redirect: "manual",
    });
    const text = await readTextWithCap(resp);
    return { status: resp.status, text };
  } finally {
    clearTimeout(timeout);
  }
}

async function relay(upstreamUrl, headers, env) {
  let lastPayload = null;

  for (let attempt = 0; attempt < GOPLUS_MAX_ATTEMPTS; attempt++) {
    let result;
    try {
      result = await fetchGoPlusOnce(upstreamUrl, env);
    } catch (e) {
      // Detail goes to server-side logs only. The client gets a
      // generic message; upstream error bodies are never echoed.
      console.error("[relay] GoPlus fetch failed:", e && e.message);
      return jsonResponse(
        { code: 0, message: "Upstream fetch failed" },
        502,
        headers,
      );
    }

    let parsed = null;
    try {
      parsed = JSON.parse(result.text);
    } catch (_) {
      return new Response(result.text, {
        status: result.status,
        headers: { "Content-Type": "application/json", ...headers },
      });
    }

    const isRateLimited = parsed && parsed.code === GOPLUS_RATE_LIMIT_CODE;

    if (!isRateLimited) {
      return new Response(result.text, {
        status: result.status,
        headers: { "Content-Type": "application/json", ...headers },
      });
    }

    lastPayload = parsed;
    if (attempt < GOPLUS_MAX_ATTEMPTS - 1) {
      const delay = GOPLUS_BASE_DELAY_MS * Math.pow(2, attempt) + jitter(250);
      await sleep(delay);
    }
  }

  return jsonResponse(
    {
      code: GOPLUS_RATE_LIMIT_CODE,
      message:
        lastPayload && lastPayload.message
          ? lastPayload.message
          : "GoPlus rate limit exceeded after retries.",
    },
    429,
    headers,
  );
}

async function relayBitquery(env, network, address, headers) {
  if (!env || typeof env.BITQUERY_KEY !== "string" || !env.BITQUERY_KEY) {
    return jsonResponse(
      { error: "Bitquery not configured on this Worker" },
      503,
      headers,
    );
  }

  const body = JSON.stringify({
    query: DEPLOYER_QUERY,
    variables: { network, address, limit: DEPLOYER_QUERY_LIMIT },
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let upstreamResp;
  let upstreamText;
  try {
    upstreamResp = await fetch(BITQUERY_ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.BITQUERY_KEY}`,
        "User-Agent": "WeaverProxy/1.0",
      },
      body,
      redirect: "manual",
    });
    upstreamText = await readTextWithCap(upstreamResp);
  } catch (e) {
    // Detail logged server-side; client gets a generic message.
    // e.message can carry the upstream URL or CF-internal detail.
    console.error("[relayBitquery] Bitquery fetch failed:", e && e.message);
    return jsonResponse(
      { error: "Bitquery upstream unavailable" },
      502,
      headers,
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!upstreamResp.ok) {
    // ── Distinguish quota exhaustion from transient failures ─────
    //
    // HTTP 402 ("Payment Required" / "access restricted by points
    // limit") means the Bitquery account has no points left for
    // the current billing period, or has no active plan. Retrying
    // is futile — every subsequent request returns the same 402
    // until the account is topped up or upgraded. The client is
    // told retryable: false so it can open a session-scoped
    // circuit breaker rather than firing 6 doomed requests per
    // gem scan.
    //
    // Everything else (429 rate limit, 5xx, timeouts) stays 502 —
    // those are genuinely transient and worth retrying.
    const status = upstreamResp.status;
    const isQuota = status === 402;
    console.error(
      `[relayBitquery] Bitquery upstream returned HTTP ${status}` +
        (isQuota ? " (points exhausted / no active plan)" : ""),
    );
    return jsonResponse(
      {
        error: `Bitquery upstream returned HTTP ${status}`,
        code: isQuota ? "BITQUERY_QUOTA_EXHAUSTED" : "BITQUERY_UPSTREAM_ERROR",
        retryable: !isQuota,
      },
      isQuota ? 402 : 502,
      headers,
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(upstreamText);
  } catch (e) {
    return jsonResponse(
      { error: "Bitquery returned a non-JSON response" },
      502,
      headers,
    );
  }

  if (parsed && Array.isArray(parsed.errors) && parsed.errors.length > 0) {
    return jsonResponse(
      {
        error: "Bitquery returned GraphQL errors",
        detail: parsed.errors
          .map((e) => (e && typeof e.message === "string" ? e.message : null))
          .filter(Boolean),
      },
      502,
      headers,
    );
  }

  return new Response(JSON.stringify(parsed), {
    status: 200,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

// Generic passthrough relay for /proxy?url=… — see header notes.
//
// KEYED-PROVIDER INJECTION:
//   For hosts that require an API key (currently only Helius), the
//   Worker swaps the client-supplied placeholder for the real secret
//   stored in env. The client sends ?api-key=placeholder; the Worker
//   replaces it with env.HELIUS_KEY before forwarding. This keeps the
//   key out of the browser bundle, out of git, and off the wire
//   between browser and Worker.
async function relayAllowedProxy(request, url, headers, ctx, env) {
  const target = url.searchParams.get("url");
  if (!target) {
    return jsonResponse({ error: "Missing url param" }, 400, headers);
  }

  const targetUrl = (() => {
    try {
      return new URL(target);
    } catch {
      return null;
    }
  })();

  if (!targetUrl) {
    return jsonResponse({ error: "Invalid url" }, 400, headers);
  }

  // HTTPS only. http:// would let a browser on an allowlisted origin
  // pull plaintext from an upstream and have the Worker launder it
  // into an https response — a downgrade the client never asked for.
  if (targetUrl.protocol !== "https:") {
    return jsonResponse({ error: "Only https is allowed" }, 400, headers);
  }

  if (!ALLOWED_PROXY_HOSTS.has(targetUrl.hostname)) {
    return jsonResponse(
      { error: `Host not allowed: ${targetUrl.hostname}` },
      403,
      headers,
    );
  }

  // ── Keyed-provider injection ───────────────────────────────────
  // The client sends a placeholder api-key value; the Worker replaces
  // it with the real secret. This block is the only place the secret
  // is ever read, and the only place it is attached to a request.
  let effectiveTarget = targetUrl.toString();

  if (
    targetUrl.hostname === "mainnet.helius-rpc.com" &&
    env &&
    typeof env.HELIUS_KEY === "string" &&
    env.HELIUS_KEY
  ) {
    const keyed = new URL(targetUrl.toString());
    keyed.searchParams.set("api-key", env.HELIUS_KEY);
    effectiveTarget = keyed.toString();
  } else if (
    targetUrl.hostname === "mainnet.helius-rpc.com" &&
    (!env || !env.HELIUS_KEY)
  ) {
    // Missing key: fail closed rather than forwarding the request
    // with the placeholder value, which would just produce a confusing
    // upstream error.
    return jsonResponse(
      { error: "Helius RPC not configured on this Worker (set HELIUS_KEY)" },
      503,
      headers,
    );
  }

  const method = request.method === "POST" ? "POST" : "GET";
  const upstreamHeaders = {
    Accept: "application/json",
    "User-Agent": "WeaverProxy/1.0",
  };

  const init = {
    method,
    headers: upstreamHeaders,
    // Do not follow upstream redirects. An allowlisted host that
    // returns a 3xx could otherwise redirect to a non-allowlisted
    // target, and the response would be cached under the original
    // URL key — a cache-poisoning vector. 3xx responses therefore
    // surface as !ok and are treated as failures below.
    redirect: "manual",
  };
  if (method === "POST") {
    init.body = await request.text();
    init.headers["Content-Type"] = "application/json";
  }

  // ── Edge cache lookup (GET only) ───────────────────────────────
  const cache = caches.default;
  const cacheKey = new Request(effectiveTarget, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  let cachedResponse = null;
  let cachedAge = Infinity;

  if (method === "GET") {
    cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      const cachedAt = Number(
        cachedResponse.headers.get("X-Weaver-Cached-At") || 0,
      );
      cachedAge = (Date.now() - cachedAt) / 1000;

      if (cachedAge <= PROXY_CACHE_FRESH_SECONDS) {
        const body = await cachedResponse.text();
        return new Response(body, {
          status: 200,
          headers: {
            "Content-Type":
              cachedResponse.headers.get("Content-Type") || "application/json",
            "X-Weaver-Cache": "HIT",
            ...headers,
          },
        });
      }
    }
  }

  // ── Upstream fetch ─────────────────────────────────────────────
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let upstream = null;
  let text = null;
  let upstreamOk = false;

  try {
    upstream = await fetch(effectiveTarget, {
      ...init,
      signal: controller.signal,
    });
    if (upstream.ok) {
      text = await readTextWithCap(upstream);
      upstreamOk = true;
    }
  } catch (e) {
    // readTextWithCap throws on oversize; leave text null so the
    // failure path below runs. Detail is not surfaced to the client.
    upstream = null;
  } finally {
    clearTimeout(timer);
  }

  // ── Upstream success: store (GET) and return ───────────────────
  if (upstreamOk && text !== null) {
    const contentType =
      upstream.headers.get("content-type") || "application/json";

    if (method === "GET") {
      const toCache = new Response(text, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": `public, max-age=${PROXY_CACHE_FRESH_SECONDS}`,
          "X-Weaver-Cached-At": String(Date.now()),
        },
      });
      if (ctx && typeof ctx.waitUntil === "function") {
        ctx.waitUntil(cache.put(cacheKey, toCache.clone()));
      } else {
        await cache.put(cacheKey, toCache.clone());
      }
    }

    return new Response(text, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "X-Weaver-Cache": cachedResponse ? "REVALIDATED" : "MISS",
        ...headers,
      },
    });
  }

  // ── Upstream failure: serve stale cache within budget (§3.4) ───
  if (
    method === "GET" &&
    cachedResponse &&
    cachedAge <= PROXY_CACHE_STALE_MAX_SECONDS
  ) {
    const staleBody = await cachedResponse.text();
    return new Response(staleBody, {
      status: 200,
      headers: {
        "Content-Type":
          cachedResponse.headers.get("Content-Type") || "application/json",
        "X-Weaver-Cache": "STALE",
        "X-Weaver-Stale-Age": String(Math.floor(cachedAge)),
        ...headers,
      },
    });
  }

  // ── No usable cache: pass the upstream error through honestly ──
  if (upstream) {
    const errorBody = await upstream.text().catch(() => "");
    return new Response(
      errorBody ||
        JSON.stringify({ error: `Upstream returned HTTP ${upstream.status}` }),
      {
        status: upstream.status,
        headers: {
          "Content-Type": "application/json",
          "X-Weaver-Cache": "NONE",
          ...headers,
        },
      },
    );
  }

  return jsonResponse(
    { error: "Upstream fetch failed (timeout or network error)" },
    502,
    { ...headers, "X-Weaver-Cache": "NONE" },
  );
}

// ----------------------------------------------------------------
// Route handlers
// ----------------------------------------------------------------

async function handleDeployerRequest(request, env, headers) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: "Invalid JSON body" }, 400, headers);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonResponse({ error: "Invalid request body" }, 400, headers);
  }

  const chain =
    typeof body.chain === "string" ? body.chain.trim().toLowerCase() : "";
  const address =
    typeof body.deployerAddress === "string" ? body.deployerAddress.trim() : "";

  const network = CHAIN_TO_BITQUERY_NETWORK[chain];
  if (!network) {
    return jsonResponse(
      { error: `Unsupported chain: ${chain || "(missing)"}` },
      400,
      headers,
    );
  }

  if (!EVM_ADDRESS_PATTERN.test(address)) {
    return jsonResponse(
      {
        error: "deployerAddress must be a 0x-prefixed 40-character hex string",
      },
      400,
      headers,
    );
  }

  return relayBitquery(env, network, address.toLowerCase(), headers);
}

// ----------------------------------------------------------------
// Router
// ----------------------------------------------------------------
async function handleRequest(request, env, ctx) {
  const originHeader = request.headers.get("Origin");
  const origin = originHeader || "";
  const headers = corsHeaders(origin);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (originHeader !== null && !ALLOWED_ORIGINS.includes(origin)) {
    return jsonResponse({ error: "Origin not allowed" }, 403, headers);
  }

  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);

  // ── Bitquery route — POST only, exact path match. ────────────
  if (
    parts.length === 2 &&
    parts[0] === "bitquery" &&
    parts[1] === "deployer"
  ) {
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405, headers);
    }
    return handleDeployerRequest(request, env, headers);
  }

  // ── Meme alerts listing — GET only, paginated, time-filtered. ─
  // Read-only public endpoint used by the calibration job. Returns
  // alerts in the [since, until) window, up to `limit` (max 1000),
  // with a continuation cursor. No secrets required.
  if (parts.length === 2 && parts[0] === "meme" && parts[1] === "alerts") {
    if (request.method !== "GET") {
      return jsonResponse({ error: "Method not allowed" }, 405, headers);
    }
    if (!env || !env.MEME_ALERTS) {
      return jsonResponse(
        { error: "Meme alert storage not configured" },
        503,
        headers,
      );
    }

    const since = Number(url.searchParams.get("since")) || 0;
    const until =
      Number(url.searchParams.get("until")) || Number.MAX_SAFE_INTEGER;
    const limit = Math.min(1000, Number(url.searchParams.get("limit")) || 500);
    const cursor = url.searchParams.get("cursor") || undefined;

    const result = await env.MEME_ALERTS.list({
      prefix: "weaver:meme:alert:v2:",
      limit,
      cursor,
    });

    const alerts = [];
    for (const key of result.keys) {
      const keyParts = key.name.split(":");
      // ["weaver", "meme", "alert", "v2", "<ts>", "<chain>", "<address>"]
      const observedAtMs = Number(keyParts[4]);
      if (!Number.isFinite(observedAtMs)) continue;
      if (observedAtMs < since || observedAtMs >= until) continue;
      const value = await env.MEME_ALERTS.get(key.name);
      if (!value) continue;
      try {
        alerts.push(JSON.parse(value));
      } catch {
        /* skip malformed records */
      }
    }

    return jsonResponse(
      {
        alerts,
        cursor: result.cursor || null,
        list_complete: result.list_complete,
        scanned: result.keys.length,
        window: { since, until },
      },
      200,
      headers,
    );
  }

  // ── Meme alert persistence — POST only, exact path match. ────
  // Persists a browser-side gem alert to KV for the calibration job.
  // handleMemeAlert builds its own Response without CORS headers;
  // re-emit with the headers computed at the top of handleRequest.
  if (parts.length === 2 && parts[0] === "meme" && parts[1] === "alert") {
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405, headers);
    }
    const res = await handleMemeAlert(request, env);
    const merged = new Headers(res.headers);
    for (const [k, v] of Object.entries(headers)) merged.set(k, v);
    return new Response(res.body, { status: res.status, headers: merged });
  }

  // ── Generic relay — /proxy?url=… host-allowlisted, cached. ───
  if (parts.length === 1 && parts[0] === "proxy") {
    if (request.method !== "GET" && request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405, headers);
    }
    return relayAllowedProxy(request, url, headers, ctx, env);
  }

  // ── GoPlus routes — GET only, path-based. ────────────────────
  const isGoplusEvm = parts[0] === "goplus" && parts[1] === "evm" && !!parts[2];
  const isGoplusSolana = parts[0] === "goplus" && parts[1] === "solana";

  if (isGoplusEvm || isGoplusSolana) {
    if (request.method !== "GET") {
      return jsonResponse({ error: "Method not allowed" }, 405, headers);
    }

    const contractAddresses = url.searchParams.get("contract_addresses");
    if (!contractAddresses) {
      return jsonResponse(
        { error: "Missing contract_addresses query param" },
        400,
        headers,
      );
    }

    if (isGoplusEvm) {
      const chainId = parts[2];
      if (!ALLOWED_EVM_CHAIN_IDS.has(chainId)) {
        return jsonResponse(
          { error: `Unsupported chain id: ${chainId}` },
          400,
          headers,
        );
      }
      const upstream = `${GOPLUS_EVM_BASE}/${chainId}?contract_addresses=${encodeURIComponent(contractAddresses)}`;
      return relay(upstream, headers, env);
    }

    const upstream = `${GOPLUS_SOLANA_BASE}?contract_addresses=${encodeURIComponent(contractAddresses)}`;
    return relay(upstream, headers, env);
  }

  return jsonResponse({ error: "Not found" }, 404, headers);
}

export { handleRequest };

export default {
  fetch: (request, env, ctx) => handleRequest(request, env, ctx),
};
