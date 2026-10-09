// Local read-only mirror of the provenance trail in Redis.
// Serves GET /provenance with permissive CORS so the browser app can
// fetch it during local development without depending on the CF Worker.
const express = require("express");
const { createClient } = require("redis");

const PORT = Number(process.env.LOCAL_PROVENANCE_PORT || 3002);
const INDEX_KEY = "sm.provenance.v1:index";
const PREFIX = "sm.provenance.v1:";

const app = express();

// CORS for every route
app.use((req, res, next) => {
  res.set("access-control-allow-origin", "*");
  res.set("access-control-allow-methods", "GET, POST, OPTIONS");
  res.set("access-control-allow-headers", "content-type, accept");
  res.set("access-control-max-age", "86400");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

let client = null;

async function getClient() {
  if (client && client.isOpen) return client;
  client = createClient({ url: "redis://127.0.0.1:6379" });
  client.on("error", (e) => console.error("[local-prov] redis error:", e.message));
  await client.connect();
  console.log("[local-prov] redis connected");
  return client;
}

app.get("/provenance", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const symbol = typeof req.query.symbol === "string" && req.query.symbol.trim()
      ? req.query.symbol.trim().toLowerCase()
      : null;

    const c = await getClient();
    let keys;
    if (symbol) {
      keys = (await c.keys(`${PREFIX}${symbol}:*`)).sort().reverse().slice(0, limit);
    } else {
      keys = await c.zRange(INDEX_KEY, -limit, -1, { REV: true });
    }

    const entries = [];
    for (const k of keys) {
      const v = await c.get(k);
      if (!v) continue;
      try { entries.push(JSON.parse(v)); } catch {}
    }

    entries.sort((a, b) => (Number(b.ranAt) || 0) - (Number(a.ranAt) || 0));

    // Add a normalized status + reason so the card can render without
    // recomputing them client-side.
    for (const e of entries) {
      const r = e.result || {};
      if (e.status) continue; // already set by worker
      if (r.ok === true && r.signal && r.signal.type === "SMART_MONEY_ENTRY") {
        e.status = "SIGNAL"; e.reason = "smart-money-entry";
      } else if (r.ok === true) {
        e.status = "REFUSED_ANALYSIS";
        e.reason = (r.convergence && r.convergence.reason) || "no-signal";
      } else {
        e.status = "REFUSED_PIPELINE";
        e.reason = r.reason || "unknown";
      }
    }

    res.json({ entries: entries.slice(0, limit) });
  } catch (e) {
    console.error("[local-prov] /provenance failed:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get("/health", (req, res) => res.json({ ok: true, port: PORT }));

app.listen(PORT, () => console.log(`[local-prov] listening on ${PORT}`));
