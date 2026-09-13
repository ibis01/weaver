// ===============================================================
//         Weaver Logger
// ===============================================================
// Structured logging with automatic PII scrubbing.
// Constitution §2.6: never log wallet addresses, API keys, seeds.
//
// Public API:
//   W.logger.error/warn/info/debug/trace(msg, data)
//   W.logger.setLevel("error"|"warn"|"info"|"debug"|"trace")
//   W.logger.scrub(value)         — for direct use and testing
//   W.logger.setEnabled(bool)
// ===============================================================

window.W = window.W || {};

(function () {
  const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3, trace: 4 };
  const DEFAULT_LEVEL = "info";

  let currentLevel = (() => {
    const saved = (() => {
      try {
        return localStorage.getItem("weaver_log_level");
      } catch {
        return null;
      }
    })();
    return LOG_LEVELS[saved] !== undefined ? LOG_LEVELS[saved] : LOG_LEVELS[DEFAULT_LEVEL];
  })();

  let enabled = true;

  // ── PII scrubbing ─────────────────────────────────────────
  // Order matters. Wallet patterns are masked first because their
  // shape would otherwise match the generic API-key rule.
  function scrub(value) {
    if (value === null || value === undefined) return value;

    if (typeof value !== "string") {
      const seen = new WeakSet();
      const walk = (v) => {
        if (v === null || typeof v !== "object") {
          return typeof v === "string" ? scrub(v) : v;
        }
        if (seen.has(v)) return "[Circular]";
        seen.add(v);
        if (Array.isArray(v)) return v.map(walk);
        const out = {};
        for (const k of Object.keys(v)) {
          if (/^(token|key|secret|password|passphrase|dsn|seed)$/i.test(k)) {
            out[k] = "[REDACTED]";
          } else {
            out[k] = walk(v[k]);
          }
        }
        return out;
      };
      try {
        return walk(value);
      } catch {
        return "[unserializable]";
      }
    }

    let s = value;

    // 1. EVM addresses: 0x + 40 hex chars
    s = s.replace(/\b0x[a-fA-F0-9]{40}\b/g, (m) =>
      W.fmt?.maskAddress ? W.fmt.maskAddress(m) : m.slice(0, 6) + "…" + m.slice(-4),
    );

    // 2. Solana base58 addresses: 32–44 chars, no 0/O/I/l
    s = s.replace(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g, (m) =>
      m.slice(0, 6) + "…" + m.slice(-4),
    );

    // 3. Telegram bot tokens: <digits>:<35 chars>
    s = s.replace(/\b\d{8,12}:[A-Za-z0-9_-]{35}\b/g, "[REDACTED_TG_TOKEN]");

    // 4. Sentry DSNs
    s = s.replace(/https:\/\/[a-f0-9]{32}@[^\s]+/gi, "[REDACTED_DSN]");

    // 5. OpenAI/Anthropic/Stripe-style keys
    s = s.replace(/\bsk-[A-Za-z0-9_-]{20,}\b/g, "[REDACTED_KEY]");
    s = s.replace(/\bsk_live_[A-Za-z0-9]{20,}\b/g, "[REDACTED_KEY]");
    s = s.replace(/\bsk_test_[A-Za-z0-9]{20,}\b/g, "[REDACTED_KEY]");

    // 6. Seed phrases: 12+ lowercase words separated by spaces
    s = s.replace(/\b([a-z]{3,8}\s+){11,23}[a-z]{3,8}\b/g, "[REDACTED_SEED]");

    return s;
  }

  // ── Core log function ─────────────────────────────────────
  function log(level, tag, msg, data) {
    if (!enabled) return;
    if (LOG_LEVELS[level] > currentLevel) return;

    const prefix = "[" + new Date().toISOString() + "] [" + level.toUpperCase() + "] [" + tag + "]";
    const cleanMsg = scrub(msg);
    const cleanData = data !== undefined ? scrub(data) : undefined;

    const fn =
      level === "error"
        ? console.error
        : level === "warn"
          ? console.warn
          : level === "debug" || level === "trace"
            ? console.debug
            : console.log;

    if (cleanData !== undefined) {
      fn(prefix, cleanMsg, cleanData);
    } else {
      fn(prefix, cleanMsg);
    }

    if (level === "error" && window.W.sentryBuffer) {
      window.W.sentryBuffer.push({
        timestamp: new Date().toISOString(),
        level,
        tag,
        message: cleanMsg,
        data: cleanData,
      });
      if (window.W.sentryBuffer.length > 50) window.W.sentryBuffer.shift();
    }
  }

  W.logger = {
    error: (tag, msg, data) => log("error", tag, msg, data),
    warn: (tag, msg, data) => log("warn", tag, msg, data),
    info: (tag, msg, data) => log("info", tag, msg, data),
    debug: (tag, msg, data) => log("debug", tag, msg, data),
    trace: (tag, msg, data) => log("trace", tag, msg, data),
    setLevel: (level) => {
      if (LOG_LEVELS[level] === undefined) return;
      currentLevel = LOG_LEVELS[level];
      try {
        localStorage.setItem("weaver_log_level", level);
      } catch {
        /* ignore quota errors */
      }
    },
    setEnabled: (v) => {
      enabled = !!v;
    },
    scrub,
  };
})();

window.W.sentryBuffer = window.W.sentryBuffer || [];

console.log("[Logger] Module loaded.");
