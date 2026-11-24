// POST /meme/alert — persists a browser-side gem alert so the
// calibration job can later join it with snapshot-worker
// observations of the same token.
//
// Storage: Workers KV, binding MEME_ALERTS.
//   Key:   weaver:meme:alert:v2:<observedAtMs>:<chain>:<address>
//          (timestamp-first, so lexicographic listing is chronological)
//   TTL:   90 days (matches RETENTION_SECONDS in meme-snapshot-store.js)

const RETENTION_SECONDS = 90 * 24 * 60 * 60;
const PREFIX = "weaver:meme:alert:v2:";

// ── Write-path hardening (added 2026-11-24 audit) ──────────────────
// The route is unauthenticated by design (public client), so the store
// must defend itself: cap payload size, validate the key-building
// fields, bound the timestamp, and sanity-check any embedded score.
// These are structural sanity gates only — the frozen ≥70 threshold
// and meme-opportunity-v1 scoring are NOT re-implemented or enforced
// here (that remains the client/protocol's role; see constitution).
const MAX_BODY_CHARS = 256 * 1024; // ~256KB — orders of magnitude above
// legitimate alert payloads (a few KB), far below the KV value limit.
const CHAIN_PATTERN = /^[a-z0-9-]{2,16}$/;
// Covers 0x-prefixed EVM hex (42 chars) and base58 Solana (32-44);
// deliberately lenient across other client-supported chains.
const ADDRESS_PATTERN = /^[0-9a-zA-Z]{6,96}$/;
const MAX_FUTURE_SKEW_MS = 24 * 60 * 60 * 1000; // tolerate client clock drift
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // matches 90d retention

function validScoreValue(v) {
  return v == null || (Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 100);
}

export async function handleMemeAlert(request, env) {
  if (request.method !== "POST")
    return json({ error: "method not allowed" }, 405);

  if (!env || !env.MEME_ALERTS) {
    return json(
      {
        error:
          "Meme alert storage not configured (MEME_ALERTS binding missing)",
      },
      503,
    );
  }

  let raw;
  try {
    raw = await request.text();
  } catch {
    return json({ error: "invalid body" }, 400);
  }
  if (raw.length > MAX_BODY_CHARS) {
    return json({ error: "body too large" }, 413);
  }
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const a = body && body.assessment;
  const chain = a && a.identity && a.identity.chain;
  const address = a && a.identity && a.identity.tokenAddress;
  const observedAtMs = a && a.observedAtMs;

  if (typeof chain !== "string" || !CHAIN_PATTERN.test(chain.toLowerCase()))
    return json({ error: "invalid chain" }, 400);
  if (typeof address !== "string" || !ADDRESS_PATTERN.test(address))
    return json({ error: "invalid address" }, 400);
  if (!Number.isFinite(observedAtMs))
    return json({ error: "missing observedAtMs" }, 400);
  const now = Date.now();
  if (
    observedAtMs > now + MAX_FUTURE_SKEW_MS ||
    observedAtMs < now - MAX_AGE_MS
  ) {
    return json({ error: "observedAtMs out of plausible range" }, 400);
  }
  // Score sanity: whatever scoring fields the assessment carries must be
  // numeric in [0, 100]. Purely structural — the threshold gate itself
  // is untouched.
  if (!validScoreValue(a.score) || !validScoreValue(a.scores?.opportunity)) {
    return json({ error: "invalid score value" }, 400);
  }

  const market = (body && body.market) || {};
  if (!Number.isFinite(market.priceUsd) || market.priceUsd <= 0) {
    console.warn("[meme/alert] rejected: invalid priceUsd", {
      chain,
      address,
      received: market.priceUsd,
    });
    return json({ error: "missing or invalid market.priceUsd" }, 400);
  }

  const key = `${PREFIX}${observedAtMs}:${chain.toLowerCase()}:${address}`;
  const record = {
    schemaVersion: "meme-alert-v2",
    assessment: a,
    market: {
      priceUsd: market.priceUsd,
      liquidityUsd: Number.isFinite(market.liquidityUsd)
        ? market.liquidityUsd
        : null,
      observedAt: market.observedAt || new Date(observedAtMs).toISOString(),
    },
    pairAddress: typeof body.pairAddress === "string" ? body.pairAddress : null,
    symbol: typeof body.symbol === "string" ? body.symbol : null,
    receivedAt: new Date().toISOString(),
  };

  try {
    await env.MEME_ALERTS.put(key, JSON.stringify(record), {
      expirationTtl: RETENTION_SECONDS,
    });
  } catch (e) {
    return json({ error: "storage failure", detail: e.message }, 502);
  }

  return json({ ok: true, key });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
