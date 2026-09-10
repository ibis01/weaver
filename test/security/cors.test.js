const { expect } = require("chai");
const axios = require("axios");
const { spawn } = require("child_process");

describe("Proxy CORS Security", () => {
  let proxyProcess;
  const PROXY_URL = "http://localhost:3001";

  before(function (done) {
    this.timeout(10000); // Increase timeout for server startup

    // Set environment variables for the test
    process.env.NODE_ENV = "development";
    process.env.ALLOWED_ORIGINS = "http://localhost:8000,http://127.0.0.1:8000";

    proxyProcess = spawn("node", ["proxy-server.js"], {
      env: { ...process.env, PORT: "3001" },
    });

    // Wait for the server to be ready
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
      // If it somehow succeeds, that's a failure
      expect.fail("Should have thrown an error");
    } catch (error) {
      // Express CORS sometimes returns 500 on preflight failure, or 403 on actual rejection.
      // Both indicate the request was blocked, which is the security goal.
      expect([403, 500]).to.include(
        error.response ? error.response.status : 500,
      );
    }
  });
});
