const { expect } = require("chai");
const { loadConfig } = require("../../server/config");

describe("Production configuration", () => {
  it("requires origins and Redis in production", () => {
    expect(() => loadConfig({ NODE_ENV: "production" })).to.throw(
      /ALLOWED_ORIGINS/,
    );
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        ALLOWED_ORIGINS: "https://app.example",
      }),
    ).to.throw(/REDIS_URL/);
  });

  it("rejects insecure alert webhook URLs", () => {
    expect(() =>
      loadConfig({ ALERT_WEBHOOK_URL: "http://alerts.example" }),
    ).to.throw(/HTTPS/);
  });

  it("accepts a complete production configuration without revealing values", () => {
    const config = loadConfig({
      NODE_ENV: "production",
      ALLOWED_ORIGINS: "https://app.example",
      REDIS_URL: "rediss://user:secret@redis.example:6380",
      ALERT_WEBHOOK_URL: "https://alerts.example/hook",
    });
    expect(config.production).to.equal(true);
    expect(config.redisUrl).to.equal("rediss://user:secret@redis.example:6380");
    expect(config.origins).to.deep.equal(["https://app.example"]);
  });
});
