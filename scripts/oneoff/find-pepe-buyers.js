#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const PEPE = "0x6982508145454ce325ddbe47a25d4ec3d2311933";
const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const DEFAULT_PAIR = "0xa43fe16908251ee70ef74718545e4fe6c5ccec9f";
const BLOCKSCOUT_V2 = "https://eth.blockscout.com/api/v2";
const BLOCKSCOUT_LEGACY = "https://eth.blockscout.com/api";
const ETH_RPC = process.env.ETHEREUM_RPC_URL || "https://ethereum.publicnode.com";
const HEADERS = {
  accept: "application/json",
  "user-agent": "weaver-pepe-buyer-discovery/1.0",
  ...(process.env.BLOCKSCOUT_API_KEY ? { "x-api-key": process.env.BLOCKSCOUT_API_KEY } : {}),
};
const ZERO = "0x0000000000000000000000000000000000000000";
const DECIMALS = 18;

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
function lower(value) { return String(value || "").toLowerCase(); }
function dayStart(day) { return Date.parse(`${day}T00:00:00.000Z`); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function formatUnits(raw, decimals = DECIMALS) {
  const value = BigInt(String(raw));
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = String(value % base).padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}${fraction ? `.${fraction}` : ""}`;
}
function toRawWhole(value) {
  if (!/^\d+$/.test(String(value))) throw new Error(`--min-pepe must be a non-negative whole-token amount, got: ${value}`);
  return (BigInt(value) * (10n ** BigInt(DECIMALS))).toString();
}
function log(message) { process.stderr.write(`${message}\n`); }

async function fetchJson(url, { maxTries = 5 } = {}) {
  for (let attempt = 0; attempt < maxTries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(url, { headers: HEADERS, signal: controller.signal });
      if ([403, 429].includes(response.status) || response.status >= 500) {
        if (attempt + 1 < maxTries) { await sleep(Math.min(60000, 3000 * 2 ** attempt)); continue; }
      }
      if (!response.ok) throw new Error(`Blockscout HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      if (attempt + 1 >= maxTries) throw error;
      log(`provider attempt ${attempt + 1}/${maxTries} failed: ${error.name || "request"}; retrying`);
      await sleep(Math.min(60000, 3000 * 2 ** attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`Blockscout request failed after retries: ${url}`);
}

async function collectPairOutflows({ pair, token, windowStart, windowEnd, maxPages = 100 }) {
  const startBlock = await exactBlockAt(windowStart);
  const endBlock = await exactBlockAt(windowEnd);
  if (startBlock === null || endBlock === null) throw new Error("could not resolve exact block bounds");
  const startMs = dayStart(windowStart); const endMs = dayStart(windowEnd);
  const rows = [];
  const offset = 1000;
  for (let page = 1; page <= maxPages; page += 1) {
    const query = new URLSearchParams({ module: "account", action: "tokentx", address: pair, contractaddress: token, startblock: String(startBlock), endblock: String(endBlock), page: String(page), offset: String(offset), sort: "asc" });
    const data = await fetchJson(`${BLOCKSCOUT_LEGACY}?${query}`);
    if (data?.status === "0" && String(data?.message || "").toLowerCase().includes("no transactions")) return { rows, pages: page, startBlock, endBlock };
    if (!data || !Array.isArray(data.result)) throw new Error(`invalid bounded token-transfer response on page ${page}`);
    for (const transfer of data.result) {
      const timestamp = Date.parse(transfer.timeStamp ? new Date(Number(transfer.timeStamp) * 1000).toISOString() : "");
      if (lower(transfer.contractAddress) !== lower(token) || lower(transfer.from) !== lower(pair)) continue;
      if (Number.isFinite(timestamp) && timestamp >= startMs && timestamp < endMs) rows.push({ ...transfer, timestamp: new Date(timestamp).toISOString(), to: { hash: transfer.to }, total: { value: transfer.value, decimals: String(DECIMALS) }, transaction_hash: transfer.hash, token: { address: transfer.contractAddress } });
    }
    if (data.result.length < offset) return { rows, pages: page, startBlock, endBlock };
    await sleep(500);
  }
  throw new Error(`bounded pagination exceeded ${maxPages} pages; refusing incomplete discovery`);
}

async function exactBlockAt(date) {
  const query = new URLSearchParams({ module: "block", action: "getblocknobytime", timestamp: String(Math.floor(dayStart(date) / 1000)), closest: "before" });
  const data = await fetchJson(`${BLOCKSCOUT_LEGACY}?${query}`);
  const block = Number(data?.result?.blockNumber);
  return data?.status === "1" && Number.isSafeInteger(block) ? block : null;
}

async function filterExternallyOwnedAccounts(candidates) {
  const payload = candidates.map((candidate, id) => ({ jsonrpc: "2.0", id, method: "eth_getCode", params: [candidate.wallet, "latest"] }));
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 30000);
  let response;
  try { response = await fetch(ETH_RPC, { method: "POST", headers: { ...HEADERS, "content-type": "application/json" }, body: JSON.stringify(payload), signal: controller.signal }); }
  finally { clearTimeout(timer); }
  if (!response.ok) throw new Error(`Ethereum RPC HTTP ${response.status}`);
  const results = await response.json();
  if (!Array.isArray(results) || results.length !== candidates.length) throw new Error("incomplete Ethereum RPC bytecode response");
  return candidates.filter((_, index) => {
    const code = results.find((item) => item.id === index)?.result;
    if (typeof code !== "string") throw new Error(`missing bytecode result for candidate index ${index}`);
    return code === "0x" || code === "0x0";
  });
}

function buildCandidates(rows, { pair, minRaw }) {
  const byWallet = new Map();
  for (const transfer of rows) {
    const wallet = lower(transfer?.to?.hash || transfer?.to);
    const raw = String(transfer?.total?.value ?? "0");
    if (!/^0x[0-9a-f]{40}$/.test(wallet) || wallet === lower(pair) || wallet === ZERO) continue;
    let amount;
    try { amount = BigInt(raw); } catch { continue; }
    if (amount < minRaw) continue;
    const existing = byWallet.get(wallet) || { wallet, transferCount: 0, totalPepeRaw: 0n, transactions: [], firstSeen: null, lastSeen: null };
    existing.transferCount += 1;
    existing.totalPepeRaw += amount;
    const txHash = transfer.transaction_hash || transfer.tx_hash || null;
    if (txHash && !existing.transactions.includes(txHash)) existing.transactions.push(txHash);
    const timestamp = transfer.timestamp || null;
    if (!existing.firstSeen || timestamp < existing.firstSeen) existing.firstSeen = timestamp;
    if (!existing.lastSeen || timestamp > existing.lastSeen) existing.lastSeen = timestamp;
    byWallet.set(wallet, existing);
  }
  return [...byWallet.values()]
    .map((item) => ({ ...item, totalPepeRaw: item.totalPepeRaw.toString(), totalPepe: formatUnits(item.totalPepeRaw) }))
    .sort((a, b) => (BigInt(b.totalPepeRaw) > BigInt(a.totalPepeRaw) ? 1 : -1));
}

async function main() {
  const windowStart = arg("--window-start", "2026-08-12");
  const windowEnd = arg("--window-end", "2026-08-19");
  const pair = lower(arg("--pair", DEFAULT_PAIR));
  const minPepe = arg("--min-pepe", "1000000000");
  const outputPath = arg("--output", path.join(process.cwd(), "pepe-buyers-candidates.json"));
  if (!/^0x[0-9a-f]{40}$/.test(pair)) throw new Error(`invalid --pair address: ${pair}`);
  if (!Number.isFinite(dayStart(windowStart)) || !Number.isFinite(dayStart(windowEnd)) || dayStart(windowEnd) <= dayStart(windowStart)) throw new Error("window-end must be after window-start and both must be YYYY-MM-DD");
  const minRaw = BigInt(toRawWhole(minPepe));
  log(`Scanning PEPE outflows from pair ${pair} between ${windowStart} and ${windowEnd} UTC`);
  const { rows, pages, startBlock, endBlock } = await collectPairOutflows({ pair, token: PEPE, windowStart, windowEnd });
  const rawCandidates = buildCandidates(rows, { pair, minRaw });
  const candidates = await filterExternallyOwnedAccounts(rawCandidates);
  const output = {
    version: "pepe-structural-buyers-v1",
    ranAt: new Date().toISOString(),
    method: "PEPE ERC-20 transfers sent by the canonical Uniswap V2 PEPE/WETH pair; pair-originated PEPE inflow is treated as structural DEX-buy evidence",
    source: { provider: "Blockscout legacy API + Ethereum JSON-RPC", endpoint: `${BLOCKSCOUT_LEGACY}?module=account&action=tokentx`, contractCheckEndpoint: ETH_RPC, pair, token: PEPE, quoteToken: WETH, startBlock, endBlock, pages, complete: true },
    window: { start: windowStart, end: windowEnd, endExclusive: true },
    threshold: { minPepe, minPepeRaw: minRaw.toString(), decimals: DECIMALS },
    rowsScanned: rows.length,
    rawCandidateCount: rawCandidates.length,
    candidateCount: candidates.length,
    candidates,
    top10: candidates.slice(0, 10),
  };
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({ output: outputPath, candidateCount: output.candidateCount, rowsScanned: output.rowsScanned, pages: output.source.pages, top10: output.top10 }, null, 2));
}

module.exports = { PEPE, WETH, DEFAULT_PAIR, collectPairOutflows, buildCandidates, formatUnits, toRawWhole };
if (require.main === module) main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
