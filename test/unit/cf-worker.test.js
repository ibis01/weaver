// test/unit/cf-worker.test.js
//
// Step 3 of the deployer graph design. Tests the CF Worker's
// Bitquery route. Uses Node's built-in Request/Response and a
// global fetch mock.
//
// The Worker is an ES module (cf-worker/package.json sets
// type: module). This test file is CommonJS (the repository root
// is CommonJS) and loads the Worker via dynamic import() with an
// absolute file:// URL. Relative paths in dynamic import are
// resolved relative to the importing file, which is correct, but
// using pathToFileURL makes the resolution unambiguous regardless
// of how the test runner loaded this file.

const { expect } = require("chai");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");

const WORKER_FILE = path.resolve(__dirname, "../../cf-worker/index.js");
const WORKER_URL = pathToFileURL(WORKER_FILE).href;

const ORIGIN_OK = "https://ibis01.github.io";
const ORIGIN_BAD = "https://attacker.example.com";
const DEPLOYER = "0xAbCdEf0000000000000000000000000000000001";
const DEPLOYER_LOWER = DEPLOYER.toLowerCase();

describe("CF Worker — Bitquery deployer route", () => {
  let handleRequest;
  let originalFetch;

  before(async () => {
    if (!fs.existsSync(WORKER_FILE)) {
      throw new Error("Worker file not found: " + WORKER_FILE);
    }
    let mod;
    try {
      mod = await import(WORKER_URL);
    } catch (e) {
      throw new Error(
        "Failed to load Worker module at " +
          WORKER_URL +
          ": " +
          (e && e.message),
      );
    }
    // Named export is canonical; the default export's fetch
    // property is the same function and used as a fallback.
    handleRequest =
      mod.handleRequest || (mod.default && mod.default.fetch) || null;
    if (typeof handleRequest !== "function") {
      throw new Error(
        "Worker module did not export a handler. Named export keys: " +
          Object.keys(mod).join(", ") +
          "; default export keys: " +
          (mod.default ? Object.keys(mod.default).join(", ") : "(none)"),
      );
    }
    originalFetch = globalThis.fetch;
  });

  after(() => {
    globalThis.fetch = originalFetch;
  });

  beforeEach(() => {
    globalThis.fetch = originalFetch;
  });

  function req(pathname, opts = {}) {
    const url = `https://worker.example.com${pathname}`;
    const headers = new Headers(opts.headers || {});
    if (opts.origin) headers.set("Origin", opts.origin);
    const init = { method: opts.method || "GET", headers };
    if (opts.body !== undefined) init.body = opts.body;
    return new Request(url, init);
  }

  function env(key = "test-key") {
    return key === null ? {} : { BITQUERY_KEY: key };
  }

  function mockBitquery(responseBody, status = 200) {
    globalThis.fetch = async () => {
      return new Response(JSON.stringify(responseBody), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    };
  }

  // ── Method restrictions ────────────────────────────────────

  it("rejects GET on /bitquery/deployer with 405", async () => {
    const r = req("/bitquery/deployer", {
      method: "GET",
      origin: ORIGIN_OK,
    });
    const resp = await handleRequest(r, env());
    expect(resp.status).to.equal(405);
  });

  it("rejects POST on /goplus/evm/1 with 405", async () => {
    const r = req("/goplus/evm/1?contract_addresses=0xabc", {
      method: "POST",
      origin: ORIGIN_OK,
      body: "{}",
    });
    const resp = await handleRequest(r, env());
    expect(resp.status).to.equal(405);
  });

  // ── Origin gate ────────────────────────────────────────────

     it("allows POST with no Origin header through the Origin gate", async () => {
       // No Origin header → non-browser caller (curl, server-side fetch).
       // CORS does not apply, so the Worker lets it through the gate.
       // Use an unsupported chain so the request stops at body validation
       // (400) without hitting the network. If the Origin gate had fired,
       // we would see 403 instead.
       const r = req("/bitquery/deployer", {
         method: "POST",
         body: JSON.stringify({ chain: "solana", deployerAddress: DEPLOYER }),
       });
       const resp = await handleRequest(r, env());
       expect(resp.status).to.equal(400);
       const body = await resp.json();
       expect(body.error).to.match(/Unsupported chain/);
     });

  it("rejects POST with a disallowed Origin (403)", async () => {
    const r = req("/bitquery/deployer", {
      method: "POST",
      origin: ORIGIN_BAD,
      body: JSON.stringify({ chain: "ethereum", deployerAddress: DEPLOYER }),
    });
    const resp = await handleRequest(r, env());
    expect(resp.status).to.equal(403);
  });

  // ── Body validation ────────────────────────────────────────

  it("rejects a malformed JSON body with 400", async () => {
    const r = req("/bitquery/deployer", {
      method: "POST",
      origin: ORIGIN_OK,
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const resp = await handleRequest(r, env());
    expect(resp.status).to.equal(400);
    const j = await resp.json();
    expect(j.error).to.be.a("string");
  });

  it("rejects an unsupported chain with 400 and does not call upstream", async () => {
    let upstreamCalled = false;
    globalThis.fetch = async () => {
      upstreamCalled = true;
      return new Response("{}");
    };
    const r = req("/bitquery/deployer", {
      method: "POST",
      origin: ORIGIN_OK,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chain: "solana", deployerAddress: DEPLOYER }),
    });
    const resp = await handleRequest(r, env());
    expect(resp.status).to.equal(400);
    expect(upstreamCalled).to.equal(false);
  });

  it("rejects a malformed deployer address with 400 and does not call upstream", async () => {
    let upstreamCalled = false;
    globalThis.fetch = async () => {
      upstreamCalled = true;
      return new Response("{}");
    };
    const r = req("/bitquery/deployer", {
      method: "POST",
      origin: ORIGIN_OK,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chain: "ethereum",
        deployerAddress: "0xSHORT",
      }),
    });
    const resp = await handleRequest(r, env());
    expect(resp.status).to.equal(400);
    expect(upstreamCalled).to.equal(false);
  });

  // ── Happy path ─────────────────────────────────────────────

  it("forwards a constructed query with the API key attached", async () => {
    let captured = null;
    globalThis.fetch = async (url, init) => {
      captured = { url, init };
      return new Response(JSON.stringify({ data: { EVM: { Calls: [] } } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const r = req("/bitquery/deployer", {
      method: "POST",
      origin: ORIGIN_OK,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chain: "ethereum",
        deployerAddress: DEPLOYER,
      }),
    });
    const resp = await handleRequest(r, env("secret-key-123"));
    expect(resp.status).to.equal(200);

    expect(captured.url).to.equal("https://streaming.bitquery.io/graphql");
    expect(captured.init.method).to.equal("POST");
    expect(captured.init.headers.Authorization).to.equal(
      "Bearer secret-key-123",
    );

    const sentBody = JSON.parse(captured.init.body);
    expect(sentBody.query).to.be.a("string");
    expect(sentBody.query).to.include("DeployerContracts");
    expect(sentBody.variables.network).to.equal("eth");
    expect(sentBody.variables.address).to.equal(DEPLOYER_LOWER);
    expect(sentBody.variables.limit).to.be.a("number");
  });

  it("does not forward a client-supplied Authorization header", async () => {
    let captured = null;
    globalThis.fetch = async (url, init) => {
      captured = { url, init };
      return new Response(JSON.stringify({ data: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const r = req("/bitquery/deployer", {
      method: "POST",
      origin: ORIGIN_OK,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer attacker-controlled",
      },
      body: JSON.stringify({
        chain: "ethereum",
        deployerAddress: DEPLOYER,
      }),
    });
    await handleRequest(r, env("worker-secret"));
    expect(captured.init.headers.Authorization).to.equal(
      "Bearer worker-secret",
    );
    expect(captured.init.headers.Authorization).to.not.include("attacker");
  });

  // ── Error handling ─────────────────────────────────────────

  it("rejects a GraphQL response with non-empty errors array (502)", async () => {
    mockBitquery({
      data: null,
      errors: [{ message: "Query complexity exceeded" }],
    });
    const r = req("/bitquery/deployer", {
      method: "POST",
      origin: ORIGIN_OK,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chain: "ethereum",
        deployerAddress: DEPLOYER,
      }),
    });
    const resp = await handleRequest(r, env());
    expect(resp.status).to.equal(502);
    const j = await resp.json();
    expect(j.error).to.include("GraphQL");
  });

  it("translates an upstream 5xx to 502 without reflecting the body", async () => {
    globalThis.fetch = async () => {
      return new Response("Internal Server Error: secret stack trace", {
        status: 500,
        headers: { "Content-Type": "text/plain" },
      });
    };
    const r = req("/bitquery/deployer", {
      method: "POST",
      origin: ORIGIN_OK,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chain: "ethereum",
        deployerAddress: DEPLOYER,
      }),
    });
    const resp = await handleRequest(r, env());
    expect(resp.status).to.equal(502);
    const text = await resp.text();
    expect(text).to.not.include("secret stack trace");
  });

  it("returns 503 when BITQUERY_KEY is not configured", async () => {
    let upstreamCalled = false;
    globalThis.fetch = async () => {
      upstreamCalled = true;
      return new Response("{}");
    };
    const r = req("/bitquery/deployer", {
      method: "POST",
      origin: ORIGIN_OK,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chain: "ethereum",
        deployerAddress: DEPLOYER,
      }),
    });
    const resp = await handleRequest(r, env(null));
    expect(resp.status).to.equal(503);
    expect(upstreamCalled).to.equal(false);
  });

  // ── GoPlus routes regression ───────────────────────────────

  it("GET /goplus/evm/1 still works and forwards to GoPlus", async () => {
    let capturedUrl = null;
    globalThis.fetch = async (url) => {
      capturedUrl = String(url);
      return new Response(JSON.stringify({ code: 1, result: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const r = req(
      "/goplus/evm/1?contract_addresses=0xdac17f958d2ee523a2206206994597c13d831ec7",
      { method: "GET", origin: ORIGIN_OK },
    );
    const resp = await handleRequest(r, env());
    expect(resp.status).to.equal(200);
    expect(capturedUrl).to.include("api.gopluslabs.io");
    expect(capturedUrl).to.include("/1?contract_addresses=");
  });

  it("GET /goplus/evm/999 rejects an unsupported chain id", async () => {
    const r = req("/goplus/evm/999?contract_addresses=0xabc", {
      method: "GET",
      origin: ORIGIN_OK,
    });
    const resp = await handleRequest(r, env());
    expect(resp.status).to.equal(400);
  });
});
