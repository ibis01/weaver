#!/usr/bin/env node
"use strict";

/**
 * pull-treatment-trade-history.js
 *
 * Fetches PEPE transfer history for every wallet in
 * data/pepe-buyer-list/v2.json and caches to
 * data/trade-history/{wallet}.json.
 *
 * This is a prerequisite for Gate 0b.2 (descriptives) and 0b.3
 * (event-level analysis), neither of which can run without per-wallet
 * buy timestamps.
 *
 * Read-only. No writes outside data/trade-history/.
 *
 * Env: BLOCKSCOUT_API_KEY
 */

const fs = require("node:fs");
const path = require("node:path");

const PEPE = "0x6982508145454ce325ddbe47a25d4ec3d2311933";
const API_ES = "https://api.blockscout.com/1/api";
const KEY = process.env.BLOCKSCOUT_API_KEY || "";
const HEADERS = { accept: "application/json", "user-agent": "weaver-trade-history/1.0" };
const SLEEP_MS = 1500;

// From PEPE listing (2023-04-14) to data cutoff (2026-10-15).
// Wide range on purpose: a wallet that traded PEPE in 2023 has
// legitimate history that should be counted.
const START_BLOCK = 17000000;
const END_BLOCK   = 26200000;

function log(m) { process.stderr.write(m + "\n"); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function authUrl(u) {
  if (!KEY) return u;
  return u + (u.includes("?") ? "&" : "?") + "apikey=" + encodeURIComponent(KEY);
}

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

async function fetchAllTransfers(wallet) {
  const rows = [];
  for (let page = 1; page <= 10; page++) {
    const url = API_ES + "?module=account&action=tokentx"
      + "&address=" + wallet
      + "&contractaddress=" + PEPE
      + "&startblock=" + START_BLOCK
      + "&endblock=" + END_BLOCK
      + "&sort=asc&page=" + page + "&offset=1000";
    const d = await fetchJson(url);
    if (!d) return { rows, complete: false, reason: "fetch-failed-page-" + page };
    if (d.status !== "1") {
      const msg = String(d.message || "").toLowerCase();
      if (msg.includes("no") && msg.includes("transaction")) return { rows, complete: true, reason: null };
      return { rows, complete: false, reason: "api-status-" + d.status };
    }
    const pageRows = d.result || [];
    rows.push(...pageRows);
    if (pageRows.length < 1000) return { rows, complete: true, reason: null };
    await sleep(SLEEP_MS);
  }
  return { rows, complete: false, reason: "page-cap" };
}

async function main() {
  if (!KEY) { console.error("BLOCKSCOUT_API_KEY not set"); process.exit(1); }

  fs.mkdirSync("data/trade-history", { recursive: true });

  const buyers = JSON.parse(fs.readFileSync("data/pepe-buyer-list/v2.json", "utf8")).buyers;
  log("pulling trade history for " + buyers.length + " wallets");

  let ok = 0, failed = 0, skipped = 0;

  for (let i = 0; i < buyers.length; i++) {
    const addr = buyers[i].address.toLowerCase();
    const outPath = path.join("data/trade-history", addr + ".json");

    // Skip if already cached and non-empty
    if (fs.existsSync(outPath)) {
      const existing = JSON.parse(fs.readFileSync(outPath, "utf8"));
      if (existing.complete && existing.rows && existing.rows.length > 0) {
        log("[" + (i+1) + "/" + buyers.length + "] " + addr.slice(0, 10) + "  cached");
        skipped++;
        continue;
      }
    }

    log("[" + (i+1) + "/" + buyers.length + "] " + addr.slice(0, 10));
    const res = await fetchAllTransfers(addr);
    const out = {
      address: addr,
      fetchedAt: new Date().toISOString(),
      startBlock: START_BLOCK,
      endBlock: END_BLOCK,
      complete: res.complete,
      reason: res.reason,
      rowCount: res.rows.length,
      rows: res.rows,
    };
    fs.writeFileSync(outPath, JSON.stringify(out));
    log("    " + res.rows.length + " rows" + (res.complete ? "" : "  INCOMPLETE: " + res.reason));

    if (res.complete) ok++;
    else failed++;

    await sleep(SLEEP_MS);
  }

  log("");
  log("=== summary ===");
  log("  complete:   " + ok);
  log("  incomplete: " + failed);
  log("  cached:     " + skipped);
  log("  total:      " + buyers.length);
}

main().catch((e) => { console.error(e.stack || e); process.exit(1); });
