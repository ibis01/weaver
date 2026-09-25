// ================================================================
// cf-worker/index.js – Weaver's own CORS proxy (replaces public
// proxies like allorigins.win / corsproxy.io / codetabs.com)
// ================================================================
//
// Routes (path-based, NOT a generic ?url= passthrough by design):
//   GET  /goplus/evm/:chainId?contract_addresses=0x...
//   GET  /goplus/solana?contract_addresses=...
//   POST /bitquery/deployer    body: { chain, deployerAddress }
//   GET/POST /proxy?url=...    host-allowlisted market/news relay
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
//   The market/news relay exists because CoinGecko, Binance, and
//   alternative.me do not send CORS headers, so a browser cannot
//   fetch them directly. Unlike the GoPlus and Bitquery routes, the
//   destination URL is client-supplied. To keep this from becoming
//   an open proxy, every target host must appear in
//   ALLOWED_PROXY_HOSTS. A request to any other host returns 403
//   with the rejected hostname in the body, before any upstream
//   connection is attempted. This makes SSRF to localhost, RFC1918
//   ranges, and Cloudflare metadata endpoints structurally
//   impossible — those hostnames simply are not on the list.
//
//   HTTPS-only, no redirects followed implicitly, no client headers
//   forwarded except Content-Type on POST. The client's Origin is
//   still gated by ALLOWED_ORIGINS above.
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

// Only these origins may call this worker from a browser. Add your
// GitHub Pages URL and/or custom domain here before deploying.
// Note: this is a CORS check, not authentication — see the security
// note above. Requests with NO Origin header (curl, server-side
// fetch, Wrangler tail, etc.) bypass this list by design; they are
// not browser callers and cannot be gated by CORS.
const ALLOWED_ORIGINS = [
  "https://ibis01.github.io",
  "http://localhost:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  // Add your production domain here, e.g. "https://weaver.yourdomain.com"
];

const GOPLUS_EVM_BASE = "https://api.gopluslabs.io/api/v1/token_security";
const GOPLUS_SOLANA_BASE =
  "https://api.gopluslabs.io/api/v1/solana/token_security";

// Bitquery GraphQL endpoint. Verify the exact host against current
// Bitquery documentation immediately before activation; the endpoint
// has moved in the past.
const BITQUERY_ENDPOINT = "https://streaming.bitquery.io/graphql";

// EVM chain IDs Shield already supports client-side — kept in sync
// with js/features/shield.js's CHAINS map. Rejecting anything not on
// this list means the worker can never be pointed at an arbitrary
// upstream, even if someone tampers with the request path.
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
// hosts in index.html's CSP. Keep the two in sync: a host the client
// is allowed to call but the Worker refuses (or vice versa) produces
// a failure mode that is confusing to debug from the browser alone.
//
// Adding an entry here widens the relay surface. Only add hosts the
// app actually calls. Never add a wildcard, a metadata endpoint
// (169.254.169.254), or a host you do not control the purpose of.
const ALLOWED_PROXY_HOSTS = new Set([
  "api.coingecko.com",
  "api.binance.com",
  "api.alternative.me",
  "api.dexscreener.com",
  "api.gopluslabs.io",
  "api.etherscan.io",
  "api.bscscan.com",
  "api.polygonscan.com",
  "api.arbiscan.io",
  "api.snowtrace.io",
  "api.solscan.io",
  "api.mainnet-beta.solana.com",
  "eth.blockscout.com",
  "mempool.space",
  "api.llama.fi",
  "api.coinpaprika.com",
  "api.coincap.io",
]);

// Bitquery network names for the chains the deployer route supports.
// This is deliberately narrower than ALLOWED_EVM_CHAIN_IDS — Bitquery
// does not have equally good creation-call coverage on every chain,
// AND the V2 streaming endpoint does not support every EVM chain.
// Chains absent from this map are rejected before any upstream call.
//
// SUPPORTED ON V2 (streaming.bitquery.io):
//   eth, bsc, base, arbitrum, optimism, matic — verified against
//   Bitquery's "Bitquery in One Page" reference, which states V2
//   covers "exactly these chains and no others":
//   eth, bsc, base, arbitrum, optimism, matic, robinhood, arc,
//   arc_testnet.
//
// EXPLICITLY NOT SUPPORTED ON V2:
//   avalanche, fantom, cronos, gnosis — these are V1-only on
//   Bitquery. Querying them on the V2 streaming endpoint produces
//   an upstream error that surfaces as HTTP 502. Do not add them
//   here without first confirming V2 support and, if supported,
//   a live query. A 502 on a mapped chain is worse than a 400
//   "unsupported chain" because it looks like a transient failure.
//
// If a chain is removed from this map, the route returns a clean
// 400 with "Unsupported chain: <name>" before any network call.
const CHAIN_TO_BITQUERY_NETWORK = {
  ethereum: "eth",
  bsc: "bsc",
  base: "base",
  arbitrum: "arbitrum",
  polygon: "matic",
  optimism: "optimism",
};

// Fixed GraphQL query. The client never sees or supplies this. Only
// the variables (network, address, limit) are per-request. A change
// to the query is a code change here, reviewable in a diff, not a
// runtime input.
//
// EVIDENCE SEMANTICS — do not remove Receipt.ContractAddress:
//   Bitquery distinguishes two creation cases (see
//   docs.bitquery.io/docs/blockchain/Ethereum/calls/contract-creation):
//     - Top-level deployment: the deployed address is
//       Receipt.ContractAddress.
//     - Factory/internal deployment: the deployed address is
//       Call.To on the create call.
//   Requesting only Call.To would silently misclassify every
//   top-level deployment. Requesting both lets the client apply
//   an explicit extraction policy (see deployer-graph.js).
//
// dataset: realtime — see the header note. Do not switch this to
// `combined` or `archive` without confirming the Bitquery plan covers
// it, or every call will 502 with "access restricted".
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

// GoPlus returns HTTP 200 with { code: 4029 } when rate-limiting. We
// must inspect the body, not just the status, and retry with backoff.
const GOPLUS_RATE_LIMIT_CODE = 4029;
const GOPLUS_MAX_ATTEMPTS = 3;
const GOPLUS_BASE_DELAY_MS = 400;

// ----------------------------------------------------------------
// CORS
// ----------------------------------------------------------------
//
// The `Vary: Origin` header is set unconditionally so Cloudflare's
// edge cache never serves a cached response to a different origin.
//
// `Access-Control-Allow-Origin` is only meaningful to a browser.
// For non-browser callers (no Origin) we send "null" — no browser
// will read it, and curl ignores it entirely.
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

// ----------------------------------------------------------------
// Upstream relays
// ----------------------------------------------------------------

// Small helpers for the retry loop.
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(ms) {
  return Math.floor(Math.random() * ms);
}

// One attempt at fetching a GoPlus URL. Returns { status, text } or
// throws on network error/timeout.
async function fetchGoPlusOnce(upstreamUrl, env) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  // Attach the GoPlus API key when configured. Without it, the request
  // still works but uses the shared public channel and is subject to
  // the aggressive shared-IP rate limit. With it, the request uses a
  // dedicated access token and a higher per-minute limit.
  const headers = { "User-Agent": "WeaverProxy/1.0" };
  if (env && typeof env.GOPLUS_KEY === "string" && env.GOPLUS_KEY) {
    headers.Authorization = `Bearer ${env.GOPLUS_KEY}`;
  }

  try {
    const resp = await fetch(upstreamUrl, {
      signal: controller.signal,
      headers,
    });
    const text = await resp.text();
    return { status: resp.status, text };
  } finally {
    clearTimeout(timeout);
  }
}

// GET relay — GoPlus routes. Retries on rate-limit (code 4029) with
// exponential backoff + jitter, then returns HTTP 429 if still limited.
//
// env is threaded through so fetchGoPlusOnce can attach the optional
// GOPLUS_KEY. Passing env even when the key is absent is safe — the
// helper treats a missing key as "unauthenticated request".
async function relay(upstreamUrl, headers, env) {
  let lastPayload = null;

  for (let attempt = 0; attempt < GOPLUS_MAX_ATTEMPTS; attempt++) {
    let result;
    try {
      result = await fetchGoPlusOnce(upstreamUrl, env);
    } catch (e) {
      return jsonResponse(
        { code: 0, message: `Upstream fetch failed: ${e.message}` },
        502,
        headers,
      );
    }

    // Try to parse. Non-JSON means we can't inspect the code — pass it
    // through verbatim and don't retry.
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

    // Rate-limited. Remember the payload, and retry unless we're on
    // the last attempt.
    lastPayload = parsed;
    if (attempt < GOPLUS_MAX_ATTEMPTS - 1) {
      const delay = GOPLUS_BASE_DELAY_MS * Math.pow(2, attempt) + jitter(250);
      await sleep(delay);
    }
  }

  // All attempts rate-limited. Return an honest 429 so the client can
  // surface a distinct "try again shortly" message.
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

// POST relay for Bitquery. Constructs the outgoing request entirely
// from Worker-controlled state:
//   - the URL is the fixed endpoint
//   - the method is POST
//   - the Authorization header carries the Worker secret
//   - the body is the constructed query + variables
//
// Client-supplied headers are NOT forwarded. A client that sends its
// own Authorization header has no effect: only the Worker-constructed
// header reaches the upstream.
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
    variables: {
      network,
      address,
      limit: DEPLOYER_QUERY_LIMIT,
    },
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let upstreamResp;
  try {
    upstreamResp = await fetch(BITQUERY_ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.BITQUERY_KEY}`,
        "User-Agent": "WeaverProxy/1.0",
        // Deliberately no client headers — see the comment above.
      },
      body,
    });
  } catch (e) {
    return jsonResponse(
      { error: `Bitquery fetch failed: ${e.message}` },
      502,
      headers,
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!upstreamResp.ok) {
    // The upstream body is not reflected — it may contain debug
    // output and, in some failure modes, fragments of the request.
    return jsonResponse(
      { error: `Bitquery upstream returned HTTP ${upstreamResp.status}` },
      502,
      headers,
    );
  }

  let parsed;
  try {
    parsed = await upstreamResp.json();
  } catch (e) {
    return jsonResponse(
      { error: "Bitquery returned a non-JSON response" },
      502,
      headers,
    );
  }

  // A GraphQL response can carry an `errors` array alongside (or
  // instead of) `data`. A caller that received `{ data: null, errors:
  // [...] }` and tried to build a deployer profile from it would
  // produce an empty profile rather than an honest error. Reject.
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
// The only client-controlled pieces are the target URL (host-checked
// against ALLOWED_PROXY_HOSTS) and the optional POST body. Headers
// are Worker-controlled: Accept plus, on POST, Content-Type. A
// client cannot smuggle its own Authorization or Cookie through this
// route.
async function relayAllowedProxy(request, url, headers) {
  const target = url.searchParams.get("url");
  if (!target) {
    return jsonResponse({ error: "Missing url param" }, 400, headers);
  }

  let targetUrl;
  try {
    targetUrl = new URL(target);
  } catch {
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

  // The URL is already known-safe: its hostname is on the allowlist,
  // its scheme is https, and its structure parsed. No need to
  // re-check for localhost/RFC1918 — those hostnames are not on the
  // list, so they cannot reach this branch.
  const method = request.method === "POST" ? "POST" : "GET";
  const upstreamHeaders = {
    Accept: "application/json",
    "User-Agent": "WeaverProxy/1.0",
  };

  const init = { method, headers: upstreamHeaders };
  if (method === "POST") {
    // Read as text so the body is forwarded verbatim regardless of
    // what the caller sent. JSON is the only shape the app uses, and
    // re-stringifying a parsed body risks reordering keys.
    init.body = await request.text();
    init.headers["Content-Type"] = "application/json";
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const upstream = await fetch(targetUrl.toString(), {
      ...init,
      signal: controller.signal,
    });
    const text = await upstream.text();
    const contentType =
      upstream.headers.get("content-type") || "application/json";
    return new Response(text, {
      status: upstream.status,
      headers: {
        "Content-Type": contentType,
        ...headers,
      },
    });
  } catch (e) {
    return jsonResponse(
      { error: `Upstream fetch failed: ${e.message}` },
      502,
      headers,
    );
  } finally {
    clearTimeout(timer);
  }
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
//
// Order of checks (each returns early):
//
//   1. OPTIONS               → 204 preflight
//   2. bad Origin            → 403
//   3. /bitquery/deployer (non-POST) → 405
//   4. /bitquery/deployer (POST)     → handleDeployerRequest
//   5. /proxy (missing url)          → 400
//   6. /proxy (host not allowed)     → 403
//   7. /proxy (GET/POST)             → relayAllowedProxy
//   8. /goplus/* (non-GET)           → 405
//   9. /goplus/* (GET, no contract_addresses) → 400
//  10. /goplus/evm/:id (GET, has param)         → relay
//  11. /goplus/solana (GET, has param)          → relay
//  12. anything else                            → 404
//
// Route matching happens BEFORE the contract_addresses check so
// that a request to an unknown path returns 404, not 400. The
// contract_addresses requirement applies only to routes the Worker
// actually serves.
async function handleRequest(request, env) {
  // Read Origin case-insensitively. Headers.get() is already
  // case-insensitive, but we normalise to "" so the downstream logic
  // only has to test one value.
  const originHeader = request.headers.get("Origin");
  const origin = originHeader || "";
  const headers = corsHeaders(origin);

  // Preflight. Browsers send OPTIONS with an Origin; curl almost
  // never does. We answer either way, but only advertise the
  // requesting origin if it is on the allowlist.
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  // Access-control gate.
  //
  // - No Origin header      -> non-browser caller (curl, server-side
  //                            fetch, CI). CORS does not apply, so we
  //                            let it through. The response carries
  //                            `Access-Control-Allow-Origin: null`,
  //                            which no browser will honour, so this
  //                            cannot be abused by a webpage.
  // - Origin not allowlisted -> browser caller from a hostile site.
  //                            Reject with 403. The body is safe to
  //                            return: it contains no secrets, and a
  //                            browser on a disallowed origin can't
  //                            read it anyway.
  // - Origin allowlisted    -> proceed.
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

  // ── Generic relay — /proxy?url=… host-allowlisted. ───────────
  //
  // Only GET and POST are accepted; anything else (PUT, DELETE,
  // PATCH, etc.) is rejected before touching the upstream.
  if (parts.length === 1 && parts[0] === "proxy") {
    if (request.method !== "GET" && request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405, headers);
    }
    return relayAllowedProxy(request, url, headers);
  }

  // ── GoPlus routes — GET only, path-based. ────────────────────
  //
  // Path shape is evaluated first so that:
  //   - non-GET methods on a valid GoPlus path return 405
  //   - missing contract_addresses on a valid GoPlus path returns 400
  //   - any other path (including /nope) falls through to 404
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

    // isGoplusSolana
    const upstream = `${GOPLUS_SOLANA_BASE}?contract_addresses=${encodeURIComponent(contractAddresses)}`;
    return relay(upstream, headers, env);
  }

  // ── Unknown path — 404, regardless of query params or method. ─
  return jsonResponse({ error: "Not found" }, 404, headers);
}

export { handleRequest };

export default {
  fetch: handleRequest,
};
