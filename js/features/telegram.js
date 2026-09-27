// ================================================================
//Telegram Alert Integration 
// ================================================================


window.W = window.W || {};

W.tg = (() => {
  // ── Constants ─────────────────────────────────────────
  const TELEGRAM_API_BASE = "https://api.telegram.org/bot";
  const MAX_MESSAGE_LENGTH = 4096;
  const DEFAULT_RATE_LIMIT_WINDOW = 5000; // 5 s between messages
  const FETCH_TIMEOUT_MS = 8000;
  const MAX_RESPONSE_BYTES = 64 * 1024; // 64 KB
  const NOTIFIED_MAX = 500; // LRU cap on dedup entries

  // Input length caps. Enforced before any regex or string scan.
  const TEXT_INPUT_MAX = 100_000; // ~100 KB
  const TOKEN_INPUT_MAX = 100; // a valid token is <60 bytes
  const CHAT_ID_INPUT_MAX = 64;
  const KEY_INPUT_MAX = 256;

  // Telegram rate-limit backoff.
  const RETRY_AFTER_MAX_MS = 60_000; // never wait more than 60s

  // Credential circuit breaker.
  const AUTH_FAILURE_THRESHOLD = 3;
  const AUTH_BLOCK_DURATION_MS = 60 * 60 * 1000; // 1 hour

  // Token patterns.
  //
  // TOKEN_VALIDATOR is anchored: <digits>:<35 chars from base64url set>.
  // The unanchored global pattern is used for redaction, so it is
  // defined once here and reused.
  const TOKEN_VALIDATOR = /^\d{6,20}:[A-Za-z0-9_-]{35}$/;
  const TOKEN_PATTERN = /\d{6,20}:[A-Za-z0-9_-]{35}/g;
  // URL-encoded form: colon replaced by %3A. An intermediary (or a
  // future logging library that re-encodes URLs) could produce this.
  const TOKEN_PATTERN_ENCODED = /\d{6,20}%3A[A-Za-z0-9_-]{35}/gi;

  // Chat ID validation.
  const CHAT_ID_NUMERIC = /^-?\d{1,20}$/;
  const CHAT_ID_USERNAME = /^@[A-Za-z0-9_]{5,32}$/;

  // Telegram parse modes. Callers that need MarkdownV2 should build
  // their own escape and pass the mode explicitly.
  const ALLOWED_PARSE_MODES = Object.freeze({
    HTML: "HTML",
    Markdown: "Markdown",
    MarkdownV2: "MarkdownV2",
  });

  // ── State ─────────────────────────────────────────────
  let lastSent = 0;
  let rateLimitedUntil = 0;

  // Dedup bookkeeping.
  //
  // A Map is used instead of a plain object + array because:
  //   1. Map preserves insertion order, so the "oldest" cursor is
  //      reliable without a parallel array.
  //   2. Map keys are unique, so re-notifying a key after the
  //      5-minute window refreshes its position rather than
  //      duplicating it.
  //   3. Map is not subject to prototype-pollution for key access,
  //      so a hostile key of "__proto__" is a normal key.
  const notified = new Map();

  // Warn-once bookkeeping for reasons that would otherwise flood
  // the console. Keys are hardcoded strings, not user input.
  const warnedReasons = Object.create(null);

  // Credential circuit breaker.
  let consecutiveAuthFailures = 0;
  let authBlockedUntil = 0;

  // ── Redaction ─────────────────────────────────────────
  // Every log line in this module runs through redact(). Telegram's
  // API requires the bot token in the URL path, so any string that
  // might contain that URL is a potential token leak.
  function redact(s) {
    if (s == null) return "";
    let str = typeof s === "string" ? s : String(s);
    // Order matters: strip the encoded form first so the encoded
    // marker is not partially matched by the raw pattern.
    str = str.replace(TOKEN_PATTERN_ENCODED, "[REDACTED:TOKEN]");
    str = str.replace(TOKEN_PATTERN, "[REDACTED:TOKEN]");
    return str;
  }

  // Wrapped console methods. Use these internally so redaction is
  // never forgotten at a call site.
  const log = {
    warn: (msg) => console.warn(redact(msg)),
    error: (msg) => console.error(redact(msg)),
  };

  function warnOnce(reason, message) {
    if (warnedReasons[reason]) return;
    warnedReasons[reason] = 1;
    log.warn(message);
  }

  // ── HTML escaping ─────────────────────────────────────
  // Telegram HTML parse mode supports a small tag set. Anything
  // outside it — including a stray `<` from user content — is
  // rejected. Callers that interpolate must escape first.
  function escapeHtml(v) {
    if (v == null) return "";
    const s = String(v);
    if (!/[&<>]/.test(s)) return s;
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // ── Message sanitisation ──────────────────────────────
  // Strip C0 control characters (except \n and \t, both of which
  // Telegram permits) and DEL/C1. A message containing a bare 0x01
  // byte is rejected by Telegram's parser with an opaque 400.
  function sanitizeText(text) {
    if (typeof text !== "string") return "";
    return text.replace(
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g,
      "",
    );
  }

  // Truncate without splitting a surrogate pair or an HTML entity.
  function safeTruncate(text, max) {
    if (typeof text !== "string" || text.length <= max) return text;
    let cut = max - 1;
    const code = text.charCodeAt(cut - 1);
    if (code >= 0xd800 && code <= 0xdbff) cut -= 1;
    const tail = text.lastIndexOf("&", cut);
    if (tail !== -1 && cut - tail <= 10) cut = tail;
    return text.slice(0, cut) + "…";
  }

  // ── Settings ──────────────────────────────────────────
  function getSettings() {
    let tg = null;
    try {
      tg = W.secureSession?.get?.("telegram");
    } catch {
      tg = null;
    }
    if (!tg || typeof tg !== "object" || Array.isArray(tg)) {
      return { enabled: false, token: "", chatId: "", locked: true };
    }
    return {
      enabled: tg.on === true,
      token: typeof tg.token === "string" ? tg.token : "",
      chatId: typeof tg.chat === "string" ? tg.chat : "",
      locked: false,
    };
  }

  // ── Validation ────────────────────────────────────────
  // The length cap runs before the regex so a hostile 1 MB string
  // never reaches the regular expression engine.
  function isValidToken(token) {
    if (typeof token !== "string") return false;
    if (token.length === 0 || token.length > TOKEN_INPUT_MAX) return false;
    return TOKEN_VALIDATOR.test(token);
  }

  function isValidChatId(chatId) {
    if (typeof chatId !== "string") return false;
    if (chatId.length === 0 || chatId.length > CHAT_ID_INPUT_MAX) return false;
    return CHAT_ID_NUMERIC.test(chatId) || CHAT_ID_USERNAME.test(chatId);
  }

  // Overrides are read once and frozen so a hostile getter cannot
  // change the object between validation and use.
  function validateOverrides(overrides) {
    if (
      !overrides ||
      typeof overrides !== "object" ||
      Array.isArray(overrides)
    ) {
      return Object.freeze({});
    }
    const out = {};
    if (typeof overrides.token === "string") {
      out.token = overrides.token.slice(0, TOKEN_INPUT_MAX + 1);
    }
    if (typeof overrides.chatId === "string") {
      out.chatId = overrides.chatId.slice(0, CHAT_ID_INPUT_MAX + 1);
    }
    if (typeof overrides.disableNotification === "boolean") {
      out.disableNotification = overrides.disableNotification;
    }
    if (
      typeof overrides.parseMode === "string" &&
      Object.prototype.hasOwnProperty.call(
        ALLOWED_PARSE_MODES,
        overrides.parseMode,
      )
    ) {
      out.parseMode = overrides.parseMode;
    }
    if (Number.isFinite(overrides.rateLimitMs) && overrides.rateLimitMs >= 0) {
      out.rateLimitMs = overrides.rateLimitMs;
    }
    // The only way to send with draft credentials before they are
    // persisted, or when the enabled flag is off. Named explicitly
    // so a stray field cannot silently enable it.
    if (overrides.allowDisabled === true) out.allowDisabled = true;
    return Object.freeze(out);
  }

  // ── Rate limiting ─────────────────────────────────────
  function canSend(rateLimitMs) {
    const now = Date.now();

    // Honour Telegram's own backoff first.
    if (now < rateLimitedUntil) {
      const wait = Math.ceil((rateLimitedUntil - now) / 1000);
      log.warn(`[Telegram] Backing off — retry in ~${wait}s.`);
      return false;
    }

    const window = Number.isFinite(rateLimitMs)
      ? rateLimitMs
      : DEFAULT_RATE_LIMIT_WINDOW;
    if (window > 0 && now - lastSent < window) {
      const wait = Math.ceil((window - (now - lastSent)) / 1000);
      log.warn(`[Telegram] Rate limit: retry in ~${wait}s.`);
      return false;
    }
    lastSent = now;
    return true;
  }

  // ── Credential circuit breaker ────────────────────────
  function isAuthBlocked() {
    return Date.now() < authBlockedUntil;
  }

  function recordAuthFailure() {
    consecutiveAuthFailures++;
    if (consecutiveAuthFailures >= AUTH_FAILURE_THRESHOLD) {
      authBlockedUntil = Date.now() + AUTH_BLOCK_DURATION_MS;
      consecutiveAuthFailures = 0;
      warnOnce(
        "auth-blocked",
        "[Telegram] Repeated credential failures — sends paused for 1 hour. Verify the bot token and chat ID in Settings.",
      );
    }
  }

  function recordAuthSuccess() {
    consecutiveAuthFailures = 0;
    authBlockedUntil = 0;
  }

  // ── Send message ──────────────────────────────────────
  // Returns true on 2xx with ok:true from Telegram.
  // Returns false on every other path.
  async function sendMessage(text, overrides = {}) {
    // ── Input validation ──────────────────────────────
    if (typeof text !== "string" || text.length === 0) {
      log.warn("[Telegram] Empty or non-string message rejected.");
      return false;
    }
    if (text.length > TEXT_INPUT_MAX) {
      log.warn(
        `[Telegram] Message exceeds ${TEXT_INPUT_MAX} characters; refusing to process.`,
      );
      return false;
    }

    const safeOverrides = validateOverrides(overrides);
    const settings = getSettings();

    const token = safeOverrides.token || settings.token;
    const chatId = safeOverrides.chatId || settings.chatId;
    const enabled =
      safeOverrides.allowDisabled === true ? true : settings.enabled;

    if (!enabled) {
      if (settings.locked) {
        warnOnce(
          "locked",
          "[Telegram] Keys are locked — unlock in Settings to send.",
        );
      } else {
        warnOnce("disabled", "[Telegram] Notifications are disabled.");
      }
      return false;
    }

    if (!token || !chatId) {
      warnOnce("missing", "[Telegram] Missing token or chat ID.");
      return false;
    }
    if (!isValidToken(token)) {
      warnOnce("bad-token", "[Telegram] Invalid token format.");
      return false;
    }
    if (!isValidChatId(chatId)) {
      warnOnce("bad-chat", "[Telegram] Invalid chat ID format.");
      return false;
    }

    // Credential circuit breaker. A bad token produces a 401 on
    // every send attempt; rather than produce N failed network
    // requests per alert burst, suspend for an hour after three.
    if (isAuthBlocked()) {
      warnOnce(
        "auth-blocked-active",
        "[Telegram] Sends paused after repeated credential failures. Check Settings.",
      );
      return false;
    }

    if (!canSend(safeOverrides.rateLimitMs)) return false;

    // ── Payload assembly ──────────────────────────────
    const cleanText = sanitizeText(text);
    const truncated = safeTruncate(cleanText, MAX_MESSAGE_LENGTH);

    const payload = {
      chat_id: chatId,
      text: truncated,
      parse_mode: safeOverrides.parseMode || ALLOWED_PARSE_MODES.HTML,
      disable_web_page_preview: true,
    };
    if (safeOverrides.disableNotification === true) {
      payload.disable_notification = true;
    }

    // The token is required in the URL path. It is used in exactly
    // one place — the fetch call below — and is never logged. If
    // the URL ever escapes into a log line, redact() scrubs it.
    const url = `${TELEGRAM_API_BASE}${token}/sendMessage`;

    // ── Fetch ─────────────────────────────────────────
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        credentials: "omit",
        mode: "cors",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      clearTimeout(timer);
      const reason =
        e && e.name === "AbortError" ? "request timed out" : redact(e?.message);
      log.error(`[Telegram] Network error: ${reason}`);
      return false;
    }
    clearTimeout(timer);

    // ── Response body ─────────────────────────────────
    let bodyText = "";
    try {
      const declared = Number(response.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
        log.error("[Telegram] Response exceeded size cap (declared).");
        return false;
      }
      bodyText = await response.text();
      if (bodyText.length > MAX_RESPONSE_BYTES) {
        log.error("[Telegram] Response exceeded size cap (actual).");
        return false;
      }
    } catch {
      log.error("[Telegram] Failed to read response body.");
      return false;
    }

    let data = null;
    try {
      data = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      log.error("[Telegram] Response was not valid JSON.");
      return false;
    }

    // ── 429: honour Telegram's retry_after ────────────
    if (response.status === 429) {
      const retryAfter = Number(data?.parameters?.retry_after);
      if (Number.isFinite(retryAfter) && retryAfter > 0) {
        const ms = Math.min(
          RETRY_AFTER_MAX_MS,
          Math.max(1000, retryAfter * 1000),
        );
        rateLimitedUntil = Date.now() + ms;
        log.warn(
          `[Telegram] Telegram rate-limited us. Pausing for ${Math.ceil(ms / 1000)}s.`,
        );
      } else {
        log.warn("[Telegram] HTTP 429 with no retry_after; backing off 30s.");
        rateLimitedUntil = Date.now() + 30_000;
      }
      return false;
    }

    // ── 401: credential circuit breaker ──────────────
    if (response.status === 401) {
      recordAuthFailure();
      log.error("[Telegram] HTTP 401 — invalid bot token.");
      return false;
    }

    if (!response.ok) {
      const desc =
        typeof data?.description === "string"
          ? data.description.slice(0, 200)
          : "unknown error";
      log.error(
        `[Telegram] API error HTTP ${response.status}: ${redact(desc)}`,
      );
      return false;
    }

    if (!data || data.ok !== true) {
      const desc =
        typeof data?.description === "string"
          ? data.description.slice(0, 200)
          : "unknown error";
      log.error(`[Telegram] Error response: ${redact(desc)}`);
      return false;
    }

    // ── Success ───────────────────────────────────────
    recordAuthSuccess();

    // Schema validation is advisory. A mismatch does not mean the
    // message was not delivered — it means the response shape has
    // moved beyond the current schema. Log and continue.
    if (W.schemas && typeof W.schemas.validate === "function") {
      try {
        W.schemas.validate("telegram", data);
      } catch (e) {
        log.warn(
          `[Telegram] Schema validation advisory: ${redact(e?.message)}`,
        );
      }
    }

    W.dataHealth?.mark("telegram", {
      source: "telegram",
      observedAt: Date.now(),
      staleAfter: 60 * 60 * 1000,
    });
    return true;
  }

  // ── Notify (deduplicated, fire-and-forget) ────────────
  function notify(key, text, options = {}) {
    // Key validation runs first so a bad key is diagnosed even when
    // notifications are disabled.
    if (typeof key !== "string" || key.length === 0) {
      log.warn("[Telegram] notify() called with an empty or non-string key.");
      return;
    }
    if (key.length > KEY_INPUT_MAX) {
      log.warn(
        `[Telegram] notify() key exceeds ${KEY_INPUT_MAX} characters; rejecting.`,
      );
      return;
    }
    if (/[\u0000-\u001F\u007F]/.test(key)) {
      log.warn(
        "[Telegram] notify() key contains control characters; rejecting.",
      );
      return;
    }

    const settings = getSettings();
    if (!settings.enabled) return;

    const now = Date.now();
    const last = notified.get(key);
    if (last && now - last < 5 * 60 * 1000) {
      // Suppression is expected behavior for a dedup map. Do not
      // log per-call; a high-frequency caller would flood.
      return;
    }

    // Refresh position: delete then re-insert moves the key to the
    // end of the Map's insertion order, which is what the eviction
    // loop below treats as "most recently used".
    if (notified.has(key)) notified.delete(key);
    notified.set(key, now);

    // LRU eviction. A Map's iteration order is insertion order, so
    // the first key produced by .keys() is the oldest.
    while (notified.size > NOTIFIED_MAX) {
      const oldestKey = notified.keys().next().value;
      if (oldestKey === undefined) break;
      notified.delete(oldestKey);
    }

    // Fire-and-forget. The promise is not awaited and is chained
    // only to a logging catch — a failed send must not block the
    // caller or surface as an unhandled rejection.
    Promise.resolve(sendMessage(text, options)).catch((e) => {
      log.warn(
        `[Telegram] Notification failed for key "${key.slice(0, 32)}": ${redact(e?.message)}`,
      );
    });
  }

  // ── Test connection ──────────────────────────────────
  // Uses allowDisabled so draft credentials can be verified before
  // they are persisted, and skips the rate limit so a user
  // correcting a typo does not have to wait 5 seconds.
  async function testConnection(overrides = {}) {
    const safeOverrides = validateOverrides(overrides);
    const sendOverrides = Object.freeze({
      ...safeOverrides,
      allowDisabled: true,
      rateLimitMs: 0,
    });

    const ok = await sendMessage(
      "✅ Weaver connected! Telegram alerts are active.",
      sendOverrides,
    );
    if (ok) return { success: true };
    return {
      success: false,
      error: "Failed to send test message. Check token and chat ID.",
    };
  }

  // Note: Telegram token/chat ID are configured on the main Settings
  // page (js/features/misc.js), which owns the encrypted_settings
  // blob via W.secureSession. This module intentionally has no
  // settings UI or save path of its own — a second, parallel place
  // to edit the same credential is exactly how the old
  // plaintext-storage bug happened.

  // ── Public API ────────────────────────────────────────
  return Object.freeze({
    send: sendMessage,
    notify,
    test: testConnection,
    getSettings,
    isEnabled: () => getSettings().enabled,
    isValidToken,
    isValidChatId,
    escape: escapeHtml,

    // Exposed for tests and diagnostics only.
    _internal: Object.freeze({
      redact,
      sanitizeText,
      safeTruncate,
      escapeHtml,
      validateOverrides,
      ALLOWED_PARSE_MODES,
      reset: () => {
        notified.clear();
        lastSent = 0;
        rateLimitedUntil = 0;
        consecutiveAuthFailures = 0;
        authBlockedUntil = 0;
        for (const k of Object.keys(warnedReasons)) delete warnedReasons[k];
      },
      getNotifiedCount: () => notified.size,
      getNotifiedKeys: () => Array.from(notified.keys()),
      getAuthFailureCount: () => consecutiveAuthFailures,
      isAuthBlocked,
      getRateLimitedUntil: () => rateLimitedUntil,
    }),
  });
})();

console.log(
  "[Telegram] Module loaded (telegram-v3: retry_after backoff, credential circuit breaker, Map-based LRU, input length caps).",
);
