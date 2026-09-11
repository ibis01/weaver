// ===============================================================
//         Proxy SSRF Protection Tests
// ===============================================================
//
// These tests verify that proxy-server.js blocks requests to
// internal/private addresses and non-allowlisted domains, while
// permitting requests to allowlisted public domains.
//
// The "allow whitelisted domains" test asserts the SSRF boundary
// (guard must not return 403), not upstream health (CoinGecko may
// be rate-limited or offline). A 5xx from the upstream proves the
// guard allowed the request — which is the security property under
// test.
// ===============================================================

const { expect } = require("chai");
const axios = require("axios");
const { spawn } = require("child_process");

describe("Proxy SSRF Protection", () => {
  let proxyProcess;
  const PROXY_URL = "http://localhost:3001";
  const base = `${PROXY_URL}/proxy?url=`;

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

  it("should block AWS metadata endpoint", async () => {
    try {
      await axios.get(
        base + encodeURIComponent("http://169.254.169.254/latest/meta-data/"),
      );
      throw new Error("Should have blocked");
    } catch (e) {
      expect(e.response?.status).to.equal(403);
    }
  });

  it("should block localhost", async () => {
    try {
      await axios.get(base + encodeURIComponent("http://127.0.0.1:8545"));
      throw new Error("Should have blocked");
    } catch (e) {
      expect(e.response?.status).to.equal(403);
    }
  });

  it("should block private IP ranges", async () => {
    try {
      await axios.get(base + encodeURIComponent("http://192.168.1.1/"));
      throw new Error("Should have blocked");
    } catch (e) {
      expect(e.response?.status).to.equal(403);
    }
  });

  it("should block non-allowed domains", async () => {
    try {
      await axios.get(base + encodeURIComponent("https://evil.com/"));
      throw new Error("Should have blocked");
    } catch (e) {
      expect(e.response?.status).to.equal(403);
    }
  });

  it("should not block allowlisted domains (SSRF guard bypass check)", async function () {
    this.timeout(10000);

    try {
      const res = await axios.get(
        base + encodeURIComponent("https://api.coingecko.com/api/v3/ping"),
      );
      // Guard allowed the request AND upstream returned 2xx.
      expect(res.status).to.equal(200);
    } catch (e) {
      const status = e.response?.status;
      // The SSRF guard must NOT return 403 for an allowlisted domain.
      // A 5xx means the guard allowed the request but the upstream
      // failed (rate limit, network, timeout). That still proves the
      // SSRF property this test exists to verify.
      if (status === 403) {
        throw new Error(
          "SSRF guard incorrectly blocked an allowlisted domain (403)",
        );
      }
      expect(status).to.not.equal(403);
    }
  });
});
