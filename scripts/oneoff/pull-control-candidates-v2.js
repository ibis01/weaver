#!/usr/bin/env node
"use strict";

/**
 * pull-control-candidates-v2.js
 *
 * Gate 0b control-1 candidate pull. Uses window-wide stride sampling
 * on the v2 token-transfers endpoint (keyset pagination), filters to
 * non-infrastructure recipients, then per-address windowed net check.
 *
 * Design: docs/designs/gate-0b-control-1-design-v2.md
 * Output: data/control-candidates/v2.json
 *
 * Env: BLOCKSCOUT_API_KEY
 */

const fs = require("node:fs");

const PEPE   = "0x6982508145454ce325ddbe47a25d4ec3d2311933";
const API_V2 = "https://api.blockscout.com/1/api/v2";
const API_ES = "https://api.blockscout.com/1/api";
const KEY    = process.env.BLOCKSCOUT_API_KEY || "";

const START_BLOCK = 25710000;
const END_BLOCK   = 25820000;
const STRIDE      = 5000;         // block positions across the window
const PAGE_SIZE   = 50;           // v2 endpoint default; ignore offset
const SLEEP_MS    = 1200;         // ~5 req / 7 min; headroom under rate limit
const MIN_NET_WEI = 10n ** 24n;
const IN_RANGE    = new Set([1, 2, 3, 4, 5]);

const EXCLUDE = new Set([
  "0xbdb3ba9ffe392549e1f8658dd2630c141fdf47b6",
  "0x000000000004444c5dc75cb358380d2e3de08a90",
  "0xc5e9f816994d3eb91b556bc8d0a0cbe44a674909",
  "0xd56fca51b9f22414379a805cb45ab5b404e34023",
].map(s => s.toLowerCase()));

const PEPE_TRANSFER_SIG = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function log(m) { process.stderr.write(m + "\n"); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function lower(s) { return (s || "").toLowerCase(); }
function authUrl(url) {
  if (!KEY) return url;
  return url + (url.includes("?") ? "&" : "?") + "apikey=" + encodeURIComponent(KEY);
}
async function fetchJson(url) {
  const r = await fetch(authUrl(url), { headers: { accept: "application/json" } });
  if (!r.ok) { log("    HTTP " + r.status + " " + url.slice(0, 90)); return null; }
  return r.json();
}

function isUserCandidate(to) {
  if (!to || !to.hash) return false;
  if (to.is_contract) return false;
  const tags = ((to.metadata || {}).tags) || [];
  if (tags.length > 0) return false;
  if ((to.public_tags || []).length > 0) return false;
  if (to.name) return false;
  return true;
}

async function sampleAtBlock(block) {
  // v2 token transfers: keyset pagination, block_number is a cursor.
  // A single page at the requested cursor yields ~50 items ending at or
  // below that block.
  const url = `${API_V2}/tokens/${PEPE}/transfers?block_number=${block}&index=0`;
  const d = await fetchJson(url);
  if (!d) return [];
  const items = d.items || [];
  const kept = [];
  for (const it of items) {
    const to = it.to || {};
    if (!to.hash) continue;
    if (isUserCandidate(to)) kept.push(lower(to.hash));
  }
  return kept;
}

async function windowedNetCheck(addr) {
  const url = `${API_ES}?module=account&action=tokentx`
    + `&address=${addr}`
    + `&contractaddress=${PEPE}`
    + `&startblock=${START_BLOCK}&endblock=${END_BLOCK}`
    + `&sort=asc&page=1&offset=1000`;
  const d = await fetchJson(url);
  if (!d || d.status !== "1") return null;
  const rows = d.result || [];
  let inCount = 0, outCount = 0, netWei = 0n;
  for (const r of rows) {
    const val = BigInt(r.value || "0");
    if (lower(r.to) === addr)   { inCount++;  netWei += val; }
    if (lower(r.from) === addr) { outCount++; netWei -= val; }
  }
  return { inCount, outCount, netWei };
}

async function main() {
  if (!KEY) { log("BLOCKSCOUT_API_KEY not set"); process.exit(1); }

  // --- Phase 1: stride sample, gather candidate addresses ---
  const positions = [];
  for (let b = START_BLOCK + STRIDE; b <= END_BLOCK; b += STRIDE) positions.push(b);
  log("stride positions: " + positions.length + "  (" + positions[0] + " … " + positions[positions.length-1] + ")");

  const candidates = new Set();
  for (const b of positions) {
    log("sample block " + b + " …");
    const kept = await sampleAtBlock(b);
    log("  kept " + kept.length + " user-shaped recipients");
    for (const a of kept) candidates.add(a);
    await sleep(SLEEP_MS);
  }
  log("phase 1 done: " + candidates.size + " unique candidate addresses");

  // Remove treatment + known infra
  const survivors = [...candidates].filter(a => !EXCLUDE.has(a));
  log("after exclusion: " + survivors.length);

  // --- Phase 2: per-address windowed net check ---
  const out = [];
  let i = 0;
  for (const addr of survivors) {
    i++;
    log("[" + i + "/" + survivors.length + "] " + addr.slice(0,10) + " …");
    const rec = await windowedNetCheck(addr);
    if (!rec) { log("  no data"); await sleep(SLEEP_MS); continue; }
    if (rec.netWei < MIN_NET_WEI) { log("  net below floor"); await sleep(SLEEP_MS); continue; }
    if (!IN_RANGE.has(rec.inCount)) { log("  inCount " + rec.inCount + " not in range"); await sleep(SLEEP_MS); continue; }
    out.push({
      address: addr,
      netRaw: rec.netWei.toString(),
      netFormatted: (rec.netWei / 10n ** 18n).toString(),
      inCount: rec.inCount,
      outCount: rec.outCount,
    });
    log("  KEEP in=" + rec.inCount + " out=" + rec.outCount + " net=" + (rec.netWei / 10n ** 18n).toString());
    await sleep(SLEEP_MS);
  }

  out.sort((a, b) => a.inCount - b.inCount || a.address.localeCompare(b.address));

  fs.mkdirSync("data/control-candidates", { recursive: true });
  const path = "data/control-candidates/v2.json";
  fs.writeFileSync(path, JSON.stringify({
    version: "control-candidates-v2",
    created: new Date().toISOString(),
    method: "stride-sample " + STRIDE + " across window + windowed net check",
    window: { startBlock: START_BLOCK, endBlock: END_BLOCK },
    treatmentSource: "data/pepe-buyer-list/v1.json",
    excluded: [...EXCLUDE],
    filters: { minNetWei: MIN_NET_WEI.toString(), inCounts: [...IN_RANGE].sort((a,b)=>a-b) },
    count: out.length,
    candidates: out,
  }, null, 2));
  log("wrote " + out.length + " candidates to " + path);

  // Coverage check
  const buyers = JSON.parse(fs.readFileSync("data/pepe-buyer-list/v1.json", "utf8"));
  const need = new Map();
  for (const b of buyers.buyers) need.set(b.inCount, (need.get(b.inCount) || 0) + 1);
  const have = new Map();
  for (const c of out) have.set(c.inCount, (have.get(c.inCount) || 0) + 1);
  log("\n--- match coverage ---");
  for (const n of [...need.keys()].sort((a,b)=>a-b)) {
    const h = have.get(n) || 0;
    log("  inCount=" + n + "  treatment=" + need.get(n) + "  control=" + h + (h >= need.get(n) ? "  ok" : "  INSUFFICIENT"));
  }
}

main().catch(e => { console.error(e.stack || e); process.exit(1); });
