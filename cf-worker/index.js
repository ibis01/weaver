// ================================================================
// cf-worker/index.js – Weaver's own CORS proxy
// ================================================================

import { handleMemeAlert } from "./src/meme-alert.js";

const ALLOWED_ORIGINS = [
  "https://ibis01.github.io",
  "http://localhost:3000",
  "http://localhost:5500",
  "http://localhost:8080",
  "http://127.0.0.1:5500",
];

const GOPLUS_EVM_BASE = "https://api.gopluslabs.io/api/v1/token_security";
const GOPLUS_SOLANA_BASE =
  "https://api.gopluslabs.io/api/v1/solana/token_security";
const ETHERSCAN_BASE = "https://api.etherscan.io/v2/api";
const HELIUS_PARSED_EVENTS_URL =
  "https://mainnet.helius-rpc.com/v1/parsed-events/transaction-history";
const PUMPFUN_PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
const CREATE_INSTRUCTION_NAMES = new Set(["create", "create_v2"]);

const MAX_HELIUS_PAGES = 3;
const HELIUS_PAGE_SIZE = 100;

const ALLOWED_EVM_CHAIN_IDS = new Set([
  "1",
  "56",
  "8453",
  "42161",
  "137",
  "43114",
  "10",
  "250",
  "25",
  "100",
]);

const ALLOWED_PROXY_HOSTS = new Set([
  "api.coinpaprika.com",
  "api.coinlore.net",
  "api.coinbase.com",
  "api.exchange.coinbase.com",
  "api.alternative.me",
  "api.dexscreener.com",
  "api.llama.fi",
  "api.binance.com",
  "api.kraken.com",
  "api.bybit.com",
  "api.gopluslabs.io",
  "api.etherscan.io",
  "api.polygonscan.com",
  "api.arbiscan.io",
  "api.snowtrace.io",
  "api.solscan.io",
  "ethereum.publicnode.com",
  "bsc-rpc.publicnode.com",
  "mainnet.helius-rpc.com",
  "eth.blockscout.com",
  "mempool.space",
  "www.coindesk.com",
  "cointelegraph.com",
  "decrypt.co",
]);

const CHAIN_TO_ETHERSCAN_ID = Object.freeze({
  ethereum: "1",
  bsc: "56",
  base: "8453",
  arbitrum: "42161",
  polygon: "137",
  optimism: "10",
  avalanche: "43114",
});

const EVM_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const SOLANA_ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const FETCH_TIMEOUT_MS = 10000;
const MAX_UPSTREAM_BYTES = 5 * 1024 * 1024;
const GOPLUS_RATE_LIMIT_CODE = 4029;
const GOPLUS_MAX_ATTEMPTS = 3;
const GOPLUS_BASE_DELAY_MS = 400;
const PROXY_CACHE_FRESH_SECONDS = 60;
const PROXY_CACHE_STALE_MAX_SECONDS = 600;
const GOPLUS_CACHE_FRESH_SECONDS = 300;
const GOPLUS_CACHE_STALE_MAX_SECONDS = 900;

const DAILY_BUDGETS = {
  goplus: 500,
  etherscan: 5000,
  helius: 50000,
};

function budgetKey(provider, date = new Date()) {
  const today = date.toISOString().slice(0, 10);
  return `budget:${provider}:${today}`;
}

async function checkAndIncrementBudget(env, provider) {
  if (!env?.MEME_ALERTS) return true;
  const key = budgetKey(provider);
  try {
    const current = Number(await env.MEME_ALERTS.get(key)) || 0;
    const limit = DAILY_BUDGETS[provider] || 1000;
    if (current >= limit) {
      console.warn(
        `[Budget] ${provider} daily limit reached (${current}/${limit})`,
      );
      return false;
    }
    await env.MEME_ALERTS.put(key, String(current + 1), {
      expirationTtl: 2 * 24 * 60 * 60,
    });
    return true;
  } catch (e) {
    console.error(`[Budget] Check failed for ${provider}:`, e.message);
    return true;
  }
}

const __inflightFetches = new Map();

const DISCOVERY_KV_KEY = "discovery:snapshot:latest";
const SUPPORTED_DISCOVERY_CHAINS = new Set([
  "ethereum",
  "solana",
  "base",
  "bsc",
  "arbitrum",
]);

async function runDiscoveryScan(env) {
  console.log("[Discovery] Starting scheduled scan...");

  try {
    const dexRes = await fetch(
      "https://api.dexscreener.com/latest/dex/search?q=PEPE",
    );
    if (!dexRes.ok) throw new Error(`DexScreener returned ${dexRes.status}`);

    const dexData = await dexRes.json();
    const rawPairs = dexData.pairs || [];

    const uniqueTokens = [
      ...new Map(rawPairs.map((p) => [p.baseToken.address, p])).values(),
    ]
      .filter((p) => SUPPORTED_DISCOVERY_CHAINS.has(p.chainId))
      .slice(0, 10);

    const enrichedTokens = [];

    for (const token of uniqueTokens) {
      const chainId = token.chainId;
      let secData = null;

      if (chainId === "ethereum") {
        const hasBudget = await checkAndIncrementBudget(env, "goplus");
        if (hasBudget) {
          try {
            const url = `${GOPLUS_EVM_BASE}/1?contract_addresses=${token.baseToken.address}`;
            const secRes = await fetch(url);
            const data = await secRes.json();
            if (data.code === 1) {
              secData = data.result[token.baseToken.address.toLowerCase()];
            }
          } catch (err) {
            console.warn(
              `[Discovery] GoPlus failed for ${token.baseToken.symbol}:`,
              err.message,
            );
          }
        } else {
          console.warn(
            `[Discovery] Skipping GoPlus for ${token.baseToken.symbol} — budget exhausted`,
          );
        }
      }

      enrichedTokens.push({
        address: token.baseToken.address,
        symbol: token.baseToken.symbol,
        chainId: chainId,
        priceUsd: token.priceUsd,
        liquidity: token.liquidity?.usd || 0,
        security: secData,
      });
    }

    const now = Date.now();
    const snapshot = {
      _meta: {
        generatedAt: now,
        generatedAtIso: new Date(now).toISOString(),
        staleAfter: now + 30 * 60 * 1000,
        source: "worker-cron",
        chains: [...SUPPORTED_DISCOVERY_CHAINS],
        methodologyVersion: "discovery-v2",
      },
      timestamp: now,
      tokenCount: enrichedTokens.length,
      tokens: enrichedTokens,
    };

    await env.MEME_ALERTS.put(DISCOVERY_KV_KEY, JSON.stringify(snapshot));
    console.log(
      `[Discovery] Scan complete. Saved ${enrichedTokens.length} tokens to KV.`,
    );
  } catch (error) {
    console.error("[Discovery] Scan failed:", error.message);
  }
}

async function fetchUpstreamCaptured(effectiveTarget, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const upstream = await fetch(effectiveTarget, {
      ...init,
      signal: controller.signal,
    });
    if (upstream.ok) {
      const text = await readTextWithCap(upstream);
      const contentType =
        upstream.headers.get("content-type") || "application/json";
      return { ok: true, status: upstream.status, text, contentType };
    }
    const errorText = await upstream.text().catch(() => "");
    return { ok: false, status: upstream.status, errorText };
  } catch (e) {
    return { ok: false, status: 0, networkError: true };
  } finally {
    clearTimeout(timer);
  }
}

function fetchWithCoalesce(effectiveTarget, init, method) {
  if (method !== "GET") return fetchUpstreamCaptured(effectiveTarget, init);
  const existing = __inflightFetches.get(effectiveTarget);
  if (existing) return existing;
  const p = fetchUpstreamCaptured(effectiveTarget, init).finally(() => {
    __inflightFetches.delete(effectiveTarget);
  });
  __inflightFetches.set(effectiveTarget, p);
  return p;
}

function corsHeaders(origin) {
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : "null";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function jsonResponse(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

async function readTextWithCap(resp) {
  const declared = Number(resp.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_UPSTREAM_BYTES) {
    throw new Error("Upstream response too large (declared)");
  }
  const text = await resp.text();
  if (text.length > MAX_UPSTREAM_BYTES) {
    throw new Error("Upstream response too large (actual)");
  }
  return text;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(ms) {
  return Math.floor(Math.random() * ms);
}

async function fetchGoPlusOnce(upstreamUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const headers = { "User-Agent": "WeaverProxy/1.0" };
  try {
    const resp = await fetch(upstreamUrl, {
      signal: controller.signal,
      headers,
      redirect: "manual",
    });
    const text = await readTextWithCap(resp);
    return { status: resp.status, text };
  } finally {
    clearTimeout(timeout);
  }
}

async function relay(upstreamUrl, headers) {
  let lastPayload = null;
  for (let attempt = 0; attempt < GOPLUS_MAX_ATTEMPTS; attempt++) {
    let result;
    try {
      result = await fetchGoPlusOnce(upstreamUrl);
    } catch (e) {
      console.error("[relay] GoPlus fetch failed:", e && e.message);
      return jsonResponse(
        { code: 0, message: "Upstream fetch failed" },
        502,
        headers,
      );
    }
    let parsed = null;
    try {
      parsed = JSON.parse(result.text);
    } catch (_) {
      return new Response(result.text, {
        status: result.status,
        headers: { "Content-Type": "application/json", ...headers },
      });
    }
    const isRateLimited = parsed && parsed.code === GOPLUS_RATE_LIMIT_CODE;
    if (!isRateLimited) {
      return new Response(result.text, {
        status: result.status,
        headers: { "Content-Type": "application/json", ...headers },
      });
    }
    lastPayload = parsed;
    if (attempt < GOPLUS_MAX_ATTEMPTS - 1) {
      const delay = GOPLUS_BASE_DELAY_MS * Math.pow(2, attempt) + jitter(250);
      await sleep(delay);
    }
  }
  return jsonResponse(
    {
      code: GOPLUS_RATE_LIMIT_CODE,
      message:
        lastPayload && lastPayload.message
          ? lastPayload.message
          : "GoPlus rate limit exceeded after retries.",
    },
    429,
    headers,
  );
}

async function relayGoPlus(upstreamUrl, headers, env, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(upstreamUrl, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const cached = await cache.match(cacheKey);
  if (cached) {
    const cachedAt = Number(cached.headers.get("X-Weaver-Cached-At") || 0);
    const age = (Date.now() - cachedAt) / 1000;
    if (age <= GOPLUS_CACHE_FRESH_SECONDS) {
      const body = await cached.text();
      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "X-Weaver-Goplus-Cache": "HIT",
          ...headers,
        },
      });
    }
  }
  const response = await relay(upstreamUrl, headers, env);
  if (response.status === 200) {
    const body = await response.clone().text();
    try {
      const parsed = JSON.parse(body);
      if (parsed.code === 1) {
        const toCache = new Response(body, {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": `public, max-age=${GOPLUS_CACHE_STALE_MAX_SECONDS}`,
            "X-Weaver-Cached-At": String(Date.now()),
          },
        });
        if (ctx && typeof ctx.waitUntil === "function") {
          ctx.waitUntil(cache.put(cacheKey, toCache));
        } else {
          await cache.put(cacheKey, toCache);
        }
        return new Response(body, {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "X-Weaver-Goplus-Cache": "MISS",
            ...headers,
          },
        });
      }
    } catch (_) {}
  }
  return response;
}

async function relayEtherscanDeployer(env, chainId, address, headers) {
  if (!env || typeof env.ETHERSCAN_KEY !== "string" || !env.ETHERSCAN_KEY) {
    return jsonResponse(
      { error: "Etherscan not configured on this Worker (set ETHERSCAN_KEY)" },
      503,
      headers,
    );
  }
  const hasBudget = await checkAndIncrementBudget(env, "etherscan");
  if (!hasBudget) {
    return jsonResponse(
      {
        error: "Etherscan daily budget exhausted",
        code: "BUDGET_EXHAUSTED",
        retryable: true,
      },
      429,
      headers,
    );
  }
  const url =
    `${ETHERSCAN_BASE}?chainid=${encodeURIComponent(chainId)}` +
    `&module=account&action=txlist` +
    `&address=${encodeURIComponent(address)}` +
    `&sort=asc` +
    `&apikey=${encodeURIComponent(env.ETHERSCAN_KEY)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let upstreamResp;
  let upstreamText;
  try {
    upstreamResp = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "WeaverProxy/1.0", Accept: "application/json" },
      redirect: "manual",
    });
    upstreamText = await readTextWithCap(upstreamResp);
  } catch (e) {
    console.error("[relayEtherscanDeployer] fetch failed:", e && e.message);
    return jsonResponse(
      { error: "Etherscan upstream unavailable" },
      502,
      headers,
    );
  } finally {
    clearTimeout(timeout);
  }
  if (!upstreamResp.ok) {
    const status = upstreamResp.status;
    const isRateLimited = status === 429;
    return jsonResponse(
      {
        error: `Etherscan upstream returned HTTP ${status}`,
        code: isRateLimited
          ? "ETHERSCAN_RATE_LIMITED"
          : "ETHERSCAN_UPSTREAM_ERROR",
        retryable: true,
      },
      isRateLimited ? 429 : 502,
      headers,
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(upstreamText);
  } catch (e) {
    return jsonResponse(
      { error: "Etherscan returned a non-JSON response" },
      502,
      headers,
    );
  }
  if (!parsed || typeof parsed !== "object") {
    return jsonResponse(
      { error: "Etherscan returned an unexpected shape" },
      502,
      headers,
    );
  }
  const status = parsed.status;
  const message = typeof parsed.message === "string" ? parsed.message : "";
  const result = parsed.result;
  if (status === "0") {
    const lower = message.toLowerCase();
    if (lower.includes("no transactions found")) {
      return jsonResponse(
        {
          deployer: address,
          chainId,
          contracts: [],
          truncated: false,
          source: "etherscan",
        },
        200,
        headers,
      );
    }
    if (lower.includes("rate limit") || lower.includes("max rate")) {
      return jsonResponse(
        {
          error: "Etherscan rate limit reached",
          code: "ETHERSCAN_RATE_LIMITED",
          retryable: true,
        },
        429,
        headers,
      );
    }
    return jsonResponse(
      {
        error: `Etherscan rejected the request`,
        code: "ETHERSCAN_UPSTREAM_ERROR",
        retryable: false,
      },
      502,
      headers,
    );
  }
  if (!Array.isArray(result)) {
    return jsonResponse(
      { error: "Etherscan returned a non-array result" },
      502,
      headers,
    );
  }
  const contracts = [];
  for (const tx of result) {
    if (!tx || typeof tx !== "object") continue;
    const contractAddress =
      typeof tx.contractAddress === "string" ? tx.contractAddress.trim() : "";
    if (
      !contractAddress ||
      contractAddress === "0x" ||
      contractAddress.length < 42
    )
      continue;
    if (!EVM_ADDRESS_PATTERN.test(contractAddress)) continue;
    const blockNumber = Number(tx.blockNumber);
    const timestamp = Number(tx.timeStamp);
    contracts.push({
      address: contractAddress.toLowerCase(),
      txHash: typeof tx.hash === "string" ? tx.hash : null,
      blockNumber: Number.isFinite(blockNumber) ? blockNumber : null,
      deployedAt: Number.isFinite(timestamp) ? timestamp * 1000 : null,
    });
  }
  return jsonResponse(
    {
      deployer: address,
      chainId,
      contracts,
      truncated: result.length >= 10000,
      source: "etherscan",
    },
    200,
    headers,
  );
}

async function relayHeliusDeployer(env, address, headers) {
  if (!env || typeof env.HELIUS_KEY !== "string" || !env.HELIUS_KEY) {
    return jsonResponse(
      { error: "Helius not configured on this Worker (set HELIUS_KEY)" },
      503,
      headers,
    );
  }
  const hasBudget = await checkAndIncrementBudget(env, "helius");
  if (!hasBudget) {
    return jsonResponse(
      {
        error: "Helius daily budget exhausted",
        code: "BUDGET_EXHAUSTED",
        retryable: true,
      },
      429,
      headers,
    );
  }
  const url = `${HELIUS_PARSED_EVENTS_URL}?api-key=${encodeURIComponent(env.HELIUS_KEY)}`;
  const contracts = [];
  let paginationToken = null;
  let pagesFetched = 0;
  let truncated = false;
  while (pagesFetched < MAX_HELIUS_PAGES) {
    const body = {
      address,
      limit: HELIUS_PAGE_SIZE,
      sortOrder: "desc",
      commitment: "confirmed",
    };
    if (paginationToken) body.paginationToken = paginationToken;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let resp;
    let text;
    try {
      resp = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "WeaverProxy/1.0",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        redirect: "manual",
      });
      text = await readTextWithCap(resp);
    } catch (e) {
      if (pagesFetched === 0) {
        return jsonResponse(
          { error: "Helius upstream unavailable" },
          502,
          headers,
        );
      }
      truncated = true;
      break;
    } finally {
      clearTimeout(timer);
    }
    if (!resp.ok) {
      if (resp.status === 429) {
        return jsonResponse(
          {
            error: "Helius rate limit reached",
            code: "HELIUS_RATE_LIMITED",
            retryable: true,
          },
          429,
          headers,
        );
      }
      if (pagesFetched === 0) {
        return jsonResponse(
          { error: `Helius upstream returned HTTP ${resp.status}` },
          502,
          headers,
        );
      }
      truncated = true;
      break;
    }
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return jsonResponse(
        { error: "Helius returned a non-JSON response" },
        502,
        headers,
      );
    }
    const data = parsed && Array.isArray(parsed.data) ? parsed.data : [];
    for (const entry of data) {
      if (!entry || entry.parserStatus !== "OK") continue;
      const inner = entry.parsed;
      if (!inner || inner.transactionStatus !== "OK") continue;
      const instructions = Array.isArray(inner.instructions)
        ? inner.instructions
        : [];
      for (const ix of instructions) {
        if (!ix || typeof ix !== "object") continue;
        if (ix.programId !== PUMPFUN_PROGRAM_ID) continue;
        if (!CREATE_INSTRUCTION_NAMES.has(ix.instructionName)) continue;
        const decoded = ix.decoded;
        if (!decoded || typeof decoded !== "object") continue;
        const accounts = Array.isArray(decoded.accounts)
          ? decoded.accounts
          : [];
        const args =
          decoded.args && typeof decoded.args === "object" ? decoded.args : {};
        const findAccount = (role) => {
          const hit = accounts.find((a) => a && a.name === role);
          return hit && typeof hit.pubkey === "string" ? hit.pubkey : null;
        };
        const mint = findAccount("mint");
        if (typeof mint !== "string" || !mint) continue;
        const creator =
          (typeof args.creator === "string" && args.creator) ||
          findAccount("creator") ||
          findAccount("user") ||
          null;
        contracts.push({
          address: mint,
          txHash: typeof entry.signature === "string" ? entry.signature : null,
          deployedAt: null,
          slot: Number.isFinite(inner.slot) ? inner.slot : null,
          creator,
        });
      }
    }
    paginationToken =
      parsed && typeof parsed.paginationToken === "string"
        ? parsed.paginationToken
        : null;
    pagesFetched += 1;
    if (!paginationToken) break;
  }
  if (paginationToken && pagesFetched >= MAX_HELIUS_PAGES) truncated = true;
  return jsonResponse(
    {
      deployer: address,
      contracts,
      truncated,
      pagesFetched,
      source: "helius",
    },
    200,
    headers,
  );
}

async function relayAllowedProxy(request, url, headers, ctx, env) {
  const target = url.searchParams.get("url");
  if (!target)
    return jsonResponse({ error: "Missing url param" }, 400, headers);
  const targetUrl = (() => {
    try {
      return new URL(target);
    } catch {
      return null;
    }
  })();
  if (!targetUrl) return jsonResponse({ error: "Invalid url" }, 400, headers);
  if (targetUrl.protocol !== "https:") {
    return jsonResponse({ error: "Only https is allowed" }, 400, headers);
  }
  if (!ALLOWED_PROXY_HOSTS.has(targetUrl.hostname)) {
    return jsonResponse(
      { error: `Host not allowed: ${targetUrl.hostname}` },
      403,
      headers,
    );
  }
  let effectiveTarget = targetUrl.toString();
  if (
    targetUrl.hostname === "mainnet.helius-rpc.com" &&
    env &&
    typeof env.HELIUS_KEY === "string" &&
    env.HELIUS_KEY
  ) {
    const keyed = new URL(targetUrl.toString());
    keyed.searchParams.set("api-key", env.HELIUS_KEY);
    effectiveTarget = keyed.toString();
  } else if (
    targetUrl.hostname === "mainnet.helius-rpc.com" &&
    (!env || !env.HELIUS_KEY)
  ) {
    return jsonResponse(
      { error: "Helius RPC not configured on this Worker (set HELIUS_KEY)" },
      503,
      headers,
    );
  }
  const method = request.method === "POST" ? "POST" : "GET";
  const upstreamHeaders = {
    Accept: "application/json",
    "User-Agent": "WeaverProxy/1.0",
  };
  const init = { method, headers: upstreamHeaders, redirect: "manual" };
  if (method === "POST") {
    init.body = await request.text();
    init.headers["Content-Type"] = "application/json";
  }
  const cache = caches.default;
  const cacheKey = new Request(effectiveTarget, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  let cachedResponse = null;
  let cachedAge = Infinity;
  if (method === "GET") {
    cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      const cachedAt = Number(
        cachedResponse.headers.get("X-Weaver-Cached-At") || 0,
      );
      cachedAge = (Date.now() - cachedAt) / 1000;
      if (cachedAge <= PROXY_CACHE_FRESH_SECONDS) {
        const body = await cachedResponse.text();
        return new Response(body, {
          status: 200,
          headers: {
            "Content-Type":
              cachedResponse.headers.get("Content-Type") || "application/json",
            "X-Weaver-Cache": "HIT",
            ...headers,
          },
        });
      }
    }
  }
  const captured = await fetchWithCoalesce(effectiveTarget, init, method);
  const upstreamOk = captured.ok;
  const text = captured.ok ? captured.text : null;
  if (upstreamOk && text !== null) {
    const contentType = captured.contentType || "application/json";
    if (method === "GET") {
      const toCache = new Response(text, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": `public, max-age=${PROXY_CACHE_STALE_MAX_SECONDS}`,
          "X-Weaver-Cached-At": String(Date.now()),
        },
      });
      if (ctx && typeof ctx.waitUntil === "function") {
        ctx.waitUntil(cache.put(cacheKey, toCache.clone()));
      } else {
        await cache.put(cacheKey, toCache.clone());
      }
    }
    return new Response(text, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "X-Weaver-Cache": cachedResponse ? "REVALIDATED" : "MISS",
        ...headers,
      },
    });
  }
  if (
    method === "GET" &&
    cachedResponse &&
    cachedAge <= PROXY_CACHE_STALE_MAX_SECONDS
  ) {
    const staleBody = await cachedResponse.text();
    return new Response(staleBody, {
      status: 200,
      headers: {
        "Content-Type":
          cachedResponse.headers.get("Content-Type") || "application/json",
        "X-Weaver-Cache": "STALE",
        "X-Weaver-Stale-Age": String(Math.floor(cachedAge)),
        ...headers,
      },
    });
  }
  if (!captured.networkError && captured.status > 0) {
    const errorBody =
      captured.errorText ||
      JSON.stringify({ error: `Upstream returned HTTP ${captured.status}` });
    return new Response(errorBody, {
      status: captured.status,
      headers: {
        "Content-Type": "application/json",
        "X-Weaver-Cache": "NONE",
        ...headers,
      },
    });
  }
  return jsonResponse(
    { error: "Upstream fetch failed (timeout or network error)" },
    502,
    { ...headers, "X-Weaver-Cache": "NONE" },
  );
}

async function handleEtherscanDeployerRequest(request, env, headers) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: "Invalid JSON body" }, 400, headers);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonResponse({ error: "Invalid request body" }, 400, headers);
  }
  const chain =
    typeof body.chain === "string" ? body.chain.trim().toLowerCase() : "";
  const address =
    typeof body.deployerAddress === "string" ? body.deployerAddress.trim() : "";
  const chainId = CHAIN_TO_ETHERSCAN_ID[chain];
  if (!chainId) {
    return jsonResponse(
      { error: `Unsupported chain: ${chain || "(missing)"}` },
      400,
      headers,
    );
  }
  if (!EVM_ADDRESS_PATTERN.test(address)) {
    return jsonResponse(
      {
        error: "deployerAddress must be a 0x-prefixed 40-character hex string",
      },
      400,
      headers,
    );
  }
  return relayEtherscanDeployer(env, chainId, address.toLowerCase(), headers);
}

async function handleHeliusDeployerRequest(request, env, headers) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: "Invalid JSON body" }, 400, headers);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonResponse({ error: "Invalid request body" }, 400, headers);
  }
  const chain =
    typeof body.chain === "string" ? body.chain.trim().toLowerCase() : "";
  const address =
    typeof body.deployerAddress === "string" ? body.deployerAddress.trim() : "";
  if (chain !== "solana") {
    return jsonResponse(
      { error: `Unsupported chain for Helius: ${chain || "(missing)"}` },
      400,
      headers,
    );
  }
  if (!SOLANA_ADDRESS_PATTERN.test(address)) {
    return jsonResponse(
      { error: "deployerAddress must be a base58 Solana address" },
      400,
      headers,
    );
  }
  return relayHeliusDeployer(env, address, headers);
}

async function handleRequest(request, env, ctx) {
  const originHeader = request.headers.get("Origin");
  const origin = originHeader || "";
  const headers = corsHeaders(origin);
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (originHeader !== null && !ALLOWED_ORIGINS.includes(origin)) {
    return jsonResponse({ error: "Origin not allowed" }, 403, headers);
  }
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);

  if (
    parts.length === 2 &&
    parts[0] === "etherscan" &&
    parts[1] === "deployer"
  ) {
    if (request.method !== "POST")
      return jsonResponse({ error: "Method not allowed" }, 405, headers);
    return handleEtherscanDeployerRequest(request, env, headers);
  }

  if (parts.length === 2 && parts[0] === "helius" && parts[1] === "deployer") {
    if (request.method !== "POST")
      return jsonResponse({ error: "Method not allowed" }, 405, headers);
    return handleHeliusDeployerRequest(request, env, headers);
  }

  if (
    parts.length === 1 &&
    parts[0] === "provenance" &&
    request.method === "POST"
  ) {
    let body = null;
    try {
      body = await request.json();
    } catch {
      body = null;
    }
    if (!body || typeof body.symbol !== "string" || !body.result) {
      return jsonResponse(
        { error: "symbol and result required" },
        400,
        headers,
      );
    }
    const ranAt = Number(body.ranAt) || Date.now();
    const key = "provenance:v1:" + body.symbol.toLowerCase() + ":" + ranAt;
    const payload = JSON.stringify({
      schemaVersion: "provenance-v1",
      symbol: body.symbol.toUpperCase(),
      tokenAddress:
        typeof body.tokenAddress === "string"
          ? body.tokenAddress.toLowerCase()
          : "",
      ranAt,
      status: typeof body.status === "string" ? body.status : "UNKNOWN",
      reason: typeof body.reason === "string" ? body.reason : "unknown",
      result: body.result,
    });
    await env.MEME_ALERTS.put(key, payload, {
      expirationTtl: 7 * 24 * 60 * 60,
    });
    return jsonResponse({ ok: true, key }, 200, headers);
  }

  if (
    parts.length === 1 &&
    parts[0] === "provenance" &&
    request.method === "GET"
  ) {
    const symbol = (url.searchParams.get("symbol") || "").toLowerCase();
    const limit = Math.min(Number(url.searchParams.get("limit")) || 20, 200);
    const prefix = symbol ? "provenance:v1:" + symbol + ":" : "provenance:v1:";
    const list = await env.MEME_ALERTS.list({ prefix, limit: limit * 3 });
    const out = [];
    for (const k of list.keys) {
      try {
        const v = await env.MEME_ALERTS.get(k.name);
        if (v) out.push(JSON.parse(v));
      } catch {}
    }
    const seen = new Map();
    for (const e of out) seen.set((e.symbol || "") + ":" + (e.ranAt || 0), e);
    const deduped = [...seen.values()].sort(
      (a, b) => (Number(b.ranAt) || 0) - (Number(a.ranAt) || 0),
    );
    return jsonResponse({ entries: deduped.slice(0, limit) }, 200, headers);
  }

  if (
    parts.length === 1 &&
    parts[0] === "provenance" &&
    request.method === "DELETE"
  ) {
    let cursor;
    let deleted = 0;
    do {
      const page = await env.MEME_ALERTS.list({
        prefix: "provenance:v1:",
        cursor,
        limit: 500,
      });
      for (const k of page.keys) {
        await env.MEME_ALERTS.delete(k.name);
        deleted++;
      }
      cursor = page.list_complete ? null : page.cursor;
    } while (cursor);
    return new Response(JSON.stringify({ ok: true, deleted }), {
      headers: { "content-type": "application/json" },
    });
  }

  if (
    parts.length === 1 &&
    parts[0] === "signal" &&
    request.method === "POST"
  ) {
    let body = null;
    try {
      body = await request.json();
    } catch {
      body = null;
    }
    if (!body || !body.signal || typeof body.signal.type !== "string") {
      return new Response(JSON.stringify({ error: "signal required" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    const signal = body.signal;
    const id =
      signal.id ||
      signal.type +
        ":" +
        signal.timestamp +
        ":" +
        Math.random().toString(36).slice(2, 10);
    const key = "signals:v1:" + signal.type + ":" + id;
    await env.MEME_ALERTS.put(key, JSON.stringify(signal), {
      expirationTtl: 60 * 60 * 24 * 7,
    });
    return new Response(JSON.stringify({ ok: true, key }), {
      headers: { "content-type": "application/json" },
    });
  }

  if (
    parts.length === 1 &&
    parts[0] === "signals" &&
    request.method === "GET"
  ) {
    const type = url.searchParams.get("type") || "";
    const since = Number(url.searchParams.get("since")) || 0;
    const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 500);
    const prefix = type ? "signals:v1:" + type + ":" : "signals:v1:";
    const list = await env.MEME_ALERTS.list({ prefix, limit });
    const signals = [];
    for (const k of list.keys) {
      const raw = await env.MEME_ALERTS.get(k.name);
      if (!raw) continue;
      try {
        const sig = JSON.parse(raw);
        if (!sig.timestamp || sig.timestamp < since) continue;
        signals.push(sig);
      } catch {}
    }
    signals.sort((a, b) => b.timestamp - a.timestamp);
    return new Response(JSON.stringify({ signals }), {
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, OPTIONS",
        "access-control-allow-headers": "content-type",
      },
    });
  }

  if (parts.length === 2 && parts[0] === "meme" && parts[1] === "alerts") {
    if (request.method !== "GET")
      return jsonResponse({ error: "Method not allowed" }, 405, headers);
    if (!env || !env.MEME_ALERTS)
      return jsonResponse(
        { error: "Meme alert storage not configured" },
        503,
        headers,
      );
    const since = Number(url.searchParams.get("since")) || 0;
    const until =
      Number(url.searchParams.get("until")) || Number.MAX_SAFE_INTEGER;
    const limit = Math.min(1000, Number(url.searchParams.get("limit")) || 500);
    const cursor = url.searchParams.get("cursor") || undefined;
    const result = await env.MEME_ALERTS.list({
      prefix: "weaver:meme:alert:v2:",
      limit,
      cursor,
    });
    const inWindow = [];
    for (const key of result.keys) {
      const keyParts = key.name.split(":");
      const observedAtMs = Number(keyParts[4]);
      if (!Number.isFinite(observedAtMs)) continue;
      if (observedAtMs < since || observedAtMs >= until) continue;
      inWindow.push(key.name);
    }
    const alerts = [];
    for (let i = 0; i < inWindow.length; i += 25) {
      const slice = inWindow.slice(i, i + 25);
      const values = await Promise.all(
        slice.map((name) => env.MEME_ALERTS.get(name)),
      );
      for (const value of values) {
        if (!value) continue;
        try {
          alerts.push(JSON.parse(value));
        } catch {}
      }
    }
    return jsonResponse(
      {
        alerts,
        cursor: result.cursor || null,
        list_complete: result.list_complete,
        scanned: result.keys.length,
        window: { since, until },
      },
      200,
      headers,
    );
  }

  if (parts.length === 2 && parts[0] === "meme" && parts[1] === "alert") {
    if (request.method !== "POST")
      return jsonResponse({ error: "Method not allowed" }, 405, headers);
    const res = await handleMemeAlert(request, env);
    const merged = new Headers(res.headers);
    for (const [k, v] of Object.entries(headers)) merged.set(k, v);
    return new Response(res.body, { status: res.status, headers: merged });
  }

  if (parts.length === 1 && parts[0] === "proxy") {
    if (request.method !== "GET" && request.method !== "POST")
      return jsonResponse({ error: "Method not allowed" }, 405, headers);
    return relayAllowedProxy(request, url, headers, ctx, env);
  }

  const isGoplusEvm = parts[0] === "goplus" && parts[1] === "evm" && !!parts[2];
  const isGoplusSolana = parts[0] === "goplus" && parts[1] === "solana";
  if (isGoplusEvm || isGoplusSolana) {
    if (request.method !== "GET")
      return jsonResponse({ error: "Method not allowed" }, 405, headers);
    const contractAddresses = url.searchParams.get("contract_addresses");
    if (!contractAddresses)
      return jsonResponse(
        { error: "Missing contract_addresses query param" },
        400,
        headers,
      );
    if (isGoplusEvm) {
      const chainId = parts[2];
      if (!ALLOWED_EVM_CHAIN_IDS.has(chainId))
        return jsonResponse(
          { error: `Unsupported chain id: ${chainId}` },
          400,
          headers,
        );
      const upstream = `${GOPLUS_EVM_BASE}/${chainId}?contract_addresses=${encodeURIComponent(contractAddresses)}`;
      return relayGoPlus(upstream, headers, env, ctx);
    }
    const upstream = `${GOPLUS_SOLANA_BASE}?contract_addresses=${encodeURIComponent(contractAddresses)}`;
    return relayGoPlus(upstream, headers, env, ctx);
  }

  // ── Discovery Routes ───────────────────────────────────────

  if (parts.length === 2 && parts[0] === "discovery" && parts[1] === "scan") {
    if (request.method !== "GET")
      return jsonResponse({ error: "Method not allowed" }, 405, headers);
    ctx.waitUntil(runDiscoveryScan(env));
    return jsonResponse(
      {
        ok: true,
        message:
          "Scan triggered in background. Check /discovery/health in 5 seconds.",
      },
      200,
      headers,
    );
  }

  if (
    parts.length === 2 &&
    parts[0] === "discovery" &&
    parts[1] === "snapshot"
  ) {
    if (request.method !== "GET")
      return jsonResponse({ error: "Method not allowed" }, 405, headers);
    const snapshot = await env.MEME_ALERTS.get(DISCOVERY_KV_KEY);
    if (!snapshot) {
      return jsonResponse(
        { error: "No snapshot available yet. Wait for the next cron run." },
        404,
        headers,
      );
    }
    return new Response(snapshot, {
      status: 200,
      headers: { "Content-Type": "application/json", ...headers },
    });
  }

  if (parts.length === 2 && parts[0] === "discovery" && parts[1] === "health") {
    if (request.method !== "GET")
      return jsonResponse({ error: "Method not allowed" }, 405, headers);
    const budgets = {};
    for (const provider of Object.keys(DAILY_BUDGETS)) {
      const key = budgetKey(provider);
      const used = Number(await env.MEME_ALERTS.get(key)) || 0;
      budgets[provider] = {
        used,
        limit: DAILY_BUDGETS[provider],
        remaining: Math.max(0, DAILY_BUDGETS[provider] - used),
      };
    }
    const snapshot = await env.MEME_ALERTS.get(DISCOVERY_KV_KEY);
    let snapshotMeta = null;
    if (snapshot) {
      try {
        const parsed = JSON.parse(snapshot);
        snapshotMeta = parsed._meta || null;
      } catch {}
    }
    return jsonResponse(
      {
        ok: true,
        now: new Date().toISOString(),
        budgets,
        snapshot: snapshotMeta ? "available" : "empty",
        snapshotMeta,
      },
      200,
      headers,
    );
  }

  // ── Solana Funding Sources (via Solscan) ──
  if (
    parts.length === 2 &&
    parts[0] === "solana" &&
    parts[1] === "funding-sources"
  ) {
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405, headers);
    }
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return jsonResponse({ error: "Invalid JSON body" }, 400, headers);
    }
    const addresses =
      body && Array.isArray(body.addresses) ? body.addresses : [];
    if (addresses.length === 0) {
      return jsonResponse({ error: "Missing addresses array" }, 400, headers);
    }
    if (addresses.length > 50) {
      return jsonResponse(
        { error: "Max 50 addresses per batch" },
        400,
        headers,
      );
    }

    if (!env.SOLSCAN_API_KEY) {
      return jsonResponse(
        { error: "Solscan API key not configured" },
        503,
        headers,
      );
    }

    const solscanUrl = `https://pro-api.solscan.io/v2.0/account/funded_by`;

    try {
      const upstreamResp = await fetch(solscanUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          token: env.SOLSCAN_API_KEY,
        },
        body: JSON.stringify({ addresses }),
      });

      if (!upstreamResp.ok) {
        return jsonResponse(
          { error: `Solscan upstream error: ${upstreamResp.status}` },
          upstreamResp.status,
          headers,
        );
      }

      const data = await upstreamResp.json();
      return jsonResponse({ ok: true, data }, 200, headers);
    } catch (e) {
      console.error("[Solscan Proxy] Fetch failed:", e.message);
      return jsonResponse(
        { error: "Solscan upstream unavailable" },
        502,
        headers,
      );
    }
  }

  return jsonResponse({ error: "Not found" }, 404, headers);
}

export { handleRequest };

export default {
  fetch: (request, env, ctx) => handleRequest(request, env, ctx),
  scheduled: (event, env, ctx) => {
    ctx.waitUntil(runDiscoveryScan(env));
  },
};
