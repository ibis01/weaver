const { createClient } = require("redis");

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

class RedisState {
  constructor({ url, required = false, namespace = "weaver" } = {}) {
    this.url = url;
    this.required = required;
    this.namespace = namespace;
    this.client = null;
    this.connected = false;
  }

  async connect() {
    if (!this.url) {
      if (this.required) throw new Error("REDIS_URL is required in production");
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
    if (!this.connected)
      return {
        allowed: true,
        count: 0,
        retryAfterMs: 0,
        backend: "memory-fallback",
      };
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
    if (!this.connected) return { open: false, backend: "memory-fallback" };
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
    if (!this.connected)
      return { opened: false, failures: 0, backend: "memory-fallback" };
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
    if (this.connected) await this.client.del(this.key("circuit", hostname));
  }

  async incrementMetric(name, { windowMs = 60000 } = {}) {
    if (!this.connected) return { value: 0, backend: "memory-fallback" };
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

module.exports = { RedisState };
