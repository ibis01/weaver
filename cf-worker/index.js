// ================================================================
// cf-worker/index.js – Weaver's own CORS proxy (replaces public
// proxies like allorigins.win / corsproxy.io / codetabs.com)
// ================================================================
//
// Why this exists: GoPlus's API doesn't send CORS headers, so a
// browser can't call it directly. Weaver was relying on free public
// CORS-relay services as a workaround — flaky, rate-limited, and a
// dependency you don't control. This Worker does the same job, but
// it's yours: no rate-limit surprises, no relay disappearing, and it
// forwards to a small, explicit allowlist of upstreams rather than
// acting as an open "proxy any URL" relay.
//
// Routes (path-based, NOT a generic ?url= passthrough by design):
//   GET  /goplus/evm/:chainId?contract_addresses=0x...
//   GET  /goplus/solana?contract_addresses=...
//   POST /bitquery/deployer    body: { chain, deployerAddress }
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
// SECURITY NOTE — ORIGIN IS NOT A RATE LIMITER:
//   The ALLOWED_ORIGINS check is a CORS access-control check. It
//   prevents a browser on an unauthorized origin from reading the
//   response. It does NOT prevent a scripted caller from sending a
//   spoofed Origin header. There is no application-level rate
//   limiting in this Worker. Concrete abuse protection should be
//   applied at the deployment level (Cloudflare Rate Limiting
//   Rules scoped to /bitquery/deployer). Treat the origin check as
//   an access-control gate, never as abuse prevention.
//
// Deploy: see cf-worker/README.md in this folder.

// Only these origins may call this worker. Add your GitHub Pages URL
// and/or custom domain here before deploying. Keep this list tight.
// Note: this is a CORS check, not authentication — see the security
// note above.
const ALLOWED_ORIGINS = [
  "https://ibis01.github.io",
  "http://localhost:3000",
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

// Bitquery network names for the chains the deployer route supports.
// This is deliberately narrower than ALLOWED_EVM_CHAIN_IDS — Bitquery
// does not have equally good creation-call coverage on every chain.
// Chains absent from this map are rejected before any upstream call.
const CHAIN_TO_BITQUERY_NETWORK = {
  ethereum: "eth",
  bsc: "bsc",
  base: "base",
  arbitrum: "arbitrum",
  polygon: "matic",
  avalanche: "avalanche",
  optimism: "optimism",
};

// Fixed GraphQL query. The client never sees or supplies this. Only
// the variables (network, address, limit) are per-request. A change
// to the query is a code change here, reviewable in a diff, not a
// runtime input.
const DEPLOYER_QUERY = `query DeployerContracts(
  $network: evm_network!
  $address: String!
  $limit: Int!
) {
  EVM(network: $network, dataset: combined) {
    Calls(
      limit: { count: $limit }
      orderBy: { ascending: Block_Time }
      where: { Call: { Create: true, From: { is: $address } } }
    ) {
      Call {
        To
        From
        Create
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

// GET relay — unchanged from the original Worker. Used only by the
// GoPlus routes.
async function relay(upstreamUrl, headers) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const upstreamResp = await fetch(upstreamUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "WeaverProxy/1.0" },
    });
    const body = await upstreamResp.text();
    return new Response(body, {
      status: upstreamResp.status,
      headers: { "Content-Type": "application/json", ...headers },
    });
  } catch (e) {
    return jsonResponse(
      { code: 0, message: `Upstream fetch failed: ${e.message}` },
      502,
      headers,
    );
  } finally {
    clearTimeout(timeout);
  }
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

async function handleRequest(request, env) {
  const origin = request.headers.get("Origin") || "";
  const headers = corsHeaders(origin);

  if (request.method === "OPTIONS") {
    return new Response(null, { headers });
  }

  if (!ALLOWED_ORIGINS.includes(origin)) {
    return jsonResponse({ error: "Origin not allowed" }, 403, headers);
  }

  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);

  // Bitquery route — POST only, exact path match.
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

  // All other routes are GET-only.
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

  if (parts[0] === "goplus" && parts[1] === "evm" && parts[2]) {
    const chainId = parts[2];
    if (!ALLOWED_EVM_CHAIN_IDS.has(chainId)) {
      return jsonResponse(
        { error: `Unsupported chain id: ${chainId}` },
        400,
        headers,
      );
    }
    const upstream = `${GOPLUS_EVM_BASE}/${chainId}?contract_addresses=${encodeURIComponent(contractAddresses)}`;
    return relay(upstream, headers);
  }

  if (parts[0] === "goplus" && parts[1] === "solana") {
    const upstream = `${GOPLUS_SOLANA_BASE}?contract_addresses=${encodeURIComponent(contractAddresses)}`;
    return relay(upstream, headers);
  }

  return jsonResponse({ error: "Not found" }, 404, headers);
}

export { handleRequest };

export default {
  fetch: handleRequest,
};
