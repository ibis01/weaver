#!/usr/bin/env node
"use strict";

/**
 * attribute-net-holders-v1.js
 *
 * For each NET_HOLDER candidate from the windowed check, verify that at
 * least one PEPE acquisition in the primary window is a legitimate
 * purchase (direct router swap or aggregator-routed swap), not a
 * transfer, airdrop, or pass-through.
 *
 * Classifications per acquisition:
 *   DIRECT_ORIGINATOR         tx.from == candidate, method is swap
 *   TRACED_ECONOMIC_RECIPIENT candidate received token via Swap event
 *   INTERMEDIARY              candidate is a contract or forwarded
 *   UNRESOLVED                trace/logs unavailable
 *
 * Candidate retained if >= 1 DIRECT_ORIGINATOR or TRACED_ECONOMIC_RECIPIENT
 *
 * Reads:  data/pepe-net-holders-v1.json
 * Writes: /tmp/net-holder-attribution.json
 *
 * Env: BLOCKSCOUT_API_KEY (recommended for headroom)
 */

const fs = require("node:fs");

const PEPE = "0x6982508145454ce325ddbe47a25d4ec3d2311933";
const API = "https://eth.blockscout.com/api";
const V2 = "https://eth.blockscout.com/api/v2";
const KEY = process.env.BLOCKSCOUT_API_KEY || "";
const HEADERS = { accept: "application/json", "user-agent": "weaver-attr/1.0" };

// Uniswap V2 Swap event topic
// Swap(uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)
const V2_SWAP_TOPIC = "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822";
// Uniswap V3 Swap event topic
// Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160, uint128, int24)
const V3_SWAP_TOPIC = "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67";

// Known swap method selectors
const SWAP_METHODS = new Set([
  "0x022c0d9f", // pair.swap()
  "0x38ed1739", // swapExactTokensForTokens
  "0x7ff36ab5", // swapExactETHForTokens
  "0x18cbafe5", // swapExactTokensForETH
  "0x5c11d795",
  "0xb6f9de95",
  "0x791ac947",
  "0x8803dbee",
  "0x4a25d94a",
  "0xfb3bdb41",
  "0x3593564c", // Universal Router execute()
]);

function log(m) { process.stderr.write(m + "\n"); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function authUrl(url) {
  if (!KEY) return url;
  return url + (url.includes("?") ? "&" : "?") + "apikey=" + encodeURIComponent(KEY);
}
function lower(v) { return String(v || "").toLowerCase(); }

async function fetchJson(url, tries) {
  if (tries === undefined) tries = 4;
  for (let i = 0; i < tries; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    try {
      const res = await fetch(authUrl(url), { headers: HEADERS, signal: ctrl.signal });
      clearTimeout(timer);
      if (res.status === 429 || res.status === 402) {
        if (i + 1 < tries) { await sleep(3000 * Math.pow(2, i)); continue; }
      }
      if (!res.ok) { log("    HTTP " + res.status); return null; }
      return await res.json();
    } catch (e) {
      clearTimeout(timer);
      if (i + 1 === tries) { log("    err: " + e.message); return null; }
      await sleep(2000 * Math.pow(2, i));
    }
  }
  return null;
}

// Determine whether a tx's logs contain a swap event whose recipient is the
// candidate. We look at V2 Swap's `to` field (topics[2]) and V3 Swap's
// recipient (topics[2]).
async function hasSwapToCandidate(txHash, candidate) {
  const logs = await fetchJson(`${V2}/transactions/${txHash}/logs`);
  if (!logs || !Array.isArray(logs.items)) return { hasSwap: false, reason: "logs-unavailable" };

  const c = lower(candidate);
  for (const item of logs.items) {
    const topics = item.topics || [];
    if (topics.length < 3) continue;
    const t0 = lower(topics[0]);
    if (t0 !== V2_SWAP_TOPIC && t0 !== V3_SWAP_TOPIC) continue;
    // topics[2] is the recipient for both V2 and V3 Swap
    const recipient = "0x" + topics[2].slice(26).toLowerCase();
    if (recipient === c) return { hasSwap: true, topic: t0 };
  }
  return { hasSwap: false, reason: "no-swap-event-to-candidate" };
}

function methodSelector(tx) {
  const raw = tx.raw_input || tx.input || "";
  if (typeof raw !== "string" || raw.length < 10) return null;
  return raw.slice(0, 10).toLowerCase();
}

async function classifyAcquisition(txHash, candidate) {
  // Fetch receipt
  const tx = await fetchJson(`${V2}/transactions/${txHash}`);
  if (!tx) return { classification: "UNRESOLVED", reason: "receipt-fetch-failed" };

  const status = tx.status;
  if (status !== "ok" && status !== 1 && status !== "1") {
    return { classification: "UNRESOLVED", reason: "tx-failed" };
  }

  const txFrom = lower(tx.from && tx.from.hash);
  const txTo = lower(tx.to && tx.to.hash);
  const c = lower(candidate);
  const method = methodSelector(tx);

  // Fetch token transfers to determine value direction
  const tt = await fetchJson(`${V2}/transactions/${txHash}/token-transfers`);
  if (!tt || !Array.isArray(tt.items)) {
    return { classification: "UNRESOLVED", reason: "token-transfers-unavailable" };
  }

  let pepeIn = 0n;
  let pepeOut = 0n;
  let usdcOut = 0n;
  let wethOut = 0n;
  for (const item of tt.items) {
    const token = lower(item.token && item.token.address_hash);
    const from = lower(item.from && item.from.hash);
    const to = lower(item.to && item.to.hash);
    let val = 0n;
    try { val = BigInt(String(item.total && item.total.value || "0")); } catch { continue; }

    if (token === lower(PEPE)) {
      if (to === c) pepeIn += val;
      if (from === c) pepeOut += val;
    }
    if (from === c) {
      // Stablecoin or WETH outflow
      if (token === "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2") wethOut += val;
      else if (token === "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48") usdcOut += val;
      else if (token === "0xdac17f958d2ee523a2206206994597c13d831ec7") usdcOut += val;
      else if (token === "0x6b175474e89094c44da98b954eedeac495271d0f") usdcOut += val;
    }
  }

  if (pepeIn === 0n) {
    return { classification: "UNRESOLVED", reason: "no-pepe-inflow" };
  }

  const directOriginator = txFrom === c;

  if (directOriginator && SWAP_METHODS.has(method || "")) {
    return {
      classification: "DIRECT_ORIGINATOR",
      reason: "tx-from-is-candidate-and-method-is-swap",
      method,
    };
  }

  // If candidate is not the tx originator, check for a swap event to it
  const swapCheck = await hasSwapToCandidate(txHash, candidate);
  if (swapCheck.hasSwap) {
    const hasQuote = usdcOut > 0n || wethOut > 0n;
    if (hasQuote || directOriginator) {
      return {
        classification: "TRACED_ECONOMIC_RECIPIENT",
        reason: hasQuote
          ? "swap-event-to-candidate-with-quote-outflow"
          : "swap-event-to-candidate",
      };
    }
    return {
      classification: "TRACED_ECONOMIC_RECIPIENT",
      reason: "swap-event-to-candidate-no-quote-visible",
    };
  }

  // Received PEPE but no swap event and no direct originator
  if (pepeOut > 0n && pepeOut >= pepeIn) {
    return { classification: "INTERMEDIARY", reason: "pepe-out-equals-or-exceeds-in" };
  }

  return { classification: "UNRESOLVED", reason: "no-swap-evidence" };
}

async function processCandidate(candidate) {
  // Fetch PEPE transfers in the window
  const START_BLOCK = 25710000;
  const END_BLOCK   = 25820000;
  const url = `${API}?module=account&action=tokentx`
    + `&address=${candidate}`
    + `&contractaddress=${PEPE}`
    + `&startblock=${START_BLOCK}&endblock=${END_BLOCK}`
    + `&sort=asc&page=1&offset=1000`;

  const d = await fetchJson(url);
  if (!d || d.status !== "1") {
    return { address: candidate, status: "ERROR", reason: "tokentx-fetch-failed" };
  }

  const rows = d.result || [];
  const c = lower(candidate);
  const inflows = rows.filter(r => lower(r.to) === c);
  const acquisitions = [];

  for (const inflow of inflows) {
    const txHash = inflow.hash;
    const classification = await classifyAcquisition(txHash, candidate);
    acquisitions.push({
      txHash,
      blockNumber: inflow.blockNumber,
      timestamp: inflow.timeStamp,
      amountRaw: inflow.value,
      ...classification,
    });
    await sleep(300);
  }

  const confirmed = acquisitions.filter(
    a => a.classification === "DIRECT_ORIGINATOR" || a.classification === "TRACED_ECONOMIC_RECIPIENT"
  );

  return {
    address: candidate,
    status: "COMPLETE",
    totalAcquisitions: acquisitions.length,
    confirmed: confirmed.length,
    classification: confirmed.length > 0 ? "BUYER" : "NOT_BUYER",
    acquisitions,
  };
}

async function main() {
  const src = JSON.parse(fs.readFileSync("data/pepe-net-holders-v1.json", "utf8"));
  const candidates = src.candidates.map(c => c.address);
  log("processing " + candidates.length + " NET_HOLDER candidates");

  const results = [];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    log(`[${i + 1}/${candidates.length}] ${c.slice(0, 10)}...`);
    try {
      const r = await processCandidate(c);
      results.push(r);
      log(`  → ${r.classification || r.reason} (${r.confirmed || 0}/${r.totalAcquisitions || 0} confirmed)`);
    } catch (e) {
      log(`  → ERROR ${e.message}`);
      results.push({ address: c, status: "ERROR", reason: e.message });
    }
    await sleep(400);
  }

  const buyers = results.filter(r => r.classification === "BUYER");
  const notBuyers = results.filter(r => r.classification === "NOT_BUYER");
  const errors = results.filter(r => r.status === "ERROR");

  const out = {
    version: "net-holder-attribution-v1",
    ranAt: new Date().toISOString(),
    totalCandidates: candidates.length,
    buyers: buyers.length,
    notBuyers: notBuyers.length,
    errors: errors.length,
    results,
  };

  fs.writeFileSync("/tmp/net-holder-attribution.json", JSON.stringify(out, null, 2));
  log("\n=== summary ===");
  log("  BUYER:      " + buyers.length);
  log("  NOT_BUYER:  " + notBuyers.length);
  log("  ERROR:      " + errors.length);
  log("\nwritten: /tmp/net-holder-attribution.json");

  console.log(JSON.stringify({
    buyers: buyers.length,
    notBuyers: notBuyers.length,
    errors: errors.length,
    buyerList: buyers.map(b => b.address),
  }, null, 2));
}

main().catch(e => { console.error(e.stack || e); process.exit(1); });
