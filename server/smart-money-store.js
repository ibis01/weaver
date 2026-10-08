const { createClient } = require("redis");

const PREFIX = "sm.";
const FLUSH_INTERVAL_MS = 5000;

function createSmartMoneyStore(options = {}) {
  const url = options.url || process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is required");
  console.log("[sm.store] creating client for", url);
  const client = options.client || createClient({ url });
  const memory = new Map();
  const pending = new Map();
  let connected = false;
  let connectPromise = null;
  let flushTimer = null;
  let flushInFlight = null;

  client.on("error", (e) => console.error("[sm.store] redis client error:", e.message));
  client.on("connect", () => console.log("[sm.store] redis socket connect"));
  client.on("ready", () => console.log("[sm.store] redis ready"));

  async function connect() {
    if (connected) return client;
    if (!connectPromise) {
      connectPromise = (async () => {
        if (!client.isOpen) await client.connect();
        connected = true;
        console.log("[sm.store] redis connected");
      })().catch((e) => {
        connectPromise = null;
        throw e;
      });
    }
    await connectPromise;
    return client;
  }

  async function hydrate() {
    await connect();
    const keys = await client.keys(`${PREFIX}*`);
    for (const k of keys) {
      const v = await client.get(k);
      if (v !== null) {
        try { memory.set(k, JSON.parse(v)); } catch {}
      }
    }
    console.log(`[sm.store] hydrated ${memory.size} keys`);
  }

  async function _doFlush() {
    if (!pending.size) return 0;
    const writes = [...pending.entries()];
    pending.clear();
    try {
      await connect();
    } catch (e) {
      console.error("[sm.store] flush: connect failed:", e.message);
      for (const [k, v] of writes) pending.set(k, v);
      return 0;
    }
    let ok = 0;
    for (const [k, v] of writes) {
      try {
        if (v === undefined) {
          await client.del(k);
        } else {
          const payload = JSON.stringify(v);
          await client.set(k, payload);
        }
        ok++;
      } catch (e) {
        console.error(`[sm.store] set ${k} failed:`, e.message);
        pending.set(k, v);
      }
    }
    console.log(`[sm.store] flushed ${ok}/${writes.length} keys (${writes.map(([k])=>k).join(", ")})`);
    return ok;
  }

  async function flush() {
    if (flushInFlight) return flushInFlight;
    flushInFlight = _doFlush().finally(() => { flushInFlight = null; });
    return flushInFlight;
  }

  function startFlush() {
    if (flushTimer) return;
    flushTimer = setInterval(() => {
      flush().catch((e) => console.error("[sm.store] interval flush failed:", e.message));
    }, FLUSH_INTERVAL_MS);
    flushTimer.unref();
  }

  function get(key, fallback) {
    return memory.has(key) ? memory.get(key) : fallback;
  }
  function set(key, value) {
    memory.set(key, value);
    pending.set(key, value);
    flush().catch((e) => console.error("[sm.store] immediate flush failed:", e.message));
  }
  function del(key) {
    memory.delete(key);
    pending.set(key, undefined);
    flush().catch((e) => console.error("[sm.store] immediate delete flush failed:", e.message));
  }

  async function stop() {
    if (flushTimer) clearInterval(flushTimer);
    flushTimer = null;
    try { await flush(); } catch {}
    if (client.isOpen) await client.quit();
  }

  // Synchronous write: awaits the Redis SET before returning.
  // Use this when the write must survive an imminent restart.
  async function setSync(key, value) {
    await connect();
    memory.set(key, value);
    const payload = JSON.stringify(value);
    console.log("[sm.store] setSync →", key, "(" + payload.length + " bytes)");
    try {
      const r = await client.set(key, payload);
      console.log("[sm.store] setSync ←", key, r);
      return true;
    } catch (e) {
      console.error("[sm.store] setSync FAILED", key, e.message);
      pending.set(key, value);
      return false;
    }
  }

  return { connect, hydrate, flush, startFlush, get, set, setSync, delete: del, stop, _memory: memory };
}

module.exports = { createSmartMoneyStore };
