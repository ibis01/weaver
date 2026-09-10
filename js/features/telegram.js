// ================================================================
// js/features/telegram.js – Telegram Alert Integration
// ================================================================

window.W = window.W || {};

W.tg = (() => {
  // ── Constants ─────────────────────────────────────────
  const TELEGRAM_API_BASE = "https://api.telegram.org/bot";
  const MAX_MESSAGE_LENGTH = 4096;
  const RATE_LIMIT_WINDOW = 5000; // 5 seconds between messages

  // ── State ─────────────────────────────────────────────
  let lastSent = 0;

  // ── Settings ──────────────────────────────────────────
  // Credentials live only in W.secureSession's in-memory cache, populated
  // by unlocking the encrypted settings (see js/features/misc.js Settings
  // page). Weaver never writes the bot token to localStorage in plaintext —
  // if the session is locked, Telegram sends are simply unavailable until
  // the user unlocks their keys again.
  function getSettings() {
    const tg = W.secureSession?.get("telegram");
    if (!tg) {
      return { enabled: false, token: "", chatId: "", locked: true };
    }
    return {
      enabled: !!tg.on,
      token: tg.token || "",
      chatId: tg.chat || "",
      locked: false,
    };
  }

  // ── Validation ────────────────────────────────────────
  function isValidToken(token) {
    return /^\d+:[A-Za-z0-9_-]{35}$/.test(token);
  }

  function isValidChatId(chatId) {
    // Can be numeric (user/group ID) or alphanumeric for channel username
    return /^[0-9-]+$/.test(chatId) || /^@[A-Za-z0-9_]{5,32}$/.test(chatId);
  }

  // ── Rate Limiting ──────────────────────────────────────
  function canSend() {
    const now = Date.now();
    if (now - lastSent < RATE_LIMIT_WINDOW) {
      console.warn("[Telegram] Rate limit: too many messages.");
      return false;
    }
    lastSent = now;
    return true;
  }

  // ── Send Message ──────────────────────────────────────
  // overrides.token / overrides.chatId let a caller (e.g. a "test before
  // saving" button) send with draft credentials that haven't been
  // persisted yet, without ever writing them to disk first.
  async function sendMessage(text, overrides = {}) {
    const settings = getSettings();
    const token = overrides.token || settings.token;
    const chatId = overrides.chatId || settings.chatId;
    const enabled = overrides.token ? true : settings.enabled;

    if (!enabled) {
      console.warn(
        settings.locked
          ? "[Telegram] Keys are locked — unlock in Settings to send."
          : "[Telegram] Not enabled.",
      );
      return false;
    }
    if (!token || !chatId) {
      console.warn("[Telegram] Missing token or chat ID.");
      return false;
    }
    if (!isValidToken(token)) {
      console.warn("[Telegram] Invalid token format.");
      return false;
    }
    if (!isValidChatId(chatId)) {
      console.warn("[Telegram] Invalid chat ID format.");
      return false;
    }
    if (!canSend()) return false;

    // Truncate message if needed
    let truncated = text;
    if (text.length > MAX_MESSAGE_LENGTH) {
      truncated = text.slice(0, MAX_MESSAGE_LENGTH - 3) + "…";
    }

    const url = `${TELEGRAM_API_BASE}${token}/sendMessage`;
    const payload = {
      chat_id: chatId,
      text: truncated,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("[Telegram] API error:", errorData);
        return false;
      }
      const data = await response.json();
      if (!data.ok) {
        console.error("[Telegram] Error response:", data.description);
        return false;
      }
      return true;
    } catch (e) {
      console.error("[Telegram] Network error:", e.message);
      return false;
    }
  }

  // ── Notify (for alerts with deduplication) ────────────
  const lastNotified = {};

  function notify(key, text, options = {}) {
    const settings = getSettings();
    if (!settings.enabled) return;
    const now = Date.now();
    // Deduplicate: if the same key was sent within 5 minutes, skip
    if (lastNotified[key] && now - lastNotified[key] < 5 * 60 * 1000) {
      console.log(
        `[Telegram] Duplicate notification suppressed for key: ${key}`,
      );
      return;
    }
    lastNotified[key] = now;
    // Send asynchronously; don't block
    sendMessage(text, options).then((ok) => {
      if (!ok) {
        console.warn(`[Telegram] Failed to send notification: ${key}`);
      }
    });
  }

  // ── Test connection ──────────────────────────────────
  async function testConnection() {
    const settings = getSettings();
    if (!settings.enabled) {
      return { success: false, error: "Telegram notifications are disabled." };
    }
    if (!settings.token || !settings.chatId) {
      return { success: false, error: "Missing token or chat ID." };
    }
    const ok = await sendMessage(
      "✅ Weaver connected! Telegram alerts are active.",
      {
        disable_notification: false,
      },
    );
    if (ok) {
      return { success: true };
    } else {
      return {
        success: false,
        error: "Failed to send test message. Check token and chat ID.",
      };
    }
  }

  // Note: Telegram token/chat ID are configured on the main Settings page
  // (js/features/misc.js), which owns the encrypted_settings blob via
  // W.secureSession. This module intentionally has no settings UI or
  // save path of its own — a second, parallel place to edit the same
  // credential is exactly how the old plaintext-storage bug happened.

  // ── Public API ─────────────────────────────────────────
  return {
    // Core functions
    send: sendMessage,
    notify,
    test: testConnection,

    // Settings (read-only from this module's perspective)
    getSettings,

    // Utility
    isEnabled: () => getSettings().enabled,
    isValidToken,
    isValidChatId,
  };
})();

console.log("[Telegram] Module loaded.");
