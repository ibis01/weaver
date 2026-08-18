// ================================================================
// js/features/telegram.js – Telegram Alert Integration
// ================================================================

window.W = window.W || {};

W.tg = (() => {
  // ── Constants ─────────────────────────────────────────
  const TELEGRAM_API_BASE = "https://api.telegram.org/bot";
  const MAX_MESSAGE_LENGTH = 4096;
  const RATE_LIMIT_WINDOW = 5000; // 5 seconds between messages
  const STORAGE_KEY = "telegram_settings";

  // ── State ─────────────────────────────────────────────
  let lastSent = 0;
  let settingsCache = null;

  // ── Settings ──────────────────────────────────────────
  function getSettings() {
    if (settingsCache) return settingsCache;
    const stored = W.store.get(STORAGE_KEY, null);
    if (stored) {
      settingsCache = stored;
      return stored;
    }
    // Fallback: read from legacy settings
    const legacy = W.store.get("settings", {});
    const tg = legacy.telegram || {};
    const settings = {
      enabled: !!tg.on,
      token: tg.token || "",
      chatId: tg.chat || "",
    };
    settingsCache = settings;
    W.store.set(STORAGE_KEY, settings);
    return settings;
  }

  function saveSettings(settings) {
    settingsCache = settings;
    W.store.set(STORAGE_KEY, settings);
    // Also update legacy settings for backward compatibility
    const legacy = W.store.get("settings", {});
    legacy.telegram = {
      on: settings.enabled,
      token: settings.token,
      chat: settings.chatId,
    };
    W.store.set("settings", legacy);
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
  async function sendMessage(text, options = {}) {
    const settings = getSettings();
    if (!settings.enabled) {
      console.warn("[Telegram] Not enabled.");
      return false;
    }
    if (!settings.token || !settings.chatId) {
      console.warn("[Telegram] Missing token or chat ID.");
      return false;
    }
    if (!isValidToken(settings.token)) {
      console.warn("[Telegram] Invalid token format.");
      return false;
    }
    if (!isValidChatId(settings.chatId)) {
      console.warn("[Telegram] Invalid chat ID format.");
      return false;
    }
    if (!canSend()) return false;

    // Truncate message if needed
    let truncated = text;
    if (text.length > MAX_MESSAGE_LENGTH) {
      truncated = text.slice(0, MAX_MESSAGE_LENGTH - 3) + "…";
    }

    const url = `${TELEGRAM_API_BASE}${settings.token}/sendMessage`;
    const payload = {
      chat_id: settings.chatId,
      text: truncated,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...options,
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

  // ── UI Render (integration with settings page) ──────
  function renderSettings(container) {
    const settings = getSettings();
    container.innerHTML = `
      <div class="card">
        <h3>📨 Telegram Alerts</h3>
        <p class="muted small">
          Configure your Telegram bot to receive alerts, price triggers, and gem discoveries.
          <br>
          Create a bot via <b>@BotFather</b>, get your Chat ID from <b>@userinfobot</b>, and send a message to the bot first.
        </p>
        <label>
          Bot Token
          <input type="password" id="tg-token" placeholder="123456789:AAF..." value="${settings.token}">
        </label>
        <label>
          Chat ID
          <input type="text" id="tg-chat" placeholder="e.g. 7099096813 or @channel" value="${settings.chatId}">
        </label>
        <label class="small">
          <input type="checkbox" id="tg-enabled" ${settings.enabled ? "checked" : ""} style="width:auto;">
          Enable Telegram alerts
        </label>
        <div class="qa mt">
          <button class="btn" id="tg-test">📨 Send Test Message</button>
          <button class="btn primary" id="tg-save">Save Settings</button>
        </div>
        <div id="tg-status" class="mt"></div>
      </div>
    `;

    const tokenInput = container.querySelector("#tg-token");
    const chatInput = container.querySelector("#tg-chat");
    const enabledCheck = container.querySelector("#tg-enabled");
    const testBtn = container.querySelector("#tg-test");
    const saveBtn = container.querySelector("#tg-save");
    const status = container.querySelector("#tg-status");

    testBtn.onclick = async () => {
      // Temporarily save settings to test
      const tempSettings = {
        enabled: enabledCheck.checked,
        token: tokenInput.value.trim(),
        chatId: chatInput.value.trim(),
      };
      // Validate
      if (!tempSettings.token || !tempSettings.chatId) {
        status.innerHTML =
          '<p class="down">❌ Please fill in both token and chat ID.</p>';
        return;
      }
      if (!isValidToken(tempSettings.token)) {
        status.innerHTML = '<p class="down">❌ Invalid bot token format.</p>';
        return;
      }
      if (!isValidChatId(tempSettings.chatId)) {
        status.innerHTML = '<p class="down">❌ Invalid chat ID format.</p>';
        return;
      }
      // Temporarily save to test
      const originalSettings = { ...settings };
      saveSettings(tempSettings);
      try {
        const result = await testConnection();
        if (result.success) {
          status.innerHTML =
            '<p class="up">✅ Test message sent! Check your Telegram.</p>';
        } else {
          status.innerHTML = `<p class="down">❌ ${result.error}</p>`;
        }
      } catch (e) {
        status.innerHTML = `<p class="down">❌ ${e.message}</p>`;
      }
      // Restore original settings
      saveSettings(originalSettings);
    };

    saveBtn.onclick = () => {
      const newSettings = {
        enabled: enabledCheck.checked,
        token: tokenInput.value.trim(),
        chatId: chatInput.value.trim(),
      };
      if (newSettings.token && !isValidToken(newSettings.token)) {
        status.innerHTML = '<p class="down">❌ Invalid bot token format.</p>';
        return;
      }
      if (newSettings.chatId && !isValidChatId(newSettings.chatId)) {
        status.innerHTML = '<p class="down">❌ Invalid chat ID format.</p>';
        return;
      }
      saveSettings(newSettings);
      status.innerHTML = '<p class="up">✅ Settings saved.</p>';
    };
  }

  // ── Public API ─────────────────────────────────────────
  return {
    // Core functions
    send: sendMessage,
    notify,
    test: testConnection,

    // Settings
    getSettings,
    saveSettings,
    renderSettings,

    // Utility
    isEnabled: () => getSettings().enabled,
    isValidToken,
    isValidChatId,
  };
})();

console.log("[Telegram] Module loaded.");
