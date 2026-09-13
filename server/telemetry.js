const https = require("https");

function postJson(urlString, payload) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const request = https.request(
      {
        method: "POST",
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(JSON.stringify(payload)),
        },
        timeout: 5000,
      },
      (response) => {
        response.resume();
        response.on("end", () =>
          response.statusCode >= 200 && response.statusCode < 300
            ? resolve()
            : reject(
                new Error(`Alert webhook returned ${response.statusCode}`),
              ),
        );
      },
    );
    request.on("error", reject);
    request.on("timeout", () =>
      request.destroy(new Error("Alert webhook timeout")),
    );
    request.end(JSON.stringify(payload));
  });
}

class Telemetry {
  constructor({ alertUrl, failureAlertThreshold = 10, windowMs = 60000 } = {}) {
    this.alertUrl = alertUrl;
    this.failureAlertThreshold = failureAlertThreshold;
    this.windowMs = windowMs;
    this.failures = new Map();
  }

  emit(event, fields = {}) {
    const payload = {
      service: "weaver-proxy",
      event,
      timestamp: new Date().toISOString(),
      ...fields,
    };
    console.log(JSON.stringify(payload));
    return payload;
  }

  async alert(event, fields = {}) {
    const payload = this.emit(event, fields);
    if (!this.alertUrl) return;
    try {
      await postJson(this.alertUrl, payload);
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "alert_delivery_failed",
          message: error.message,
        }),
      );
    }
  }

  async recordApiFailure(hostname, status, redisState) {
    const now = Date.now();
    const entry = this.failures.get(hostname) || {
      count: 0,
      resetAt: now + this.windowMs,
    };
    if (now >= entry.resetAt) {
      entry.count = 0;
      entry.resetAt = now + this.windowMs;
    }
    entry.count += 1;
    this.failures.set(hostname, entry);
    const metric = await redisState.incrementMetric(`api_failure:${hostname}`, {
      windowMs: this.windowMs,
    });
    this.emit("api_failure", {
      hostname,
      status,
      failuresInWindow: entry.count,
      sharedFailuresInWindow: metric.value,
    });
    if (
      entry.count === this.failureAlertThreshold ||
      metric.value === this.failureAlertThreshold
    ) {
      await this.alert("api_failure_rate_high", {
        hostname,
        failuresInWindow: entry.count,
        sharedFailuresInWindow: metric.value,
        threshold: this.failureAlertThreshold,
      });
    }
  }

  async circuitOpened(hostname, failures, openUntil) {
    await this.alert("circuit_opened", {
      hostname,
      failures,
      openUntil: new Date(openUntil).toISOString(),
    });
  }
}

module.exports = { Telemetry };
