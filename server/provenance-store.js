const PREFIX = "sm.provenance.v1:";
const INDEX_KEY = PREFIX + "index";
const MAX_INDEX = 2000;
const TTL_SECONDS = 7 * 24 * 60 * 60;

function createProvenanceStore(options = {}) {
  const client = options.client;
  if (!client) throw new Error("createProvenanceStore requires a connected client");

  async function record(cycle) {
    if (!cycle || typeof cycle !== "object") return null;
    const symbol = typeof cycle.symbol === "string" ? cycle.symbol.toUpperCase() : "UNKNOWN";
    const tokenAddress = typeof cycle.tokenAddress === "string" ? cycle.tokenAddress.toLowerCase() : "";
    const ranAt = Number.isFinite(cycle.ranAt) ? cycle.ranAt : Date.now();
    const id = `${ranAt}:${Math.random().toString(36).slice(2, 8)}`;
    const key = `${PREFIX}${symbol.toLowerCase()}:${id}`;
    const payload = JSON.stringify({
      schemaVersion: "provenance-v1",
      symbol, tokenAddress, ranAt,
      result: cycle.result,
    });
    try {
      await client.set(key, payload, { EX: TTL_SECONDS });
      await client.zAdd(INDEX_KEY, { score: ranAt, value: key });
      const size = await client.zCard(INDEX_KEY);
      if (size > MAX_INDEX) await client.zRemRangeByRank(INDEX_KEY, 0, size - MAX_INDEX - 1);
      console.log(`[sm.prov] recorded ${symbol} → ${key}`);
      return key;
    } catch (e) {
      console.error("[sm.prov] record failed:", e.message);
      return null;
    }
  }

  async function list({ symbol, limit = 20 } = {}) {
    limit = Math.max(1, Math.min(limit, 200));
    let keys;
    try {
      if (symbol) {
        const upper = String(symbol).toUpperCase();
        const prefix = `${PREFIX}${upper.toLowerCase()}:`;
        const all = await client.keys(`${prefix}*`);
        all.sort().reverse();
        keys = all.slice(0, limit);
      } else {
        keys = await client.zRange(INDEX_KEY, -limit, -1, { REV: true });
      }
    } catch (e) {
      console.error("[sm.prov] list failed:", e.message);
      return [];
    }
    const out = [];
    for (const k of keys) {
      try { const v = await client.get(k); if (v) out.push(JSON.parse(v)); } catch {}
    }
    return out;
  }

  async function count() {
    try { return await client.zCard(INDEX_KEY); } catch { return 0; }
  }

  return { record, list, count };
}

module.exports = { createProvenanceStore };
