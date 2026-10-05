// POST /meme/alert — persists a browser-side gem alert so the
// calibration job can later join it with snapshot-worker
// observations of the same token.
//
// Storage: Workers KV, binding MEME_ALERTS.
//   Key:   weaver:meme:alert:v1:<chain>:<address>:<observedAtMs>
//   TTL:   90 days (matches RETENTION_SECONDS in meme-snapshot-store.js)

const RETENTION_SECONDS = 90 * 24 * 60 * 60;
const PREFIX = "weaver:meme:alert:v1:";

export async function handleMemeAlert(request, env) {
  if (request.method !== "POST")
    return json({ error: "method not allowed" }, 405);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const a = body && body.assessment;
  const chain = a && a.identity && a.identity.chain;
  const address = a && a.identity && a.identity.tokenAddress;
  const observedAtMs = a && a.observedAtMs;

  if (typeof chain !== "string" || !chain)
    return json({ error: "missing chain" }, 400);
  if (typeof address !== "string" || !address)
    return json({ error: "missing address" }, 400);
  if (!Number.isFinite(observedAtMs))
    return json({ error: "missing observedAtMs" }, 400);

  const market = (body && body.market) || {};
  if (!Number.isFinite(market.priceUsd) || market.priceUsd <= 0) {
    return json({ error: "missing or invalid market.priceUsd" }, 400);
  }

  const key = `${PREFIX}${chain.toLowerCase()}:${address}:${observedAtMs}`;
  const record = {
    schemaVersion: "meme-alert-v1",
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
