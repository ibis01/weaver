#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const crypto = require("node:crypto");

const PEPE = "0x6982508145454ce325ddbe47a25d4ec3d2311933";
const PAIR = "0xa43fe16908251ee70ef74718545e4fe6c5ccec9f";
const API_ES = "https://api.blockscout.com/1/api";
const KEY = process.env.BLOCKSCOUT_API_KEY || "";
const HEADERS = { accept: "application/json", "user-agent": "weaver-prospective/1.0" };
const SLEEP_MS = 1500;
const FREEZE_DATE = "2026-10-18T00:00:00Z";

function log(m) { process.stderr.write(m + "\n"); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function lower(s) { return (s || "").toLowerCase(); }
function authUrl(u) {
  if (!KEY) return u;
  return u + (u.includes("?") ? "&" : "?") + "apikey=" + encodeURIComponent(KEY);
}
function sha256(buf) { return crypto.createHash("sha256").update(buf).digest("hex"); }

async function fetchJson(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    try {
      const res = await fetch(authUrl(url), { headers: HEADERS, signal: ctrl.signal });
      clearTimeout(timer);
      if (res.status === 429 && i + 1 < tries) { await sleep(3000 * Math.pow(2, i)); continue; }
      if (res.status === 402) { log("    402 credits"); return null; }
      if (!res.ok) { log("    HTTP " + res.status); return null; }
      return await res.json();
    } catch (e) {
      clearTimeout(timer);
      if (i + 1 === tries) { log("    err: " + e.message); return null; }
      await sleep(3000 * Math.pow(2, i));
    }
  }
  return null;
}

async function getLatestBlock() {
  // tokentx on PEPE endpoint returns latest block info in meta if available
  // Simpler: use the standard getblocknobytime or a known endpoint. We use
  // the block number from the last PEPE transfer globally as proxy.
  // Fallback: use current time -> block approximation via getblocknobytime.
  const nowSec = Math.floor(Date.now() / 1000);
  const url = API_ES + "?module=block&action=getblocknobytime&timestamp=" + nowSec + "&closest=before";
  const d = await fetchJson(url);
  if (!d || d.status !== "1") return null;
  const n = Number(d.result && d.result.blockNumber);
  return Number.isSafeInteger(n) ? n : null;
}

async function fetchBuys(wallet, fromBlock, toBlock) {
  const rows = [];
  for (let page = 1; page <= 10; page++) {
    const url = API_ES + "?module=account&action=tokentx"
      + "&address=" + wallet
      + "&contractaddress=" + PEPE
      + "&startblock=" + fromBlock
      + "&endblock=" + toBlock
      + "&sort=asc&page=" + page + "&offset=1000";
    const d = await fetchJson(url);
    if (!d) return { rows, error: "fetch-failed-page-" + page };
    if (d.status !== "1") {
      const msg = String(d.message || "").toLowerCase();
      if (msg.includes("no") && msg.includes("transaction")) return { rows, error: null };
      return { rows, error: "api-status-" + d.status };
    }
    const pageRows = d.result || [];
    rows.push(...pageRows);
    if (pageRows.length < 1000) return { rows, error: null };
    await sleep(SLEEP_MS);
  }
  return { rows, error: "page-cap" };
}

function writeFreezeHashes() {
  const hashPath = "data/prospective/freeze-hashes.txt";
  if (fs.existsSync(hashPath)) return;
  const files = [
    "data/pepe-buyer-list/v2.json",
    "scripts/oneoff/find-pepe-buyers-v5.js",
    "js/intelligence/smart-money/wallet-profiler.js",
    "docs/experiments/gate-0d-prospective-preregistration-2026-10-18.md",
  ];
  const lines = [
    "# Gate 0d freeze — SHA-256 at freeze",
    "# Freeze date: " + FREEZE_DATE,
    "# Recorded: " + new Date().toISOString(),
    "",
  ];
  for (const f of files) {
    if (!fs.existsSync(f)) { lines.push("MISSING " + f); continue; }
    lines.push(sha256(fs.readFileSync(f)) + "  " + f);
  }
  fs.writeFileSync(hashPath, lines.join("\n") + "\n");
  log("freeze hashes recorded");
}

async function main() {
  if (!KEY) { console.error("BLOCKSCOUT_API_KEY not set"); process.exit(1); }
  fs.mkdirSync("data/prospective", { recursive: true });
  writeFreezeHashes();

  const statePath = "data/prospective/state.json";
  const buysPath = "data/prospective/buys.jsonl";

  let state;
  if (fs.existsSync(statePath)) {
    state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  } else {
    log("initializing state (first run)");
    const currentBlock = await getLatestBlock();
    if (!currentBlock) { console.error("FATAL: cannot get latest block"); process.exit(1); }
    state = {
      freeze_block: currentBlock,
      freeze_date: FREEZE_DATE,
      last_scanned_block: currentBlock,
      first_run_at: new Date().toISOString(),
      buys_collected: 0,
    };
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    log("state initialized at block " + currentBlock);
    log("no buys can exist yet (scanned = current). Run next week to collect.");
    return;
  }

  log("last scanned: " + state.last_scanned_block);
  const latestBlock = await getLatestBlock();
  if (!latestBlock) { console.error("FATAL: cannot get latest block"); process.exit(1); }
  log("current block: " + latestBlock);

  if (latestBlock <= state.last_scanned_block) {
    log("no new blocks; nothing to do");
    return;
  }

  const buyers = JSON.parse(fs.readFileSync("data/pepe-buyer-list/v2.json", "utf8")).buyers;
  log("scanning " + buyers.length + " wallets from " + (state.last_scanned_block + 1) + " to " + latestBlock);

  let newBuys = 0, errors = 0;
  const outFh = fs.openSync(buysPath, "a");

  for (let i = 0; i < buyers.length; i++) {
    const addr = buyers[i].address.toLowerCase();
    process.stderr.write("[" + (i+1) + "/" + buyers.length + "] " + addr.slice(0, 10) + " ");
    const res = await fetchBuys(addr, state.last_scanned_block + 1, latestBlock);
    if (res.error) { log("ERR " + res.error); errors++; continue; }
    let added = 0;
    for (const r of res.rows) {
      if (lower(r.to) !== addr) continue;
      if (lower(r.from) !== PAIR) continue;
      if (lower(r.contractAddress) !== PEPE) continue;
      const ts = Number(r.timeStamp) * 1000;
      if (!Number.isFinite(ts)) continue;
      fs.writeSync(outFh, JSON.stringify({
        wallet: addr,
        txHash: lower(r.hash),
        blockNumber: Number(r.blockNumber),
        timestamp: ts,
        timestampIso: new Date(ts).toISOString(),
        pepAmount: r.value,
        collectedAt: new Date().toISOString(),
      }) + "\n");
      added++;
    }
    log(added + " new");
    newBuys += added;
    await sleep(SLEEP_MS);
  }
  fs.closeSync(outFh);

  if (errors === 0) state.last_scanned_block = latestBlock;
  state.last_run_at = new Date().toISOString();
  state.buys_collected += newBuys;
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

  log("");
  log("new buys: " + newBuys + "  total: " + state.buys_collected + "  errors: " + errors);
  if (errors > 0) log("state NOT advanced — will retry next run");
}

main().catch((e) => { console.error(e.stack || e); process.exit(1); });
