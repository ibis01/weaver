const { expect } = require("chai");
const axios = require("axios");
const { spawn } = require("child_process");

describe("Proxy CORS Security", () => {
  const baseUrl =
    "http://localhost:3001/proxy?url=https://api.coingecko.com/api/v3/ping";
  let proxyProcess;

  before(function (done) {
    // Start proxy with development environment (no ALLOWED_ORIGINS)
    const env = { ...process.env, NODE_ENV: "development" };
    proxyProcess = spawn("node", ["proxy-server.js"], {
      env,
      detached: true,
      stdio: "ignore",
    });
    proxyProcess.unref();
    setTimeout(done, 2000);
  });

  after(() => {
    if (proxyProcess) {
      process.kill(-proxyProcess.pid);
    }
  });

  it("should allow requests from allowed origins", async () => {
    const response = await axios.get(baseUrl, {
      headers: { Origin: "http://localhost:8000" },
    });
    expect(response.status).to.equal(200);
  });

  it("should reject requests from disallowed origins", async () => {
    try {
      await axios.get(baseUrl, {
        headers: { Origin: "https://evil.com" },
      });
      throw new Error("Should have failed");
    } catch (e) {
      expect(e.response.status).to.equal(403);
      expect(e.response.data).to.include("CORS origin not allowed");
    }
  });

  it("should allow requests with no origin (e.g., health check)", async () => {
    const response = await axios.get("http://localhost:3001/health");
    expect(response.status).to.equal(200);
  });

  it("should fail to start in production without ALLOWED_ORIGINS", function (done) {
    const prodEnv = { ...process.env, NODE_ENV: "production" };
    const proc = spawn("node", ["proxy-server.js"], { env: prodEnv });
    let output = "";
    proc.stderr.on("data", (data) => {
      output += data.toString();
    });
    proc.on("exit", (code) => {
      expect(code).to.not.equal(0);
      expect(output).to.include("ALLOWED_ORIGINS must be configured");
      done();
    });
  });

  it("should fail to start in production with empty ALLOWED_ORIGINS", function (done) {
    const prodEnv = {
      ...process.env,
      NODE_ENV: "production",
      ALLOWED_ORIGINS: "   ",
    };
    const proc = spawn("node", ["proxy-server.js"], { env: prodEnv });
    let output = "";
    proc.stderr.on("data", (data) => {
      output += data.toString();
    });
    proc.on("exit", (code) => {
      expect(code).to.not.equal(0);
      expect(output).to.include("ALLOWED_ORIGINS must be configured");
      done();
    });
  });
});
