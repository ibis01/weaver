// ===============================================================
// External request resilience: rate limiting and circuit breakers
// ===============================================================

window.W = window.W || {};

W.requestGuard = (() => {
  const buckets = new Map();
  const circuits = new Map();
  const DEFAULTS = {
    capacity: 12,
    refillMs: 10000,
    failureThreshold: 5,
    cooldownMs: 30000,
  };

  function originKey(url) {
    try {
      return new URL(url, window.location.href).origin;
    } catch {
      return "invalid-origin";
    }
  }

  function consume(key, options = {}) {
    const capacity = options.capacity || DEFAULTS.capacity;
    const refillMs = options.refillMs || DEFAULTS.refillMs;
    const now = Date.now();
    const bucket = buckets.get(key) || { tokens: capacity, last: now };
    bucket.tokens = Math.min(
      capacity,
      bucket.tokens + (now - bucket.last) / refillMs,
    );
    bucket.last = now;
    if (bucket.tokens < 1) {
      const waitMs = Math.ceil((1 - bucket.tokens) * refillMs);
      throw new Error(`Rate limit exceeded for ${key}; retry in ${waitMs}ms`);
    }
    bucket.tokens -= 1;
    buckets.set(key, bucket);
  }

  function before(key, options = {}) {
    const circuit = circuits.get(key);
    if (circuit && circuit.openUntil > Date.now()) {
      throw new Error(`Circuit open for ${key}; retry after cooldown`);
    }
    if (circuit && circuit.openUntil <= Date.now()) {
      circuits.delete(key);
    }
    consume(key, options);
  }

  function success(key) {
    circuits.delete(key);
  }

  function failure(key, options = {}) {
    const threshold = options.failureThreshold || DEFAULTS.failureThreshold;
    const cooldownMs = options.cooldownMs || DEFAULTS.cooldownMs;
    const current = circuits.get(key) || { failures: 0, openUntil: 0 };
    current.failures += 1;
    if (current.failures >= threshold)
      current.openUntil = Date.now() + cooldownMs;
    circuits.set(key, current);
  }

  async function fetch(url, options = {}, guardOptions = {}) {
    const key = guardOptions.key || originKey(url);
    before(key, guardOptions);
    try {
      const response = await window.fetch(url, options);
      if (response.status >= 500 || response.status === 429)
        failure(key, guardOptions);
      else if (response.ok) success(key);
      return response;
    } catch (error) {
      failure(key, guardOptions);
      throw error;
    }
  }

  function state(key) {
    return {
      bucket: buckets.get(key) || null,
      circuit: circuits.get(key) || { failures: 0, openUntil: 0 },
    };
  }

  function reset() {
    buckets.clear();
    circuits.clear();
  }

  return { fetch, before, success, failure, state, reset, originKey };
})();

console.log("[RequestGuard] Rate limiting and circuit breakers loaded.");
