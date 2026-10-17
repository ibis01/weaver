#!/usr/bin/env node
"use strict";

/**
 * check-eval-window-availability.js
 *
 * Pre-flight for Gate 0b. For each wallet in the treatment (v2 buyer)
 * and control (control-2) populations, count PEPE acquisitions per
 * calendar month over the last N complete months, and report how many
 * wallets meet the preregistration's >=10 buys floor in each month.
 *
 * Read-only. Does not modify populations, spec, or production code.
 *
 * Env: BLOCKSCOUT_API_KEY
 *
 * CLI:
 *   --pool treatment|control|both   (default: both)
 *   --months-back 1..12             (default: 12)
 *   --dry-run                       (fetch only, no output write)
 *
 * Writes: data/experiments/availability-{date}.json
 */

const fs = require("node:fs");

const PEPE = "0x6982508145454ce325ddbe47a25d4ec3d2311933";
const PAIR = "0xa43fe16908251ee70ef74718545e4fe6c5ccec9f";
const API_ES = "https://api.blockscout.com/1/api";
const KEY = process.env.BLOCKSCOUT_API_KEY || "";
const HEADERS = { accept: "application/json", "user-agent": "weaver-availability/1.0" };
const SLEEP_MS = 1500;
const MAX_PAGES = 10;

// Anchor pair from control-2 metadata (highly accurate for 2025-11)
const A_DATE = new Date("2025-11-29T00:00:00Z");
const A_BLOCK = 23900602;
const B_DATE = new Date("2025-12-05T00:00:00Z");
const B_BLOCK = 23943068;
const BP_DAY = Math.round((B_BLOCK - A_BLOCK) / ((B_DATE - A_DATE) / 86400000));

function log(m) { process.stderr.write(m + "\n"); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function lower(s) { return (s || "").toLowerCase(); }
function authUrl(u) {
  if (!KEY) return u;
  return u + (u.includes("?") ? "&" : "?") + "apikey=" + encodeURIComponent(KEY);
}

function dateToBlock(d) {
  const days = Math.round((d - A_DATE) / 86400000);
  return A_BLOCK + days * BP_DAY;
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

function buildMonths(monthsBack) {
  // Complete months ending at the most recent completed month before cutoff.
  // Cutoff is 2026-10-15; last complete month is 2026-09.
  const lastMonthStart = new Date(Date.UTC(2026, 8, 1)); // 2026-09-01
  const months = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const m0 = new Date(Date.UTC(lastMonthStart.getUTCFullYear(), lastMonthStart.getUTCMonth() - i, 1));
    const m1 = new Date(Date.UTC(m0.getUTCFullYear(), m0.getUTCMonth() + 1, 1));
    const m1m = new Date(m1.getTime() - 1);
    months.push({
      key: m0.toISOString().slice(0, 7),
      startBlock: dateToBlock(m0),
      endBlock: dateToBlock(m1m),
    });
  }
  return months;
}

async function fetchAllPepeTransfers(wallet, startBlock, endBlock) {
  const rows = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = API_ES + "?module=account&action=tokentx"
      + "&address=" + wallet
      + "&contractaddress=" + PEPE
      + "&startblock=" + startBlock
      + "&endblock=" + endBlock
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

function bucketByMonth(rows, months, wallet) {
  const w = lower(wallet);
  const out = {};
  for (const m of months) out[m.key] = { anyIn: 0, fromPair: 0 };
  for (const r of rows) {
    if (lower(r.to) !== w) continue;
    const ts = Number(r.timeStamp) * 1000;
    const key = new Date(ts).toISOString().slice(0, 7);
    if (!out[key]) continue;
    out[key].anyIn++;
    if (lower(r.from) === PAIR) out[key].fromPair++;
  }
  return out;
}

async function main() {
  if (!KEY) { console.error("BLOCKSCOUT_API_KEY not set"); process.exit(1); }

  function arg(name, fb) {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : fb;
  }
  const pool = arg("--pool", "both");
  const monthsBack = Math.min(12, Math.max(1, Number(arg("--months-back", "12")) || 12));
  const dryRun = process.argv.includes("--dry-run");

  const treatmentAll = JSON.parse(fs.readFileSync("data/pepe-buyer-list/v2.json", "utf8")).buyers.map((b) => b.address);
  const controlAll = JSON.parse(fs.readFileSync("data/wallet-pool-control-2-v1.json", "utf8")).wallets.map((w) => w.address);

  const work = [];
  if (pool === "both" || pool === "treatment") work.push(...treatmentAll.map((a) => ({ a, p: "treatment" })));
  if (pool === "both" || pool === "control") work.push(...controlAll.map((a) => ({ a, p: "control" })));

  const months = buildMonths(monthsBack);
  const startBlock = months[0].startBlock;
  const endBlock = months[months.length - 1].endBlock;

  log("pool: " + pool + "  months: " + monthsBack + "  wallets: " + work.length);
  log("months: " + months.map((m) => m.key).join(", "));
  log("blocks: " + startBlock + " .. " + endBlock);

  const result = {
    version: "availability-v1",
    generatedAt: new Date().toISOString(),
    pool,
    monthsBack,
    months: months.map((m) => m.key),
    blockRange: { startBlock, endBlock },
    treatment: {},
    control: {},
    errors: [],
  };

  for (let i = 0; i < work.length; i++) {
    const { a, p } = work[i];
    log("[" + (i + 1) + "/" + work.length + "] " + p + " " + a.slice(0, 10));
    const res = await fetchAllPepeTransfers(a, startBlock, endBlock);
    if (res.error) { result.errors.push({ address: a, pool: p, reason: res.error }); log("    " + res.error); }
    result[p][lower(a)] = bucketByMonth(res.rows, months, a);
    await sleep(SLEEP_MS);
  }

  log("");
  log("month    | t_fromPair>=10 | t_anyIn>=10 | c_fromPair>=10 | c_anyIn>=10");
  const summary = [];
  for (const m of months) {
    let tFP = 0, tAI = 0, cFP = 0, cAI = 0;
    for (const a of Object.keys(result.treatment)) {
      const b = result.treatment[a][m.key];
      if (b.fromPair >= 10) tFP++;
      if (b.anyIn >= 10) tAI++;
    }
    for (const a of Object.keys(result.control)) {
      const b = result.control[a][m.key];
      if (b.fromPair >= 10) cFP++;
      if (b.anyIn >= 10) cAI++;
    }
    log(m.key.padEnd(8) + " | " + String(tFP).padStart(13) + " | " + String(tAI).padStart(10) + " | " + String(cFP).padStart(13) + " | " + String(cAI).padStart(10));
    summary.push({ month: m.key, tFP, tAI, cFP, cAI });
  }
  result.summary = summary;

  if (!dryRun) {
    fs.mkdirSync("data/experiments", { recursive: true });
    const outPath = "data/experiments/availability-" + new Date().toISOString().slice(0, 10) + ".json";
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
    log("\nwritten: " + outPath);
  }

  console.log(JSON.stringify({ summary, errors: result.errors.length }, null, 2));
}

main().catch((e) => { console.error(e.stack || e); process.exit(1); });
