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
  return config;
}

module.exports = { loadConfig };
