const { createClient } = require("redis");

const PREFIX = "weaver:meme:snapshot:v1:";
const INDEX_KEY = `${PREFIX}index`;
const RETENTION_SECONDS = 90 * 24 * 60 * 60;

function createMemeSnapshotStore(options = {}) {
  const url = options.url || process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is required for meme snapshot storage");
  const client = options.client || createClient({ url });
  let connected = false;

  async function connect() {
    if (!connected) {
      if (!client.isOpen) await client.connect();
      connected = true;
    }
    return client;
  }

  function tokenKey(chain, address) {
    if (!/^[a-z0-9_-]{1,32}$/i.test(String(chain || ""))) throw new Error("Invalid chain");
    if (!/^[a-zA-Z0-9:_-]{3,160}$/.test(String(address || ""))) throw new Error("Invalid token address");
    return `${PREFIX}${String(chain).toLowerCase()}:${address}`;
  }

  async function record(snapshot) {
    await connect();
    const chain = String(snapshot?.chain || "").toLowerCase();
    const address = String(snapshot?.address || "");
    const observedAt = new Date(snapshot?.observedAt || Date.now());
    if (!Number.isFinite(observedAt.getTime())) throw new Error("Invalid observedAt");
    const key = tokenKey(chain, address);
    const id = `${observedAt.getTime()}:${Math.random().toString(36).slice(2, 8)}`;
    const payload = JSON.stringify({
      ...snapshot,
      chain,
      address,
      observedAt: observedAt.toISOString(),
      schemaVersion: "meme-snapshot-v1",
    });
    await client.multi()
      .hSet(`${key}:records`, id, payload)
      .zAdd(`${key}:timeline`, { score: observedAt.getTime(), value: id })
      .zAdd(INDEX_KEY, { score: observedAt.getTime(), value: `${chain}:${address}` })
      .expire(`${key}:records`, RETENTION_SECONDS)
      .expire(`${key}:timeline`, RETENTION_SECONDS)
      .exec();
    return { id, key, observedAt: observedAt.toISOString() };
  }

  async function list(chain, address, options = {}) {
    await connect();
    const key = tokenKey(chain, address);
    const limit = Math.max(1, Math.min(500, Number(options.limit) || 100));
    const ids = await client.zRange(`${key}:timeline`, 0, limit - 1);
    if (!ids.length) return [];
    const values = await client.hmGet(`${key}:records`, ids);
    return values.filter(Boolean).map((value) => JSON.parse(value));
  }

  async function close() {
    if (client.isOpen) await client.quit();
    connected = false;
  }

  return { connect, record, list, close, health: async () => {
    await connect();
    return { ok: (await client.ping()) === "PONG", retentionSeconds: RETENTION_SECONDS };
  }};
}

module.exports = { createMemeSnapshotStore, RETENTION_SECONDS };
