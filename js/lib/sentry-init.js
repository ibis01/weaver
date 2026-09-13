// ===============================================================
//         Sentry Integration (Opt-In, Privacy-First)
// ===============================================================
// Constitution §2.6: no external transmission without explicit
// opt-in. This module does nothing unless the user enables error
// reporting in Settings AND provides a DSN.
//
// All events pass through W.logger.scrub before transmission.
// If scrubbing throws, the event is dropped rather than sent.
// ===============================================================

window.W = window.W || {};
W.sentry = (() => {
  let initialized = false;

  function isDntEnabled() {
    return (
      navigator.doNotTrack === "1" ||
      window.doNotTrack === "1" ||
      navigator.msDoNotTrack === "1"
    );
  }

  function beforeSend(event) {
    try {
      if (event.exception && event.exception.values) {
        for (const ex of event.exception.values) {
          if (ex.value) ex.value = W.logger.scrub(ex.value);
        }
      }
      if (event.breadcrumbs && event.breadcrumbs.values) {
        event.breadcrumbs.values = event.breadcrumbs.values.map((b) => ({
          ...b,
          message: b.message ? W.logger.scrub(b.message) : b.message,
          data: b.data ? W.logger.scrub(b.data) : b.data,
        }));
      }
      if (event.extra) event.extra = W.logger.scrub(event.extra);
      if (event.tags) event.tags = W.logger.scrub(event.tags);

      delete event.user;
      delete event.request;

      event.tags = event.tags || {};
      event.tags.weaver_version = "2.0";

      return event;
    } catch (e) {
      W.logger.warn("Sentry", "beforeSend scrubbing failed, dropping event");
      return null;
    }
  }

  async function init() {
    if (initialized) return false;

    const settings = W.store?.get("settings", {}) || {};
    const cfg = settings.sentry || {};

    if (!cfg.enabled) {
      W.logger.info("Sentry", "Not enabled by user, skipping init");
      return false;
    }

    if (!cfg.dsn || typeof cfg.dsn !== "string" || !/^https:\/\//.test(cfg.dsn)) {
      W.logger.warn("Sentry", "No valid DSN configured, skipping init");
      return false;
    }

    if (isDntEnabled()) {
      W.logger.info("Sentry", "Do Not Track is set, skipping init");
      return false;
    }

    if (typeof window.Sentry === "undefined") {
      W.logger.warn("Sentry", "SDK not loaded, skipping init");
      return false;
    }

    try {
      window.Sentry.init({
        dsn: cfg.dsn,
        environment: settings.environment || "production",
        release: "weaver@2.0.0",
        tracesSampleRate: 0.1,
        sendDefaultPii: false,
        beforeSend,
      });
      initialized = true;
      W.logger.info("Sentry", "Initialized with privacy-safe configuration");

      const buf = window.W.sentryBuffer || [];
      for (const entry of buf) {
        window.Sentry.captureMessage(entry.message, {
          level: entry.level,
          tags: { tag: entry.tag },
          extra: entry.data || {},
        });
      }
      window.W.sentryBuffer = [];
      return true;
    } catch (e) {
      W.logger.error("Sentry", "Initialization failed", e.message);
      return false;
    }
  }

  return { init, beforeSend, isInitialized: () => initialized };
})();

console.log("[Sentry] Privacy-safe observability module loaded.");
