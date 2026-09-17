// ===============================================================
//    Proxy Rate-Limit Identity Tests (trust proxy configuration)
// ===============================================================
//
// Background: checkRateLimit() in proxy-server.js keys its bucket on
// req.ip. Express's req.ip is the direct socket peer UNLESS "trust
// proxy" is configured — which it was not, prior to this fix. Behind
// any real reverse proxy / load balancer / PaaS front door, that
// means every external client resolves to the *same* req.ip (the
// proxy's own address), so the whole app shares one rate-limit
// bucket instead of one per client. A single user (or bot) can
// exhaust it and deny service to everyone else — the exact opposite
// of what a per-client rate limiter is for.
//
// These tests spawn the real server twice: once with the vulnerable
// (unset / hops=0) configuration to prove the collapse, and once
// with TRUST_PROXY_HOPS=1 (the fix) to prove distinct clients get
// independent budgets. Requests are sent directly (as axios plays
// the role of the single trusted proxy hop, appending X-Forwarded-For
// the way a real load balancer would).
// ===============================================================

const { expect } = require("chai");
const axios = require("axios");
const { spawn } = require("child_process");

function spawnProxy(port, extraEnv) {
  return new Promise((resolve, reject) => {
    const proxyProcess = spawn("node", ["proxy-server.js"], {
      env: {
        ...process.env,
        NODE_ENV: "development",
        ALLOWED_ORIGINS: "http://localhost:8000",
        PORT: String(port),
        RATE_LIMIT_MAX_REQUESTS: "3",
        RATE_LIMIT_WINDOW_MS: "60000",
        ...extraEnv,
      },
    });
    let isReady = false;
    proxyProcess.stdout.on("data", (data) => {
      if (data.toString().includes("Secure proxy listening")) {
        isReady = true;
        resolve(proxyProcess);
      }
    });
    proxyProcess.stderr.on("data", (data) => {
      if (!isReady) reject(new Error("Proxy failed to start: " + data));
    });
    setTimeout(() => {
      if (!isReady) reject(new Error("Proxy startup timed out"));
    }, 8000);
  });
}

// Any URL is fine here — checkRateLimit() runs before URL validation,
// so we only care about whether we get 429 (rate limited) vs anything
// else (403 from domain validation is expected and fine — it proves
// the request got PAST the rate limiter).
async function hit(port, xForwardedFor) {
  try {
    const res = await axios.get(`http://localhost:${port}/proxy`, {
      params: { url: "http://example.com" },
      headers: { "X-Forwarded-For": xForwardedFor },
      validateStatus: () => true,
    });
    return res.status;
  } catch (e) {
    return e.response ? e.response.status : -1;
  }
}

describe("Proxy rate-limit identity (trust proxy)", function () {
  this.timeout(15000);

  it("VULNERABLE config: two different clients share one rate-limit bucket", async () => {
    const port = 3021;
    const proc = await spawnProxy(port, {}); // no TRUST_PROXY_HOPS — reproduces the original bug
    try {
      // Client A makes 2 requests (under the limit of 3 on its own).
      const a1 = await hit(port, "1.1.1.1");
      const a2 = await hit(port, "1.1.1.1");
      // Client B (different IP) makes 2 requests — if identity were
      // correctly separated, B would have its own fresh budget. If
      // the bug is present, B's requests land in A's shared bucket.
      const b1 = await hit(port, "2.2.2.2");
      const b2 = await hit(port, "2.2.2.2");

      expect(a1, "client A req 1").to.not.equal(429);
      expect(a2, "client A req 2").to.not.equal(429);
      expect(b1, "client B req 1 (3rd request overall)").to.not.equal(429);
      // 4th request overall, from a DIFFERENT declared client — with
      // the bug, this is blocked because it's sharing A's bucket.
      expect(
        b2,
        "client B req 2 (4th request overall) — bug means this is wrongly rate-limited",
      ).to.equal(429);
    } finally {
      proc.kill();
    }
  });

  it("FIXED config (TRUST_PROXY_HOPS=1): each client gets its own independent budget", async () => {
    const port = 3022;
    const proc = await spawnProxy(port, { TRUST_PROXY_HOPS: "1" });
    try {
      const clientA = ["10.0.0.1", "10.0.0.1", "10.0.0.1"];
      const clientB = ["20.0.0.1", "20.0.0.1", "20.0.0.1"];

      const resultsA = [];
      for (const ip of clientA) resultsA.push(await hit(port, ip));
      const resultsB = [];
      for (const ip of clientB) resultsB.push(await hit(port, ip));

      // Client A uses its full budget of 3 — none rate-limited.
      expect(resultsA, "client A's own 3 requests").to.not.include(429);
      // Client B, a DIFFERENT identity, should get its own fresh
      // budget of 3 — not be blocked by A having used theirs.
      expect(
        resultsB,
        "client B's 3 requests must not be blocked by client A's usage",
      ).to.not.include(429);
    } finally {
      proc.kill();
    }
  });
});
