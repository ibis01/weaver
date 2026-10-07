#!/usr/bin/env node
const { createMemeSnapshotStore } = require("../server/meme-snapshot-store");

const DEX = "https://api.dexscreener.com";

// The Worker that stores alerts. Read-only use: this script
// only ever GETs the alert list, never POSTs.
const WORKER_BASE =
  process.env.WEAVER_WORKER_BASE ||
  "https://weaver-proxy.ibis01-weaver.workers.dev";
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
// The Worker's /meme/alerts endpoint reads and JSON-parses
// every matching KV entry before responding. With several
// hundred alerts in the store the response takes longer
// than a DEX Screener call; a 9s timeout aborts it.
const ALERT_FETCH_TIMEOUT_MS = 90000;

async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ALERT_FETCH_TIMEOUT_MS);
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

// Fetch recent alerts and turn them into pairs shaped like
// discoverPairs() output, so the same record() path handles
// them. The 1h calibration horizon needs forward snapshots of
// every alert token; without this, most alerts would be
// skipped forever for lack of observations.
//
// The alert list is bounded (MAX_AGE_HOURS window on the
// calibration side, ~90 day retention on the Worker). Every
// run re-fetches it, so a token that was alerted 6 days ago
// is still snapshotted today as long as the alert is in the
// window.
async function fetchAlertPairs() {
  const url =
    WORKER_BASE.replace(/\/$/, "") +
    "/meme/alerts?since=0&until=" +
    Date.now() +
    "&limit=500";
  let body;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const resp = await fetch(url, { signal: controller.signal });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      body = await resp.json();
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "alert_fetch_failed",
        message: error.message,
        observedAt: new Date().toISOString(),
      }),
    );
    return [];
  }

  const alerts = Array.isArray(body && body.alerts) ? body.alerts : [];
  // Deduplicate by chain+address. A token alerted 5 times over a
  // week is still one token to snapshot.
  const seen = new Map();
  for (const alert of alerts) {
    const ident = alert?.assessment?.identity;
    if (!ident?.chain || !ident?.tokenAddress) continue;
    const key = ident.chain + ":" + ident.tokenAddress;
    if (seen.has(key)) continue;
    seen.set(key, {
      chain: ident.chain,
      address: ident.tokenAddress,
      symbol: alert.symbol || null,
      name: null,
      pairAddress: alert.pairAddress || null,
      // The alert's own price/liquidity, used as a seed for
      // the first snapshot if this token is new to the worker.
      priceUsd: Number.isFinite(Number(alert?.market?.priceUsd))
        ? Number(alert.market.priceUsd)
        : null,
      liquidityUsd: Number.isFinite(Number(alert?.market?.liquidityUsd))
        ? Number(alert.market.liquidityUsd)
        : null,
    });
  }
  return [...seen.values()];
}

async function collectOnce(store) {
  // Two sources of tokens to snapshot:
  //   1. DEX Screener boosts/profiles (existing discovery)
  //   2. Every token that has a recent /meme/alert (the set the
  //      calibration worker will later join against)
  // Without (2), the alert tokens are almost never in (1), and
  // the calibration horizon has no forward snapshots to join
  // against. The two discovery sets are deduplicated by
  // chain+address so a token boosted AND alerted is recorded once.
  const discovered = await discoverPairs();
  const alertPairs = await fetchAlertPairs();
  const merged = new Map();
  for (const p of discovered) {
    const key = p.chain + ":" + p.address;
    merged.set(key, p);
  }
  for (const p of alertPairs) {
    const key = p.chain + ":" + p.address;
    if (!merged.has(key)) merged.set(key, p);
  }
  const pairs = [...merged.values()];
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
