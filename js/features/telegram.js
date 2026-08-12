window.W = window.W || {};

W.tg = (() => {
  const cfg = () => (W.store.get("settings", {}) || {}).telegram || {};
  const enabled = (o) => {
    const c = o || cfg();
    return !!(c.on && c.token && c.chat);
  };

  async function send(text, o) {
    const c = o || cfg();
    if (!(o ? c.token && c.chat : enabled())) return false;
    try {
      const r = await fetch(
        "https://api.telegram.org/bot" + c.token + "/sendMessage",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: c.chat,
            text: "🕸️ <b>Weaver</b>\n" + text,
            parse_mode: "HTML",
            disable_web_page_preview: true,
          }),
        },
      );
      const d = await r.json();
      if (!d.ok) throw new Error(d.description || "telegram error");
      return true;
    } catch (e) {
      console.warn("[Weaver] Telegram failed:", e.message);
      return false;
    }
  }

  const last = {};
  function notify(key, text) {
    if (!enabled()) return;
    const now = Date.now();
    if (last[key] && now - last[key] < 5 * 60 * 1000) return;
    last[key] = now;
    send(text);
  }

  return { send: send, notify: notify, enabled: enabled, cfg: cfg };
})();
