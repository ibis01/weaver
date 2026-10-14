#!/usr/bin/env node
"use strict";

/**
 * windowed-net-check.js
 *
 * For each candidate, fetch its PEPE transfer history in a window
 * around the primary buy, compute net position, and classify:
 *   NET_HOLDER      net PEPE > +1% of inflow
 *   PASS_THROUGH    |net| <= 1% of inflow
 *   NET_SELLER      net < -1% of inflow
 *
 * Reads candidates from data/wallet-pool-gold-standard-v2.json
 * Writes /tmp/windowed-net-check.json
 */

const fs = require("node:fs");
const PEPE = "0x6982508145454ce325ddbe47a25d4ec3d2311933";
const API = "https://api.blockscout.com/1/api";
const KEY = process.env.BLOCKSCOUT_API_KEY || "";
const HEADERS = { accept: "application/json", "user-agent": "weaver-window/1.0" };

function log(m) { process.stderr.write(m + "\n"); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function authUrl(url) {
  if (!KEY) return url;
  return url + (url.includes("?") ? "&" : "?") + "apikey=" + encodeURIComponent(KEY);
}

async function fetchJson(url, tries) {
  if (tries === undefined) tries = 4;
  for (let i = 0; i < tries; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    try {
      const res = await fetch(authUrl(url), { headers: HEADERS, signal: ctrl.signal });
      clearTimeout(timer);
      if (res.status === 429) {
        if (i + 1 < tries) { await sleep(3000 * Math.pow(2, i)); continue; }
      }
      if (!res.ok) { log("  HTTP " + res.status); return null; }
      return await res.json();
    } catch (e) {
      clearTimeout(timer);
      if (i + 1 === tries) { log("  err: " + e.message); return null; }
      await sleep(3000 * Math.pow(2, i));
    }
  }
  return null;
}

function toBigInt(s) { try { return BigInt(String(s)); } catch { return 0n; } }

function formatPEPE(raw) {
  const v = toBigInt(raw);
  const base = 10n ** 18n;
  const whole = v / base;
  return whole.toString();
}

async function classifyWindow(candidate) {
  // Fetch all PEPE transfers for this candidate (any direction)
  // Covering roughly 2026-08-10 to 2026-08-25 so we capture the window plus margin
  const START_BLOCK = 25710000;
  const END_BLOCK = 25820000;

  const url = API + "?module=account&action=tokentx"
    + "&address=" + candidate
    + "&contractaddress=" + PEPE
    + "&startblock=" + START_BLOCK
    + "&endblock=" + END_BLOCK
    + "&sort=asc&page=1&offset=1000";

  const d = await fetchJson(url);
  if (!d || d.status !== "1") {
    return {
      address: candidate,
      status: "ERROR",
      reason: d ? d.message : "no-response",
    };
  }

  const rows = d.result || [];
  let inRaw = 0n;
  let outRaw = 0n;
  let inCount = 0;
  let outCount = 0;
  const lower = candidate.toLowerCase();
  const txSet = new Set();

  for (const r of rows) {
    const from = (r.from || "").toLowerCase();
    const to = (r.to || "").toLowerCase();
    const val = toBigInt(r.value);
    txSet.add(r.hash);
    if (to === lower) { inRaw += val; inCount++; }
    else if (from === lower) { outRaw += val; outCount++; }
  }

  const net = inRaw - outRaw;
  const onePercentOfIn = inRaw / 100n;
  let classification;
  if (inRaw === 0n && outRaw === 0n) {
    classification = "NO_PEPE_ACTIVITY";
  } else if (net > onePercentOfIn) {
    classification = "NET_HOLDER";
  } else if (net < -onePercentOfIn) {
    classification = "NET_SELLER";
  } else {
    classification = "PASS_THROUGH";
  }

  return {
    address: candidate,
    status: "OK",
    inCount,
    outCount,
    txCount: txSet.size,
    inRaw: inRaw.toString(),
    outRaw: outRaw.toString(),
    inFormatted: formatPEPE(inRaw),
    outFormatted: formatPEPE(outRaw),
    netRaw: net.toString(),
    netFormatted: formatPEPE(net < 0n ? -net : net) + (net < 0n ? " (net negative)" : ""),
    classification,
  };
}

async function main() {
  const pool = JSON.parse(fs.readFileSync("data/wallet-pool-gold-standard-v2.json", "utf8"));
  const wallets = pool.wallets || [];
  log("checking " + wallets.length + " candidates\n");

  const results = [];
  for (const w of wallets) {
    log("[" + w.address.slice(0, 10) + "...]");
    const r = await classifyWindow(w.address);
    log("  " + (r.classification || r.reason) +
        (r.inCount !== undefined ? "  in=" + r.inCount + " out=" + r.outCount + " net=" + r.netFormatted : ""));
    results.push(r);
    await sleep(400);
  }

  const summary = {};
  for (const r of results) {
    const k = r.classification || "ERROR";
    summary[k] = (summary[k] || 0) + 1;
  }

  const out = {
    version: "windowed-net-check-v1",
    ranAt: new Date().toISOString(),
    window: { startBlock: 25710000, endBlock: 25820000 },
    total: results.length,
    summary,
    results,
  };

  fs.writeFileSync("/tmp/windowed-net-check.json", JSON.stringify(out, null, 2));
  log("\n=== summary ===");
  for (const [k, v] of Object.entries(summary)) log("  " + k + ": " + v);
  log("written: /tmp/windowed-net-check.json");
}

main().catch(e => { console.error(e.stack || e); process.exit(1); });
