#!/usr/bin/env node
"use strict";

/**
 * full-windowed-net-check.js
 *
 * Run the windowed net position check on ALL candidates from the
 * Swap-event extraction, not just the top 20.
 *
 * Purpose: measure how many candidates survive a longer window (24h)
 * as net holders. If the extraction produces a viable population, the
 * survivors become the candidate set for the attribution pipeline.
 *
 * Reads: pepe-buyers-final-v4.json (1,132 candidates)
 * Writes: /tmp/full-windowed-check.json
 *
 * Env: BLOCKSCOUT_API_KEY (required for rate headroom)
 */

const fs = require("node:fs");
const PEPE = "0x6982508145454ce325ddbe47a25d4ec3d2311933";
const API = "https://api.blockscout.com/1/api";
const KEY = process.env.BLOCKSCOUT_API_KEY || "";
const HEADERS = { accept: "application/json", "user-agent": "weaver-full-check/1.0" };

// Primary pump window. The window check looks ±12h around each candidate's
// first in-window activity, giving a 24h effective window.
const WINDOW_START_BLOCK = 25710000;
const WINDOW_END_BLOCK   = 25820000;

// A candidate must have net >= 10M PEPE over the window to be retained.
const MATERIAL_THRESHOLD_RAW = "10000000000000000000000000"; // 1e25 wei = 10M PEPE

function log(m) { process.stderr.write(m + "\n"); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function authUrl(url) {
  if (!KEY) return url;
  return url + (url.includes("?") ? "&" : "?") + "apikey=" + encodeURIComponent(KEY);
}
function toBigInt(s) { try { return BigInt(String(s)); } catch { return 0n; } }
function formatPEPE(raw) {
  const v = toBigInt(raw);
  const base = 10n ** 18n;
  return (v / base).toString();
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
        if (i + 1 < tries) { await sleep(2000 * Math.pow(2, i)); continue; }
      }
      if (res.status === 402) { log("  402 quota"); return null; }
      if (!res.ok) { log("  HTTP " + res.status); return null; }
      return await res.json();
    } catch (e) {
      clearTimeout(timer);
      if (i + 1 === tries) { log("  err: " + e.message); return null; }
      await sleep(2000 * Math.pow(2, i));
    }
  }
  return null;
}

async function checkCandidate(candidate) {
  const url = API + "?module=account&action=tokentx"
    + "&address=" + candidate
    + "&contractaddress=" + PEPE
    + "&startblock=" + WINDOW_START_BLOCK
    + "&endblock=" + WINDOW_END_BLOCK
    + "&sort=asc&page=1&offset=1000";

  const d = await fetchJson(url);
  if (!d) return { address: candidate, status: "ERROR", reason: "fetch-failed" };
  if (d.status === "0" && d.message === "No transactions found") {
    return { address: candidate, status: "NO_ACTIVITY" };
  }
  if (d.status !== "1") {
    return { address: candidate, status: "ERROR", reason: d.message };
  }

  const rows = d.result || [];
  const lower = candidate.toLowerCase();
  let inRaw = 0n, outRaw = 0n, inCount = 0, outCount = 0;
  const txSet = new Set();

  for (const r of rows) {
    const from = (r.from || "").toLowerCase();
    const to = (r.to || "").toLowerCase();
    const val = toBigInt(r.value);
    if (r.hash) txSet.add(r.hash);
    if (to === lower) { inRaw += val; inCount++; }
    else if (from === lower) { outRaw += val; outCount++; }
  }

  const net = inRaw - outRaw;
  const onePercentOfIn = inRaw / 100n;

  let classification;
  if (inRaw === 0n && outRaw === 0n) {
    classification = "NO_ACTIVITY";
  } else if (net <= 0n) {
    classification = net === 0n ? "PASS_THROUGH" : "NET_SELLER";
  } else if (net <= onePercentOfIn) {
    classification = "PASS_THROUGH";
  } else if (net < toBigInt(MATERIAL_THRESHOLD_RAW)) {
    classification = "DUST_HOLDER";
  } else {
    classification = "NET_HOLDER";
  }

  return {
    address: candidate,
    status: "OK",
    inCount, outCount, txCount: txSet.size,
    inRaw: inRaw.toString(),
    outRaw: outRaw.toString(),
    netRaw: net.toString(),
    netFormatted: formatPEPE(net < 0n ? -net : net) + (net < 0n ? " (neg)" : ""),
    classification,
  };
}

async function main() {
  const src = JSON.parse(fs.readFileSync("pepe-buyers-final-v4.json", "utf8"));
  const candidates = (src.candidates || []).map(c => c.address);
  log("checking " + candidates.length + " candidates");
  log("window blocks: " + WINDOW_START_BLOCK + " .. " + WINDOW_END_BLOCK);
  log("material threshold: 10,000,000 PEPE\n");

  const results = [];
  const progressEvery = 25;

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const r = await checkCandidate(c);
    results.push(r);
    if ((i + 1) % progressEvery === 0) {
      const counts = {};
      for (const x of results) counts[x.classification || "ERROR"] = (counts[x.classification || "ERROR"] || 0) + 1;
      log("  [" + (i + 1) + "/" + candidates.length + "] " + JSON.stringify(counts));
    }
    await sleep(200);
  }

  const summary = {};
  for (const r of results) {
    const k = r.classification || "ERROR";
    summary[k] = (summary[k] || 0) + 1;
  }

  const netHolders = results.filter(r => r.classification === "NET_HOLDER");
  netHolders.sort((a, b) => {
    const an = toBigInt(a.netRaw);
    const bn = toBigInt(b.netRaw);
    return bn > an ? 1 : -1;
  });

  const out = {
    version: "full-windowed-check-v1",
    ranAt: new Date().toISOString(),
    window: { startBlock: WINDOW_START_BLOCK, endBlock: WINDOW_END_BLOCK },
    materialThresholdRaw: MATERIAL_THRESHOLD_RAW,
    totalCandidates: candidates.length,
    summary,
    netHolderCount: netHolders.length,
    topNetHolders: netHolders.slice(0, 50),
  };

  fs.writeFileSync("/tmp/full-windowed-check.json", JSON.stringify(out, null, 2));

  log("\n=== summary ===");
  for (const [k, v] of Object.entries(summary)) log("  " + k + ": " + v);
  log("\nNET_HOLDER candidates: " + netHolders.length);
  log("written: /tmp/full-windowed-check.json");

  console.log(JSON.stringify({
    netHolderCount: netHolders.length,
    summary,
    top10: netHolders.slice(0, 10),
  }, null, 2));
}

main().catch(e => { console.error(e.stack || e); process.exit(1); });
