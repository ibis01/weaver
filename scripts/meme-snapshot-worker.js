#!/usr/bin/env node
const { createMemeSnapshotStore } = require("../server/meme-snapshot-store");

const DEX = "https://api.dexscreener.com";
const CHAINS = new Set([
  "solana",
  "ethereum",
  "base",
  "bsc",
  "arbitrum",
  "polygon",
  "avalanche",
]);
const TIMEOUT_MS = 9000;

async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function normalizePairs(raw) {
  const pairs = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.pairs)
      ? raw.pairs
      : [];
  return pairs.filter((pair) => {
    const address = pair?.baseToken?.address;
    return typeof address === "string" && CHAINS.has(pair?.chainId);
  });
}

async function discoverPairs() {
  const [boosts, profiles] = await Promise.allSettled([
    getJson(`${DEX}/token-boosts/latest/v1`),
    getJson(`${DEX}/token-profiles/latest/v1`),
  ]);
  const addresses = new Set();
  for (const result of [boosts, profiles]) {
    if (result.status !== "fulfilled" || !Array.isArray(result.value)) continue;
    for (const item of result.value) {
      if (item?.tokenAddress) addresses.add(item.tokenAddress);
    }
  }
  if (!addresses.size) return [];
  const raw = await getJson(
    `${DEX}/latest/dex/tokens/${[...addresses].slice(0, 30).join(",")}`,
  );
  const byToken = new Map();
  for (const pair of normalizePairs(raw)) {
    const key = `${pair.chainId}:${pair.baseToken.address}`;
    const previous = byToken.get(key);
    if (
      !previous ||
      Number(pair.liquidity?.usd || 0) > Number(previous.liquidity?.usd || 0)
    )
      byToken.set(key, pair);
  }
  return [...byToken.values()];
}

async function collectOnce(store) {
  const pairs = await discoverPairs();
  let recorded = 0;
  for (const pair of pairs) {
    await store.record({
      chain: pair.chainId,
      address: pair.baseToken.address,
      symbol: pair.baseToken.symbol || null,
      name: pair.baseToken.name || null,
      pairAddress: pair.pairAddress || null,
      observedAt: new Date().toISOString(),
      priceUsd: Number.isFinite(Number(pair.priceUsd))
        ? Number(pair.priceUsd)
        : null,
      liquidityUsd: Number.isFinite(Number(pair.liquidity?.usd))
        ? Number(pair.liquidity.usd)
        : null,
      volume24hUsd: Number.isFinite(Number(pair.volume?.h24))
        ? Number(pair.volume.h24)
        : null,
      priceChange: pair.priceChange || null,
      transactions: pair.txns?.h24 || null,
      pairCreatedAt: pair.pairCreatedAt || null,
      source: "dexscreener-boosts-profiles",
    });
    recorded += 1;
  }
  return {
    discovered: pairs.length,
    recorded,
    observedAt: new Date().toISOString(),
  };
}

async function main() {
  const store = createMemeSnapshotStore();
  try {
    if (process.argv.includes("--once")) {
      console.log(JSON.stringify(await collectOnce(store)));
      return;
    }
    const intervalMs = Math.max(
      60_000,
      Number(process.env.MEME_SNAPSHOT_INTERVAL_MS) || 15 * 60_000,
    );
    const run = async () => {
      try {
        console.log(JSON.stringify(await collectOnce(store)));
      } catch (error) {
        console.error(
          JSON.stringify({
            error: error.message,
            observedAt: new Date().toISOString(),
          }),
        );
      }
    };
    await run();
    setInterval(run, intervalMs);
  } finally {
    if (process.argv.includes("--once")) await store.close();
  }
}

if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { discoverPairs, collectOnce, normalizePairs };
