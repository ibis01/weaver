// ================================================================
// cf-worker/index.test.js
// Security-boundary and error-path tests for the Weaver proxy Worker.
//
// Run with:  npx vitest run
// ================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import { env, SELF } from "cloudflare:test";
import worker from "./index.js";

const VALID_ORIGIN = "https://ibis01.github.io";
const VALID_EVM_ADDRESS = "0x0000000000000000000000000000000000000000";
const VALID_DEPLOYER = "0x0000000000000000000000000000000000000001";

// A minimal valid Bitquery success payload.
const BITQUERY_OK = {
  data: {
    EVM: {
      Calls: [
        {
          Call: { To: null, From: VALID_DEPLOYER, Create: true },
          Receipt: {
            ContractAddress: "0x0000000000000000000000000000000000000002",
          },
          Transaction: { Hash: "0xabc", From: VALID_DEPLOYER },
          Block: { Time: "2026-09-20T00:00:00Z" },
        },
      ],
    },
  },
};

function jsonRequest(
  body,
  { method = "POST", origin = null, headers = {} } = {},
) {
  const h = { "Content-Type": "application/json", ...headers };
  if (origin) h["Origin"] = origin;
  return new Request("https://worker.example/bitquery/deployer", {
    method,
    headers: h,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("POST /bitquery/deployer", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects missing body", async () => {
    const resp = await worker.fetch(jsonRequest(undefined), env);
    expect(resp.status).toBe(400);
  });

  it("rejects invalid JSON body", async () => {
    const req = new Request("https://worker.example/bitquery/deployer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    const resp = await worker.fetch(req, env);
    expect(resp.status).toBe(400);
  });

  it("rejects unsupported chain", async () => {
    const resp = await worker.fetch(
      jsonRequest({ chain: "solana", deployerAddress: VALID_DEPLOYER }),
      env,
    );
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.error).toMatch(/Unsupported chain/i);
  });

  it("rejects malformed deployer address", async () => {
    const resp = await worker.fetch(
      jsonRequest({ chain: "ethereum", deployerAddress: "0xnothex" }),
      env,
    );
    expect(resp.status).toBe(400);
  });

  it("ignores client-supplied GraphQL query", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify(BITQUERY_OK), { status: 200 }),
      );
    await worker.fetch(
      jsonRequest({
        chain: "ethereum",
        deployerAddress: VALID_DEPLOYER,
        query: "{ EVM { Calls { Call { To } } } }",
      }),
      env,
    );
    const sentBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(sentBody.query).toContain("DeployerContracts");
    expect(sentBody.query).not.toContain("query: ");
  });

  it("ignores client-supplied Authorization header", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify(BITQUERY_OK), { status: 200 }),
      );
    await worker.fetch(
      jsonRequest(
        { chain: "ethereum", deployerAddress: VALID_DEPLOYER },
        { headers: { Authorization: "Bearer attacker" } },
      ),
      env,
    );
    const sentHeaders = fetchSpy.mock.calls[0][1].headers;
    expect(sentHeaders.Authorization).toBe(`Bearer ${env.BITQUERY_KEY}`);
  });

  it("returns 503 when BITQUERY_KEY is missing", async () => {
    const emptyEnv = { ...env, BITQUERY_KEY: undefined };
    const resp = await worker.fetch(
      jsonRequest({ chain: "ethereum", deployerAddress: VALID_DEPLOYER }),
      emptyEnv,
    );
    expect(resp.status).toBe(503);
  });

  it("returns 502 on Bitquery HTTP failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("upstream exploded", { status: 500 }),
    );
    const resp = await worker.fetch(
      jsonRequest({ chain: "ethereum", deployerAddress: VALID_DEPLOYER }),
      env,
    );
    expect(resp.status).toBe(502);
  });

  it("returns 502 on GraphQL errors array", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ data: null, errors: [{ message: "bad query" }] }),
        { status: 200 },
      ),
    );
    const resp = await worker.fetch(
      jsonRequest({ chain: "ethereum", deployerAddress: VALID_DEPLOYER }),
      env,
    );
    expect(resp.status).toBe(502);
    const body = await resp.json();
    expect(body.error).toMatch(/GraphQL errors/i);
  });

  it("returns 502 on malformed upstream JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not json at all", { status: 200 }),
    );
    const resp = await worker.fetch(
      jsonRequest({ chain: "ethereum", deployerAddress: VALID_DEPLOYER }),
      env,
    );
    expect(resp.status).toBe(502);
  });

  it("passes through a valid Bitquery response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(BITQUERY_OK), { status: 200 }),
    );
    const resp = await worker.fetch(
      jsonRequest({ chain: "ethereum", deployerAddress: VALID_DEPLOYER }),
      env,
    );
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.data.EVM.Calls).toHaveLength(1);
  });
});

describe("method and route isolation", () => {
  it("rejects GET /bitquery/deployer with 405", async () => {
    const req = new Request("https://worker.example/bitquery/deployer", {
      method: "GET",
    });
    const resp = await worker.fetch(req, env);
    expect(resp.status).toBe(405);
  });

  it("rejects POST to a GoPlus route with 405", async () => {
    const req = new Request(
      "https://worker.example/goplus/evm/1?contract_addresses=0x0",
      { method: "POST" },
    );
    const resp = await worker.fetch(req, env);
    expect(resp.status).toBe(405);
  });

  it("rejects unknown path with 404", async () => {
    const req = new Request("https://worker.example/nope");
    const resp = await worker.fetch(req, env);
    expect(resp.status).toBe(404);
  });
});

describe("origin handling", () => {
  it("allows requests with no Origin header (curl, server-side)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(BITQUERY_OK), { status: 200 }),
    );
    const resp = await worker.fetch(
      jsonRequest({ chain: "ethereum", deployerAddress: VALID_DEPLOYER }),
      env,
    );
    expect(resp.status).toBe(200);
    expect(resp.headers.get("Access-Control-Allow-Origin")).toBe("null");
  });

  it("rejects disallowed Origin with 403", async () => {
    const resp = await worker.fetch(
      jsonRequest(
        { chain: "ethereum", deployerAddress: VALID_DEPLOYER },
        { origin: "https://evil.example" },
      ),
      env,
    );
    expect(resp.status).toBe(403);
  });

  it("allows allowlisted Origin and sets CORS header", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(BITQUERY_OK), { status: 200 }),
    );
    const resp = await worker.fetch(
      jsonRequest(
        { chain: "ethereum", deployerAddress: VALID_DEPLOYER },
        { origin: VALID_ORIGIN },
      ),
      env,
    );
    expect(resp.status).toBe(200);
    expect(resp.headers.get("Access-Control-Allow-Origin")).toBe(VALID_ORIGIN);
    expect(resp.headers.get("Vary")).toBe("Origin");
  });

  it("answers OPTIONS preflight with 204 and CORS headers", async () => {
    const req = new Request("https://worker.example/bitquery/deployer", {
      method: "OPTIONS",
      headers: { Origin: VALID_ORIGIN },
    });
    const resp = await worker.fetch(req, env);
    expect(resp.status).toBe(204);
    expect(resp.headers.get("Access-Control-Allow-Methods")).toMatch(/POST/);
  });
});
