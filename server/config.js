function loadConfig(env = process.env) {
  const production = env.NODE_ENV === "production";
  const config = {
    production,
    port: Number(env.PROXY_PORT || env.PORT || 3001),
    origins: String(env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    redisUrl: env.REDIS_URL,
    redisNamespace: env.REDIS_NAMESPACE || "weaver",
    rateLimitWindowMs: Number(env.RATE_LIMIT_WINDOW_MS || 60000),
    rateLimitMaxRequests: Number(env.RATE_LIMIT_MAX_REQUESTS || 30),
    failureAlertThreshold: Number(env.API_FAILURE_ALERT_THRESHOLD || 10),
    alertWebhookUrl: env.ALERT_WEBHOOK_URL || "",
    // Number of reverse-proxy hops in front of this server (Express's
    // "trust proxy" setting). Without this, req.ip is the socket peer —
    // behind any load balancer/PaaS that's the LB's own IP for every
    // client, so per-client rate limiting silently collapses into one
    // shared bucket for all users (see SECURITY.md / audit notes).
    // Required explicitly in production rather than defaulting, because
    // guessing the hop count wrong is its own vulnerability: too low
    // breaks rate limiting the same way as unset, too high lets a
    // client spoof X-Forwarded-For to pick any identity it wants.
    trustProxyHops: env.TRUST_PROXY_HOPS
      ? Number(env.TRUST_PROXY_HOPS)
      : production
        ? null
        : 0,
  };
  if (production && !config.origins.length)
    throw new Error("ALLOWED_ORIGINS must be configured in production");
  if (production && !config.redisUrl)
    throw new Error("REDIS_URL must be configured in production");
  if (production && !/^rediss:\/\//i.test(config.redisUrl))
    throw new Error("REDIS_URL must use rediss:// TLS in production");
  if (
    config.alertWebhookUrl &&
    !config.alertWebhookUrl.startsWith("https://")
  ) {
    throw new Error("ALERT_WEBHOOK_URL must use HTTPS");
  }
  if (
    !Number.isInteger(config.rateLimitMaxRequests) ||
    config.rateLimitMaxRequests < 1
  ) {
    throw new Error("RATE_LIMIT_MAX_REQUESTS must be a positive integer");
  }
  if (
    production &&
    (config.trustProxyHops === null ||
      !Number.isInteger(config.trustProxyHops) ||
      config.trustProxyHops < 1)
  ) {
    throw new Error(
      "TRUST_PROXY_HOPS must be set to a positive integer in production " +
        "(the number of reverse-proxy hops in front of this server) — " +
        "without it, per-client rate limiting does not work correctly " +
        "behind a load balancer.",
    );
  }
  return config;
}

module.exports = { loadConfig };
