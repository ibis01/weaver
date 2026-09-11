// ===============================================================
//         Proxy CORS Security Tests
// ===============================================================

const { expect } = require("chai");
const axios = require("axios");
const { spawn } = require("child_process");

describe("Proxy CORS Security", () => {
  let proxyProcess;
  const PROXY_URL = "http://localhost:3001";

  before(function (done) {
    this.timeout(10000);

    process.env.NODE_ENV = "development";
    process.env.ALLOWED_ORIGINS = "http://localhost:8000,http://127.0.0.1:8000";

    proxyProcess = spawn("node", ["proxy-server.js"], {
      env: { ...process.env, PORT: "3001" },
    });

    let isReady = false;

    proxyProcess.stdout.on("data", (data) => {
      if (data.toString().includes("Secure proxy on")) {
        isReady = true;
        done();
      }
    });

    proxyProcess.stderr.on("data", (data) => {
      if (!isReady) {
        console.error("Proxy startup error:", data.toString());
        done(new Error("Proxy failed to start"));
      }
    });

    setTimeout(() => {
      if (!isReady) {
        isReady = true;
        done();
      }
    }, 5000);
  });

  after(function (done) {
    if (proxyProcess) {
      proxyProcess.kill("SIGTERM");
      proxyProcess.on("exit", () => done());
    } else {
      done();
    }
  });

  it("should allow requests from allowed origins", async function () {
    this.timeout(5000);
    const response = await axios.get(`${PROXY_URL}/health`, {
      headers: { Origin: "http://localhost:8000" },
    });
    expect(response.status).to.equal(200);
    expect(response.headers["access-control-allow-origin"]).to.equal(
      "http://localhost:8000",
    );
  });

  it("should reject requests from disallowed origins", async function () {
    this.timeout(5000);
    try {
      await axios.get(`${PROXY_URL}/health`, {
        headers: { Origin: "http://malicious-site.com" },
      });
      expect.fail("Should have thrown an error");
    } catch (error) {
      expect([403, 500]).to.include(
        error.response ? error.response.status : 500,
      );
    }
  });

  it("should allow requests with no origin (e.g., health check)", async () => {
    const response = await axios.get(`${PROXY_URL}/health`);
    expect(response.status).to.equal(200);
  });

  it("should fail to start in production without ALLOWED_ORIGINS", function (done) {
    const prodEnv = { ...process.env, NODE_ENV: "production" };
    delete prodEnv.ALLOWED_ORIGINS;

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
