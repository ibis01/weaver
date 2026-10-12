#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { URL, URLSearchParams } = require("node:url");

const WALLETS = [
  "0x648b88823b2a21760f6a714c980b1820fdc50a71",
  "0xcde5d48fca07f9c52300d2e65632dd71ed169b90",
  "0x2ac51184e197248553827704f162234808664759",
  "0xe4aa002d49faf0e62b923c924aac54c25702332b",
  "0x3f9a8345729ea842708e080e238c92731e5699b8",
];
const PEPE = "0x6982508145454ce325ddbe47a25d4ec3d2311933";
const PUMP_DAY = "2026-08-22";
const WINDOW_START = "2026-08-15";
const BLOCKSCOUT = "https://eth.blockscout.com/api";
const BLOCKSCOUT_V2 = "https://eth.blockscout.com/api/v2";
const HEADERS = {
  accept: "application/json",
  "user-agent": "weaver-pattern-check/2.0",
  ...(process.env.BLOCKSCOUT_API_KEY ? { "x-api-key": process.env.BLOCKSCOUT_API_KEY } : {}),
};

const ROUTERS = Object.freeze({
  "0x7a250d5630b4cf539739df2c5dacb4c659f2488d": "Uniswap V2 Router",
  "0xe592427a0aece92de3edee1f18e0157c05861564": "Uniswap V3 Router",
  "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45": "Uniswap V3 Router 2",
  "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad": "Uniswap Universal Router",
  "0xef1c6e67703c7bd7107eed8303fbe6ec2554bf6b": "Uniswap Universal Router (old)",
  "0x1111111254eeb25477b68fb85ed929f73a960582": "1inch V5",
  "0x1111111254fb6c44bac0bed2854e76f90643097d": "1inch V4",
  "0x111111125421ca6dc452d289314280a0f8842a65": "1inch V6",
  "0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f": "SushiSwap Router",
  "0xdef1c0ded9bec7f1a1670819833240f027b25eff": "0x Exchange Proxy",
  "0x9008d19f58aabd9ed0d60971565aa8510560ab41": "CoW Swap Settlement",
  "0xba12222222228d8ba445958a75a0704d566bf2c8": "Balancer Vault",
});
const QUOTES = Object.freeze({
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": { symbol: "WETH", decimals: 18, minimum: 1000000000000000n },
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": { symbol: "USDC", decimals: 6, minimum: 10000000n },
  "0xdac17f958d2ee523a2206206994597c13d831ec7": { symbol: "USDT", decimals: 6, minimum: 10000000n },
  "0x6b175474e89094c44da98b954eedeac495271d0f": { symbol: "DAI", decimals: 18, minimum: 10000000000000000000n },
  "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": { symbol: "WBTC", decimals: 8, minimum: 10000n },
  "0x4fabb145d64652a948d72533023f6e7a623c7c53": { symbol: "BUSD", decimals: 18, minimum: 10000000000000000000n },
});
const DISTRIBUTORS = new Set();

function log(message) { process.stderr.write(`${message}\n`); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function lower(value) { return String(value || "").toLowerCase(); }
function hash(value) { return lower(value && typeof value === "object" ? value.hash : value); }
function nowIso() { return new Date().toISOString(); }
function dayStart(day) { return Date.parse(`${day}T00:00:00.000Z`); }
function formatUnits(raw, decimals) {
  if (raw === null || raw === undefined) return null;
  let value;
  try { value = BigInt(String(raw)); } catch { return null; }
  const negative = value < 0n;
  if (negative) value = -value;
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = String(value % base).padStart(decimals, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}
function addRaw(a, b) {
  try { return (BigInt(a || "0") + BigInt(b || "0")).toString(); } catch { return "0"; }
}
function txSucceeded(tx) {
  const status = typeof tx?.status === "object" ? (tx.status.value || tx.status.status) : tx?.status;
  return status === 1 || String(status || "").toLowerCase() === "ok" || ["success", "succeeded", "1"].includes(String(status || "").toLowerCase());
}
function hasSwapEvent(logs) {
  return (Array.isArray(logs) ? logs : []).some((item) => {
    const decoded = item?.decoded || item?.event || {};
    const name = decoded?.method_call || decoded?.name || decoded?.event;
    return String(name || "").toLowerCase() === "swap";
  });
}

async function fetchJson(url, { timeoutMs = 25000, maxTries = 4, sleepFn = sleep } = {}) {
  for (let attempt = 0; attempt < maxTries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { headers: HEADERS, signal: controller.signal });
      if (response.status === 403 || response.status === 429 || response.status >= 500) {
        if (attempt + 1 < maxTries) { await sleepFn(Math.min(60000, 5000 * 2 ** attempt)); continue; }
      }
      if (!response.ok) {
        log(`provider HTTP ${response.status}: ${url.slice(0, 140)}`);
        return null;
      }
      return await response.json();
    } catch (error) {
      if (attempt + 1 === maxTries) { log(`request failed: ${error.message}`); return null; }
      await sleepFn(Math.min(60000, 5000 * 2 ** attempt));
    } finally { clearTimeout(timer); }
  }
  return null;
}

async function exactBlockAt(date, fetcher = fetchJson) {
  const query = new URLSearchParams({ module: "block", action: "getblocknobytime", timestamp: String(Math.floor(dayStart(date) / 1000)), closest: "before" });
  const data = await fetcher(`${BLOCKSCOUT}?${query}`);
  const block = Number(data?.result?.blockNumber);
  return Number.isSafeInteger(block) && data?.status === "1" ? { block, exact: true } : { block: null, exact: false };
}

async function pagesOf(startUrl, { fetcher = fetchJson, maxPages = 50, sleepFn = sleep, pageSleepMs = 1000 } = {}) {
  const items = [];
  const failedPages = [];
  let url = startUrl;
  for (let page = 1; page <= maxPages; page += 1) {
    const data = await fetcher(url);
    if (!data || !Array.isArray(data.items)) { failedPages.push(page); return { items, complete: false, failedPages }; }
    items.push(...data.items);
    if (!data.next_page_params) return { items, complete: true, failedPages };
    const next = new URL(url);
    for (const key of [...next.searchParams.keys()]) if (Object.hasOwn(data.next_page_params, key)) next.searchParams.delete(key);
    for (const [key, value] of Object.entries(data.next_page_params)) if (value !== null && value !== undefined) next.searchParams.set(key, String(value));
    url = next.toString();
    await sleepFn(pageSleepMs);
  }
  failedPages.push(maxPages + 1);
  return { items, complete: false, failedPages };
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function classifyTx(txHash, wallet, tokenAddr, fetcher = fetchJson) {
  const detail = { txHash, router: null, quoteAsset: null, tokenAmountRaw: "0", tokenAmount: "0", quoteAmountRaw: "0", quoteAmount: "0", transactionSucceeded: false, walletWasSender: false, swapEventDetected: false, minimumSizeMet: false };
  const tx = await fetcher(`${BLOCKSCOUT_V2}/transactions/${txHash}`);
  if (!tx) return { classification: "UNCLASSIFIED", evidence: ["parent transaction unavailable"], detail };
  const walletLower = lower(wallet);
  detail.walletWasSender = hash(tx.from) === walletLower;
  if (!detail.walletWasSender) return { classification: "UNCLASSIFIED", evidence: ["wallet was not transaction originator"], detail };
  if (!txSucceeded(tx)) return { classification: "UNCLASSIFIED", evidence: ["transaction receipt unavailable or reverted"], detail };
  detail.transactionSucceeded = true;
  const txTo = hash(tx.to);
  if (ROUTERS[txTo]) detail.router = ROUTERS[txTo];
  const transfers = await fetcher(`${BLOCKSCOUT_V2}/transactions/${txHash}/token-transfers`);
  if (!transfers || !Array.isArray(transfers.items)) return { classification: "UNCLASSIFIED", evidence: ["token transfers unavailable"], detail };
  let tokenRaw = 0n;
  let tokenDecimals = 18;
  const quoteRaw = new Map();
  const target = lower(tokenAddr);
  for (const transfer of transfers.items) {
    const token = lower(transfer?.token?.address);
    const from = hash(transfer.from); const to = hash(transfer.to);
    const raw = String(transfer?.total?.value ?? "0");
    if (token === target && to === walletLower) { try { tokenRaw += BigInt(raw); tokenDecimals = Number(transfer?.total?.decimals ?? 18); } catch {} }
    if (QUOTES[token] && from === walletLower) quoteRaw.set(token, addRaw(quoteRaw.get(token), raw));
  }
  const quoteEntry = [...quoteRaw.entries()].find(([address, raw]) => BigInt(raw) >= QUOTES[address].minimum) || null;
  const quoteAddress = quoteEntry?.[0] || [...quoteRaw.keys()][0] || null;
  const quoteInfo = quoteAddress ? QUOTES[quoteAddress] : null;
  const logs = await fetcher(`${BLOCKSCOUT_V2}/transactions/${txHash}/logs`);
  detail.swapEventDetected = hasSwapEvent(logs?.items);
  detail.tokenAmountRaw = tokenRaw.toString();
  detail.tokenAmount = formatUnits(tokenRaw.toString(), tokenDecimals);
  detail.quoteAsset = quoteInfo?.symbol || null;
  detail.quoteAmountRaw = quoteEntry?.[1] || "0";
  detail.quoteAmount = quoteInfo ? formatUnits(detail.quoteAmountRaw, quoteInfo.decimals) : "0";
  detail.minimumSizeMet = Boolean(quoteInfo && quoteEntry && BigInt(quoteEntry[1]) >= quoteInfo.minimum);
  const hasToken = tokenRaw > 0n; const hasQuote = Boolean(quoteEntry); const hasRouter = Boolean(ROUTERS[txTo]);
  const evidence = [hasRouter && `interacts with ${ROUTERS[txTo]}`, hasToken && "target token inflow", hasQuote && "quote asset outflow", detail.swapEventDetected && "known swap event detected", "successful transaction"].filter(Boolean);
  if (hasToken && hasQuote && !detail.minimumSizeMet) return { classification: "UNCLASSIFIED", evidence: ["quote outflow below configured minimum trade size"], detail };
  if (hasToken && !hasQuote && DISTRIBUTORS.has(txTo)) return { classification: "AIRDROP_OR_DISTRIBUTION", evidence: ["configured distributor source"], detail };
  if (hasToken && hasQuote && hasRouter && detail.swapEventDetected) return { classification: "CONFIRMED_DEX_BUY", evidence, detail };
  if (hasToken && hasQuote && hasRouter) return { classification: "LIKELY_DEX_BUY", evidence, detail };
  if (hasToken && (hasQuote || hasRouter)) return { classification: "LIKELY_DEX_BUY", evidence, detail };
  if (hasToken) return { classification: "TRANSFER_ONLY", evidence: ["target token inflow without swap evidence"], detail };
  return { classification: "UNCLASSIFIED", evidence: ["no target-token inflow"], detail };
}

async function reVerifyWallet(wallet, tokenAddr, windowStart, windowEnd, options = {}) {
  const fetcher = options.fetcher || fetchJson; const sleepFn = options.sleepFn || sleep;
  const blockCache = options.blockCache || new Map();
  const getBlock = async (date) => {
    if (!blockCache.has(date)) blockCache.set(date, exactBlockAt(date, fetcher));
    return blockCache.get(date);
  };
  const [start, end] = await Promise.all([getBlock(windowStart), getBlock(windowEnd)]);
  if (start.block === null || end.block === null) return { wallet, status: "ERROR", reason: "block_lookup_failed", blockRangeExact: false };
  const query = new URLSearchParams({ type: "ERC-20", filter: "to", token: tokenAddr });
  const url = `${BLOCKSCOUT_V2}/addresses/${wallet}/token-transfers?${query}`;
  const pages = await pagesOf(url, { fetcher, sleepFn, pageSleepMs: options.pageSleepMs ?? 0 });
  if (!pages.complete) return { wallet, status: "DATA_INCOMPLETE", reason: "token_transfer_pagination_failed", failedPages: pages.failedPages, blockRangeExact: start.exact && end.exact };
  const startMs = dayStart(windowStart); const endMs = dayStart(windowEnd); const walletLower = lower(wallet); const tokenLower = lower(tokenAddr);
  const inflows = pages.items.filter((transfer) => {
    const timestamp = Date.parse(transfer.timestamp || "");
    return Number.isFinite(timestamp) && timestamp >= startMs && timestamp < endMs && lower(transfer?.token?.address) === tokenLower && hash(transfer.to) === walletLower;
  });
  if (inflows.length > (options.maxInflows ?? 100)) return { wallet, status: "DATA_INCOMPLETE", reason: "too_many_inflows_for_bounded_audit", transfersInWindow: inflows.length, blockRangeExact: start.exact && end.exact };
  const seenTransactions = new Set();
  const uniqueInflows = [];
  for (const transfer of inflows) {
    const txHash = transfer.transaction_hash || transfer.tx_hash;
    if (txHash && seenTransactions.has(txHash)) continue;
    if (txHash) seenTransactions.add(txHash);
    uniqueInflows.push(transfer);
  }
  log(`  ${wallet.slice(0, 10)}... ${inflows.length} inflows, ${uniqueInflows.length} unique transactions`);
  const graded = await mapLimit(uniqueInflows, options.concurrency ?? 4, async (transfer, index) => {
    const txHash = transfer.transaction_hash || transfer.tx_hash;
    const result = txHash ? await classifyTx(txHash, wallet, tokenAddr, fetcher) : { classification: "UNCLASSIFIED", evidence: ["missing transaction hash"], detail: {} };
    const leadTimeHours = txHash && transfer.timestamp ? (endMs - Date.parse(transfer.timestamp)) / 3600000 : null;
    if ((index + 1) % 10 === 0 || index + 1 === uniqueInflows.length) log(`  ${wallet.slice(0, 10)}... inspected ${index + 1}/${uniqueInflows.length}`);
    return { txHash, timestamp: transfer.timestamp, leadTimeHours, amountRaw: String(transfer?.total?.value || "0"), classification: result.classification, evidence: result.evidence, detail: result.detail };
  });
  return { wallet, token: tokenAddr, windowStart, windowEnd, blockRange: [start.block, end.block], blockRangeExact: start.exact && end.exact, status: "COMPLETE", transfersInWindow: inflows.length, graded };
}

function buildOutput(results, metadata = {}) {
  const summary = results.map((result) => {
    if (result.status !== "COMPLETE") return { wallet: result.wallet, status: result.status, reason: result.reason, verifiedBuyer: false };
    const classifications = Object.groupBy ? Object.groupBy(result.graded, (item) => item.classification) : result.graded.reduce((out, item) => ((out[item.classification] ||= []).push(item), out), {});
    const counts = Object.fromEntries(Object.entries(classifications).map(([key, value]) => [key, value.length]));
    return { wallet: result.wallet, status: "COMPLETE", blockRangeExact: result.blockRangeExact, classifications: counts, verifiedBuyer: counts.CONFIRMED_DEX_BUY > 0, probableBuyer: (counts.CONFIRMED_DEX_BUY || 0) + (counts.LIKELY_DEX_BUY || 0) > 0 };
  });
  return { version: "gold-pattern-check-v2", ranAt: nowIso(), targetToken: { symbol: "PEPE", address: PEPE }, window: { start: metadata.windowStart || WINDOW_START, end: metadata.pumpDay || PUMP_DAY }, walletsSummary: summary, details: results, verifiedWallets: summary.filter((item) => item.verifiedBuyer).map((item) => item.wallet), verdict: `${summary.filter((item) => item.verifiedBuyer).length} of ${summary.length} wallets have at least one CONFIRMED_DEX_BUY.` };
}

async function main() {
  const arg = (name, fallback) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : fallback; };
  const outputPath = arg("--output", path.join(process.cwd(), "gold-pattern-check-v2.json"));
  const windowStart = arg("--window-start", WINDOW_START);
  const pumpDay = arg("--pump-day", PUMP_DAY);
  const blockCache = new Map();
  const results = [];
  for (const wallet of WALLETS) { log(`verifying ${wallet}`); results.push(await reVerifyWallet(wallet, PEPE, windowStart, pumpDay, { blockCache })); }
  const output = buildOutput(results, { windowStart, pumpDay }); fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`); console.log(JSON.stringify(output, null, 2));
}

module.exports = { WALLETS, PEPE, ROUTERS, QUOTES, fetchJson, exactBlockAt, pagesOf, mapLimit, classifyTx, reVerifyWallet, buildOutput, formatUnits };
if (require.main === module) main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
