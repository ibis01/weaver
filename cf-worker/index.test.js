// ================================================================
// cf-worker/test/index.test.js
// Route tests for the Weaver proxy Worker.
// ================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker from "./index.js";

const VALID_ORIGIN = "https://ibis01.github.io";
const EVM_ADDRESS = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const SOLANA_ADDRESS = "5GAZaDhBM23Jkm195Cdff5V31E2MjEWr7XXxtW3VUjFn";
const PUMPFUN_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";

const env = {
  ETHERSCAN_KEY: "test-etherscan-key",
  HELIUS_KEY: "test-helius-key",
};

function jsonRequest(
  body,
  { path = "/etherscan/deployer", method = "POST", origin = VALID_ORIGIN } = {},
) {
  const headers = { "content-type": "application/json" };
  if (origin !== null) headers.origin = origin;
  return new Request("https://example.com" + path, {
    method,
    headers,
    body:
      method === "POST" && body !== undefined
        ? typeof body === "string"
          ? body
          : JSON.stringify(body)
        : undefined,
  });
}

function ok(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function status(code, body = "error") {
  return new Response(body, { status: code });
}

// ────────────────────────────────────────────────────────────────
// POST /etherscan/deployer
// ────────────────────────────────────────────────────────────────

describe("POST /etherscan/deployer", () => {
  let fetchSpy;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("rejects missing body", async () => {
    const resp = await worker.fetch(jsonRequest(undefined), env);
    expect(resp.status).toBe(400);
  });

  it("rejects invalid JSON body", async () => {
    const resp = await worker.fetch(jsonRequest("not-json"), env);
    expect(resp.status).toBe(400);
  });

  it("rejects unsupported chain", async () => {
    const resp = await worker.fetch(
      jsonRequest({ chain: "tron", deployerAddress: EVM_ADDRESS }),
      env,
    );
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.error).toMatch(/Unsupported chain/i);
  });

  it("rejects malformed deployer address", async () => {
    const resp = await worker.fetch(
      jsonRequest({ chain: "ethereum", deployerAddress: "not-an-address" }),
      env,
    );
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.error).toMatch(/0x-prefixed/i);
  });

  it("returns 503 when ETHERSCAN_KEY is missing", async () => {
    const resp = await worker.fetch(
      jsonRequest({ chain: "ethereum", deployerAddress: EVM_ADDRESS }),
      {},
    );
    expect(resp.status).toBe(503);
    const body = await resp.json();
    expect(body.error).toMatch(/not configured/i);
  });

  it("returns 502 on Etherscan upstream HTTP 500", async () => {
    fetchSpy.mockResolvedValueOnce(status(500));
    const resp = await worker.fetch(
      jsonRequest({ chain: "ethereum", deployerAddress: EVM_ADDRESS }),
      env,
    );
    expect(resp.status).toBe(502);
  });

  it("returns 429 on Etherscan rate-limit message", async () => {
    fetchSpy.mockResolvedValueOnce(
      ok({ status: "0", message: "Max rate limit reached", result: null }),
    );
    const resp = await worker.fetch(
      jsonRequest({ chain: "ethereum", deployerAddress: EVM_ADDRESS }),
      env,
    );
    expect(resp.status).toBe(429);
    const body = await resp.json();
    expect(body.code).toBe("ETHERSCAN_RATE_LIMITED");
    expect(body.retryable).toBe(true);
  });

  it("returns 200 with empty contracts when no transactions found", async () => {
    fetchSpy.mockResolvedValueOnce(
      ok({ status: "0", message: "No transactions found", result: [] }),
    );
    const resp = await worker.fetch(
      jsonRequest({ chain: "ethereum", deployerAddress: EVM_ADDRESS }),
      env,
    );
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.contracts).toEqual([]);
    expect(body.source).toBe("etherscan");
  });

  it("filters out non-creation rows and normalizes creation rows", async () => {
    const deployed = "0xa".repeat(1) + "a".repeat(39); // 40 hex chars
    const deployedFull = "0x" + "a".repeat(40);
    fetchSpy.mockResolvedValueOnce(
      ok({
        status: "1",
        message: "OK",
        result: [
          {
            contractAddress: "",
            hash: "0xnotcreation",
            blockNumber: "100",
            timeStamp: "1700000000",
          },
          {
            contractAddress: "0x",
            hash: "0xempty",
            blockNumber: "101",
            timeStamp: "1700000010",
          },
          {
            contractAddress: deployedFull,
            hash: "0xrealcreation",
            blockNumber: "102",
            timeStamp: "1700000020",
          },
        ],
      }),
    );
    const resp = await worker.fetch(
      jsonRequest({ chain: "ethereum", deployerAddress: EVM_ADDRESS }),
      env,
    );
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.contracts).toHaveLength(1);
    expect(body.contracts[0].address).toBe(deployedFull.toLowerCase());
    expect(body.contracts[0].txHash).toBe("0xrealcreation");
    expect(body.contracts[0].blockNumber).toBe(102);
    expect(body.contracts[0].deployedAt).toBe(1700000020 * 1000);
  });

  it("ignores client-supplied query params and uses the env key", async () => {
    fetchSpy.mockResolvedValueOnce(
      ok({ status: "0", message: "No transactions found", result: [] }),
    );
    await worker.fetch(
      jsonRequest({
        chain: "ethereum",
        deployerAddress: EVM_ADDRESS,
        apikey: "client-attempt-to-override",
        module: "something-else",
      }),
      env,
    );
    const calledUrl = fetchSpy.mock.calls[0][0];
    expect(calledUrl).toContain(`apikey=${env.ETHERSCAN_KEY}`);
    expect(calledUrl).not.toContain("client-attempt-to-override");
    expect(calledUrl).toContain("module=account");
    expect(calledUrl).toContain("action=txlist");
  });
});

// ────────────────────────────────────────────────────────────────
// POST /helius/deployer
// ────────────────────────────────────────────────────────────────

describe("POST /helius/deployer", () => {
  let fetchSpy;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  function heliusReq(body) {
    return jsonRequest(body, { path: "/helius/deployer" });
  }

  it("rejects non-solana chain", async () => {
    const resp = await worker.fetch(
      heliusReq({ chain: "ethereum", deployerAddress: EVM_ADDRESS }),
      env,
    );
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.error).toMatch(/Unsupported chain/i);
  });

  it("rejects malformed Solana address", async () => {
    const resp = await worker.fetch(
      heliusReq({ chain: "solana", deployerAddress: "short" }),
      env,
    );
    expect(resp.status).toBe(400);
  });

  it("returns 503 when HELIUS_KEY is missing", async () => {
    const resp = await worker.fetch(
      heliusReq({ chain: "solana", deployerAddress: SOLANA_ADDRESS }),
      {},
    );
    expect(resp.status).toBe(503);
  });

  it("returns 502 on Helius upstream HTTP 500", async () => {
    fetchSpy.mockResolvedValueOnce(status(500));
    const resp = await worker.fetch(
      heliusReq({ chain: "solana", deployerAddress: SOLANA_ADDRESS }),
      env,
    );
    expect(resp.status).toBe(502);
  });

  it("returns 429 on Helius rate limit", async () => {
    fetchSpy.mockResolvedValueOnce(status(429));
    const resp = await worker.fetch(
      heliusReq({ chain: "solana", deployerAddress: SOLANA_ADDRESS }),
      env,
    );
    expect(resp.status).toBe(429);
    const body = await resp.json();
    expect(body.code).toBe("HELIUS_RATE_LIMITED");
  });

  it("extracts Pump.fun create instructions", async () => {
    fetchSpy.mockResolvedValueOnce(
      ok({
        data: [
          {
            signature: "sig-abc",
            parserStatus: "OK",
            parsed: {
              transactionStatus: "OK",
              slot: 250000000,
              instructions: [
                {
                  programId: PUMPFUN_PROGRAM,
                  instructionName: "create",
                  decoded: {
                    accounts: [
                      {
                        name: "mint",
                        pubkey: "Mint1111111111111111111111111111111111111111",
                      },
                      { name: "creator", pubkey: SOLANA_ADDRESS },
                    ],
                    args: {},
                  },
                },
              ],
            },
          },
        ],
        paginationToken: null,
      }),
    );
    const resp = await worker.fetch(
      heliusReq({ chain: "solana", deployerAddress: SOLANA_ADDRESS }),
      env,
    );
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.source).toBe("helius");
    expect(body.contracts).toHaveLength(1);
    expect(body.contracts[0].address).toBe(
      "Mint1111111111111111111111111111111111111111",
    );
    expect(body.contracts[0].txHash).toBe("sig-abc");
    expect(body.contracts[0].slot).toBe(250000000);
    expect(body.contracts[0].deployedAt).toBeNull();
  });

  it("preserves Solana address case in the response", async () => {
    fetchSpy.mockResolvedValueOnce(
      ok({
        data: [],
        paginationToken: null,
      }),
    );
    const resp = await worker.fetch(
      heliusReq({ chain: "solana", deployerAddress: SOLANA_ADDRESS }),
      env,
    );
    const body = await resp.json();
    expect(body.deployer).toBe(SOLANA_ADDRESS);
  });

  it("returns empty contracts when no Pump.fun creates are present", async () => {
    fetchSpy.mockResolvedValueOnce(
      ok({
        data: [
          {
            signature: "sig-xyz",
            parserStatus: "OK",
            parsed: {
              transactionStatus: "OK",
              slot: 1,
              instructions: [
                {
                  programId: "SomeOtherProgram111111111111111111111111",
                  instructionName: "swap",
                  decoded: { accounts: [], args: {} },
                },
              ],
            },
          },
        ],
        paginationToken: null,
      }),
    );
    const resp = await worker.fetch(
      heliusReq({ chain: "solana", deployerAddress: SOLANA_ADDRESS }),
      env,
    );
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.contracts).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────
// Method and route isolation
// ────────────────────────────────────────────────────────────────

describe("method and route isolation", () => {
  it("rejects GET /etherscan/deployer with 405", async () => {
    const req = new Request("https://example.com/etherscan/deployer", {
      method: "GET",
      headers: { origin: VALID_ORIGIN },
    });
    const resp = await worker.fetch(req, env);
    expect(resp.status).toBe(405);
  });

  it("rejects GET /helius/deployer with 405", async () => {
    const req = new Request("https://example.com/helius/deployer", {
      method: "GET",
      headers: { origin: VALID_ORIGIN },
    });
    const resp = await worker.fetch(req, env);
    expect(resp.status).toBe(405);
  });

  it("rejects POST to a GoPlus route with 405", async () => {
    const req = new Request(
      "https://example.com/goplus/evm/1?contract_addresses=0xabc",
      { method: "POST", headers: { origin: VALID_ORIGIN } },
    );
    const resp = await worker.fetch(req, env);
    expect(resp.status).toBe(405);
  });

  it("rejects unknown path with 404", async () => {
    const req = new Request("https://example.com/totally/unknown", {
      method: "GET",
      headers: { origin: VALID_ORIGIN },
    });
    const resp = await worker.fetch(req, env);
    expect(resp.status).toBe(404);
  });
});

// ────────────────────────────────────────────────────────────────
// Origin handling
// ────────────────────────────────────────────────────────────────

describe("origin handling", () => {
  let fetchSpy;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValue(
      ok({ status: "0", message: "No transactions found", result: [] }),
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("allows requests with no Origin header (curl, server-side)", async () => {
    const resp = await worker.fetch(
      jsonRequest(
        { chain: "ethereum", deployerAddress: EVM_ADDRESS },
        { origin: null },
      ),
      env,
    );
    expect(resp.status).toBe(200);
    expect(resp.headers.get("Access-Control-Allow-Origin")).toBe("null");
  });

  it("rejects disallowed Origin with 403", async () => {
    const resp = await worker.fetch(
      jsonRequest(
        { chain: "ethereum", deployerAddress: EVM_ADDRESS },
        { origin: "https://evil.example.com" },
      ),
      env,
    );
    expect(resp.status).toBe(403);
  });

  it("allows allowlisted Origin and sets CORS header", async () => {
    const resp = await worker.fetch(
      jsonRequest({ chain: "ethereum", deployerAddress: EVM_ADDRESS }),
      env,
    );
    expect(resp.status).toBe(200);
    expect(resp.headers.get("Access-Control-Allow-Origin")).toBe(VALID_ORIGIN);
    expect(resp.headers.get("Vary")).toBe("Origin");
  });

  it("answers OPTIONS preflight with 204 and CORS headers", async () => {
    const req = new Request("https://example.com/etherscan/deployer", {
      method: "OPTIONS",
      headers: { origin: VALID_ORIGIN },
    });
    const resp = await worker.fetch(req, env);
    expect(resp.status).toBe(204);
    expect(resp.headers.get("Access-Control-Allow-Origin")).toBe(VALID_ORIGIN);
    expect(resp.headers.get("Access-Control-Allow-Methods")).toMatch(/POST/);
  });
});
