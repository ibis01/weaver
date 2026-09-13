// ===============================================================
//         Proxy State — Redis (optional) with in-memory fallback
// ===============================================================
//
// Redis is OPTIONAL. If REDIS_URL is not set, or the `redis` package
// is not installed, this module falls back to an in-memory store
// that implements the same rate-limit and circuit-breaker semantics.
// Local development never needs Redis.
//
// The in-memory backend is real: it enforces the rate limit and the
// circuit breaker, using a Map scoped to the process. It does not
// share state across processes, which is fine for a single-instance
// proxy. Multi-instance deployments should set REDIS_URL.
// ===============================================================

const RATE_LIMIT_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local count = redis.call('INCR', key)
if count == 1 then redis.call('PEXPIRE', key, window) end
local ttl = redis.call('PTTL', key)
return {count, ttl}
`;

const CIRCUIT_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local threshold = tonumber(ARGV[2])
local cooldown = tonumber(ARGV[3])
local state = redis.call('HMGET', key, 'failures', 'openUntil')
local failures = tonumber(state[1] or '0')
local openUntil = tonumber(state[2] or '0')
if openUntil > now then return {0, failures, openUntil} end
if openUntil > 0 then failures = 0; openUntil = 0 end
failures = failures + 1
if failures >= threshold then openUntil = now + cooldown end
redis.call('HSET', key, 'failures', failures, 'openUntil', openUntil)
redis.call('PEXPIRE', key, cooldown + 60000)
return {1, failures, openUntil}
`;

// ── In-memory backend ──────────────────────────────────────────
// Implements the same rate-limit and circuit-breaker semantics as
// the Redis backend, scoped to a single Node process.
class MemoryState {
  constructor({ namespace = "weaver" } = {}) {
    this.namespace = namespace;
    this.rates = new Map(); // key -> { count, resetAt }
    this.circuits = new Map(); // key -> { failures, openUntil }
    this.metrics = new Map(); // key -> { value, expiresAt }
    this.connected = true;
    this.backend = "memory";
  }

  key(type, value) {
    return `${this.namespace}:${type}:${value}`;
  }

  async consumeRateLimit(
    identity,
    { windowMs = 60000, maxRequests = 30 } = {},
  ) {
    const k = this.key("rate", identity);
    const now = Date.now();
    let entry = this.rates.get(k);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
    }
    entry.count += 1;
    this.rates.set(k, entry);

    return {
      allowed: entry.count <= maxRequests,
      count: entry.count,
      retryAfterMs: Math.max(entry.resetAt - now, 0),
      backend: "memory",
    };
  }

  async circuitOpen(hostname) {
    const k = this.key("circuit", hostname);
    const entry = this.circuits.get(k);
    if (!entry)
      return { open: false, failures: 0, openUntil: 0, backend: "memory" };
    const open = entry.openUntil > Date.now();
    return {
      open,
      failures: entry.failures,
      openUntil: entry.openUntil,
      backend: "memory",
    };
  }

  async recordCircuitFailure(
    hostname,
    { threshold = 5, cooldownMs = 30000 } = {},
  ) {
    const k = this.key("circuit", hostname);
    const now = Date.now();
    let entry = this.circuits.get(k) || { failures: 0, openUntil: 0 };

    // If a cooldown has expired, reset the failure counter.
    if (entry.openUntil > 0 && entry.openUntil <= now) {
      entry = { failures: 0, openUntil: 0 };
    }

    entry.failures += 1;
    if (entry.failures >= threshold) {
      entry.openUntil = now + cooldownMs;
    }
    this.circuits.set(k, entry);

    return {
      opened: entry.openUntil > now,
      failures: entry.failures,
      openUntil: entry.openUntil,
      backend: "memory",
    };
  }

  async recordCircuitSuccess(hostname) {
    this.circuits.delete(this.key("circuit", hostname));
  }

  async incrementMetric(name, { windowMs = 60000 } = {}) {
    const k = this.key(
      "metric",
      `${name}:${Math.floor(Date.now() / windowMs)}`,
    );
    const now = Date.now();
    let entry = this.metrics.get(k);
    if (!entry || entry.expiresAt <= now) {
      entry = { value: 0, expiresAt: now + windowMs * 2 };
    }
    entry.value += 1;
    this.metrics.set(k, entry);

    // Opportunistic cleanup so long-running processes don't leak.
    if (this.metrics.size > 1000) {
      for (const [key, e] of this.metrics) {
        if (e.expiresAt <= now) this.metrics.delete(key);
      }
    }

    return { value: entry.value, backend: "memory" };
  }

  async close() {
    this.rates.clear();
    this.circuits.clear();
    this.metrics.clear();
  }
}

// ── Redis backend ──────────────────────────────────────────────
class RedisState {
  constructor({ url, required = false, namespace = "weaver" } = {}) {
    this.url = url;
    this.required = required;
    this.namespace = namespace;
    this.client = null;
    this.connected = false;
    this.backend = "redis";
  }

  async connect() {
    if (!this.url) {
      if (this.required) throw new Error("REDIS_URL is required in production");
      return false;
    }

    let createClient;
    try {
      ({ createClient } = require("redis"));
    } catch (e) {
      if (this.required) {
        throw new Error(
          "REDIS_URL is set and required=true, but the `redis` package is not installed. " +
            "Run: npm install redis",
        );
      }
      console.warn(
        "[State] REDIS_URL is set but the `redis` package is not installed. " +
          "Falling back to in-memory state. Run `npm install redis` to enable Redis.",
      );
      return false;
    }

    this.client = createClient({ url: this.url });
    this.client.on("error", (error) =>
      console.error(
        JSON.stringify({ event: "redis_error", message: error.message }),
      ),
    );
    await this.client.connect();
    this.connected = true;
    return true;
  }

  key(type, value) {
    return `${this.namespace}:${type}:${value}`;
  }

  async consumeRateLimit(
    identity,
    { windowMs = 60000, maxRequests = 30 } = {},
  ) {
    const [count, ttl] = await this.client.eval(RATE_LIMIT_SCRIPT, {
      keys: [this.key("rate", identity)],
      arguments: {
        now: String(Date.now()),
        window: String(windowMs),
        limit: String(maxRequests),
      },
    });
    return {
      allowed: Number(count) <= maxRequests,
      count: Number(count),
      retryAfterMs: Math.max(Number(ttl), 0),
      backend: "redis",
    };
  }

  async circuitOpen(hostname) {
    const state = await this.client.hGetAll(this.key("circuit", hostname));
    const openUntil = Number(state.openUntil || 0);
    return {
      open: openUntil > Date.now(),
      failures: Number(state.failures || 0),
      openUntil,
      backend: "redis",
    };
  }

  async recordCircuitFailure(
    hostname,
    { threshold = 5, cooldownMs = 30000 } = {},
  ) {
    const result = await this.client.eval(CIRCUIT_SCRIPT, {
      keys: [this.key("circuit", hostname)],
      arguments: {
        now: String(Date.now()),
        threshold: String(threshold),
        cooldown: String(cooldownMs),
      },
    });
    return {
      opened: Number(result[2]) > Date.now(),
      failures: Number(result[1]),
      openUntil: Number(result[2]),
      backend: "redis",
    };
  }

  async recordCircuitSuccess(hostname) {
    await this.client.del(this.key("circuit", hostname));
  }

  async incrementMetric(name, { windowMs = 60000 } = {}) {
    const key = this.key(
      "metric",
      `${name}:${Math.floor(Date.now() / windowMs)}`,
    );
    const value = await this.client.incr(key);
    await this.client.pExpire(key, windowMs * 2);
    return { value, backend: "redis" };
  }

  async close() {
    if (this.connected) await this.client.quit();
  }
}

// ── Factory ────────────────────────────────────────────────────
// Returns the Redis backend if it connects successfully, otherwise
// falls back to the in-memory backend. Callers use the same
// interface either way.
async function createState(options = {}) {
  const { url = process.env.REDIS_URL, required = false, namespace } = options;

  // No URL and not required → memory only, no Redis attempt.
  if (!url && !required) {
    const mem = new MemoryState({ namespace });
    console.log("[State] No REDIS_URL set — using in-memory state");
    return mem;
  }

  const redis = new RedisState({ url, required, namespace });
  const ok = await redis.connect().catch((e) => {
    if (required) throw e;
    console.warn(
      "[State] Redis connection failed, using in-memory state:",
      e.message,
    );
    return false;
  });

  if (!ok) {
    return new MemoryState({ namespace });
  }

  console.log("[State] Redis connected — using shared state");
  return redis;
}

module.exports = { createState, RedisState, MemoryState };
