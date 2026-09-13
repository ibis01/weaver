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
// acting as an open "proxy any URL" relay (which is what makes public
// proxies risky to depend on in the first place — see Weaver
// Constitution §2.6, privacy-first / no unnecessary third parties).
//
// Routes (path-based, NOT a generic ?url= passthrough by design):
//   GET /goplus/evm/:chainId?contract_addresses=0x...
//   GET /goplus/solana?contract_addresses=...
//
// Deploy: see cf-worker/README.md in this folder.

// Only these origins may call this worker. Add your GitHub Pages URL
// and/or custom domain here before deploying. Keep this list tight —
// it's what stops a stranger from finding your workers.dev URL and
// riding your free quota.
const ALLOWED_ORIGINS = [
  "https://ibis01.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:5500",
  // Add your production domain here, e.g. "https://weaver.yourdomain.com"
];

const GOPLUS_EVM_BASE = "https://api.gopluslabs.io/api/v1/token_security";
const GOPLUS_SOLANA_BASE =
  "https://api.gopluslabs.io/api/v1/solana/token_security";

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

function corsHeaders(origin) {
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : "null";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
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

async function relay(upstreamUrl, headers) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
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

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin") || "";
    const headers = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }
    if (request.method !== "GET") {
      return jsonResponse({ error: "Method not allowed" }, 405, headers);
    }
    if (!ALLOWED_ORIGINS.includes(origin)) {
      return jsonResponse({ error: "Origin not allowed" }, 403, headers);
    }

    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean); // e.g. ["goplus","evm","1"]
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
  },
};
