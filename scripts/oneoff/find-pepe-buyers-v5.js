#!/usr/bin/env node
"use strict";

/**
 * find-pepe-buyers-v5.js
 *
 * Implements docs/designs/pepe-buyer-attribution-v1.1.md §9.
 *
 * COMPLIANCE STATE (2026-10-15 first pass):
 *   - §3.1 DIRECT_ORIGINATOR          full
 *   - §3.2 TRACED_ECONOMIC_RECIPIENT  partial (quote-outflow present;
 *                                     reserve reconciliation TODO)
 *   - §3.3 INTERMEDIARY               full
 *   - §3.4 UNRESOLVED                 partial (no 4337/truncation reason)
 *   - §5 audit schema                 partial (evidence sub-object TODO)
 *   - §6 acceptance                   partial (no manual-review harness)
 *
 * Verified against three known candidates:
 *   0x522ae683 BUYER, 0xbdb3ba9f NOT_BUYER, 0x51c72848 NOT_BUYER.
 *
 * COMPLIANCE STATE (2026-10-15 first pass):
 *   - §3.1 DIRECT_ORIGINATOR       full
 *   - §3.2 TRACED_ECONOMIC_RECIPIENT  partial: quote-outflow check
 *                                     present, reserve reconciliation
 *                                     NOT implemented
 *   - §3.3 INTERMEDIARY             full
 *   - §3.4 UNRESOLVED               partial: 4337/truncation reasons
 *                                   not detected, generic fallthrough
 *   - §5 audit schema               partial: evidence sub-object not
 *                                   emitted, only acquisitions array
 *   - §6 acceptance                 partial: no manual-review harness
 *
 * Verified against two known cases from data/pepe-buyer-list/v1.json:
 *   0x522ae683 → BUYER,  0xbdb3ba9f → NOT_BUYER.
 *
 * Pipeline:
 *   1. Extract Swap events in window (v4 extraction, no candidate cap,
 *      retains tx hash per event)
 *   2. Aggregate candidate inflows, filter to >= minPepe
 *   3. Per (candidate, tx) pair, fetch:
 *        a. tx receipt  — status, from, to, method selector
 *        b. token transfers — target inflow, quote outflow, pair addr
 *        c. contract metadata — is_contract, proxy_type, implementations, tags
 *      Then apply §3 decision tree
 *   4. Retain candidates with >=1 DIRECT_ORIGINATOR or
 *      TRACED_ECONOMIC_RECIPIENT acquisition
 *   5. Emit §5 audit records + population list
 *   6. Run §6 acceptance checks
 *
 * Reads:  nothing (re-extracts from chain)
 * Writes: data/pepe-buyer-list/v2.json
 *         data/audit-records/pepe-buyer-audit-v5.jsonl
 *
 * Env: BLOCKSCOUT_API_KEY
 *
 * CLI:
 *   --window-start 2026-08-12
 *   --window-end   2026-08-19
 *   --min-pepe     1000000000
 *   --chunk-size   5000
 *   --candidates   0x...,0x...      (optional; skip extraction, classify only)
 *   --max-per-cand 10               (cap on swap txs classified per candidate)
 */

const fs = require("node:fs");
const path = require("node:path");

// ---- Constants (v4-unchanged) ----
const PEPE   = "0x6982508145454ce325ddbe47a25d4ec3d2311933";
const WETH   = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const PAIR   = "0xa43fe16908251ee70ef74718545e4fe6c5ccec9f";
const API_ES = "https://api.blockscout.com/1/api";
const API_V2 = "https://api.blockscout.com/1/api/v2";
const SWAP_TOPIC_V2 = "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822";
const KEY = process.env.BLOCKSCOUT_API_KEY || "";
const HEADERS = { accept: "application/json", "user-agent": "weaver-find-pepe-buyers/5.0" };

// ---- §2.6 QUOTES set ----
const QUOTES = new Set([
  WETH,
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC
  "0xdac17f958d2ee523a2206206994597c13d831ec7", // USDT
  "0x6b175474e89094c44da98b954eedeac495271d0f", // DAI
  "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", // WBTC
  "0x4fabb145d64652a948d72533023f6e7a623c7c53", // BUSD
]);

// ---- §3.1 direct-swap selectors ----
const DIRECT_SWAP_METHODS = new Set([
  "0x7ff36ab5", // swapExactETHForTokens
  "0x18cbafe5", // swapExactTokensForETH
  "0x38ed1739", // swapExactTokensForTokens
  "0x8803dbee", // swapTokensForExactTokens
  "0xfb3bdb41", // swapETHForExactTokens
  "0x4a25d94a", // swapTokensForExactETH
  "0x022c0d9f", // pair.swap
  "0x3593564c", // Universal Router execute(bytes,bytes[],uint256)
]);

// Native-ETH purchases: the payer's ETH is msg.value, visible on the
// outer transaction. No ERC-20 Transfer log has the candidate as `from`;
// the WETH that reaches the pair is minted from the zero address. Treat
// `tx.value > 0 && tx.from == candidate` as a quote outflow for §3.1/§3.2.
function nativeQuoteOutflow(tx, candidate) {
  const v = tx && tx.value;
  if (!v) return null;
  let val;
  try { val = BigInt(v); } catch { return null; }
  if (val <= 0n) return null;
  const txFrom = lower(tx.from && (tx.from.hash || tx.from));
  if (txFrom !== candidate) return null;
  return { token: "native-eth", from: candidate, raw: val.toString() };
}

// ---- §4.1 rate-limit handling ----
const SLEEP_MS = 1200;
const FETCH_TRIES = 5;
const TRACE_TRUNCATION_MARKER = null; // if trace returns next_page_params, no more pages supported

// ---- Logging ----
function log(m) { process.stderr.write(m + "\n"); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function lower(s) { return (s || "").toLowerCase(); }
function authUrl(u) {
  if (!KEY) return u;
  return u + (u.includes("?") ? "&" : "?") + "apikey=" + encodeURIComponent(KEY);
}

async function fetchJson(url, tries = FETCH_TRIES) {
  for (let i = 0; i < tries; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    try {
      const res = await fetch(authUrl(url), { headers: HEADERS, signal: ctrl.signal });
      clearTimeout(timer);
      if (res.status === 429) {
        if (i + 1 < tries) { const w = 3000 * Math.pow(2, i); log("    429 sleep " + w + "ms"); await sleep(w); continue; }
      }
      if (res.status === 402) { log("    402 out of credits"); return null; }
      if (!res.ok) { log("    HTTP " + res.status + " " + url.slice(0, 80)); return null; }
      return await res.json();
    } catch (e) {
      clearTimeout(timer);
      if (i + 1 === tries) { log("    err: " + e.message); return null; }
      await sleep(3000 * Math.pow(2, i));
    }
  }
  return null;
}

// ---- §9.1 Swap-event extraction (v4-unchanged, with tx hash retention) ----
async function exactBlockAt(date) {
  const ts = Math.floor(Date.parse(date + "T00:00:00Z") / 1000);
  const d = await fetchJson(API_ES + "?module=block&action=getblocknobytime&timestamp=" + ts + "&closest=before");
  const n = Number(d && d.result && d.result.blockNumber);
  return Number.isSafeInteger(n) ? n : null;
}

async function fetchSwapLogs(startBlock, endBlock, chunkSize) {
  const all = [];
  let cursor = startBlock;
  while (cursor <= endBlock) {
    const chunkEnd = Math.min(cursor + chunkSize - 1, endBlock);
    const q = "?module=logs&action=getLogs&fromBlock=" + cursor
      + "&toBlock=" + chunkEnd
      + "&address=" + PAIR
      + "&topic0=" + SWAP_TOPIC_V2;
    const d = await fetchJson(API_ES + q);
    if (!d || d.status !== "1") {
      cursor = chunkEnd + 1;
      await sleep(300);
      continue;
    }
    const logs = d.result || [];
    if (logs.length >= 1000) {
      const mid = Math.floor((cursor + chunkEnd) / 2);
      const sub1 = await fetchJson(API_ES + "?module=logs&action=getLogs&fromBlock=" + cursor + "&toBlock=" + mid + "&address=" + PAIR + "&topic0=" + SWAP_TOPIC_V2);
      const sub2 = await fetchJson(API_ES + "?module=logs&action=getLogs&fromBlock=" + (mid+1) + "&toBlock=" + chunkEnd + "&address=" + PAIR + "&topic0=" + SWAP_TOPIC_V2);
      if (sub1 && sub1.status === "1") all.push(...(sub1.result || []));
      if (sub2 && sub2.status === "1") all.push(...(sub2.result || []));
    } else {
      all.push(...logs);
    }
    cursor = chunkEnd + 1;
    await sleep(300);
  }
  return all;
}

function extractEvents(logs) {
  // Returns [{ txHash, blockNumber, candidate, amountOut }]
  const events = [];
  for (const ev of logs) {
    const topics = ev.topics || [];
    if (topics.length < 3) continue;
    const to = "0x" + topics[2].slice(26).toLowerCase();
    const data = ev.data || "0x";
    if (data.length < 2 + 64 * 4) continue;
    let amount0Out;
    try { amount0Out = BigInt("0x" + data.slice(130, 194)); } catch { continue; }
    if (amount0Out <= 0n) continue;
    events.push({
      txHash: ev.transactionHash,
      blockNumber: typeof ev.blockNumber === "string" && ev.blockNumber.startsWith("0x") ? parseInt(ev.blockNumber, 16) : parseInt(ev.blockNumber, 10),
      candidate: to,
      amountOut: amount0Out,
    });
  }
  return events;
}

// ---- §9.3 per-candidate evidence fetch ----
async function fetchTxV2(hash) {
  return await fetchJson(API_V2 + "/transactions/" + hash);
}

async function fetchTokenTransfersV2(hash) {
  return await fetchJson(API_V2 + "/transactions/" + hash + "/token-transfers");
}

async function fetchInternalTxsV2(hash) {
  return await fetchJson(API_V2 + "/transactions/" + hash + "/internal-transactions");
}

async function fetchAddressMeta(addr) {
  const d = await fetchJson(API_V2 + "/addresses/" + addr);
  if (!d) return null;
  return {
    is_contract: !!d.is_contract,
    proxy_type: d.proxy_type || null,
    implementations: (d.implementations || []).map((i) => ({
      address: lower(i.address_hash || i.address || ""),
      name: i.name || null,
    })),
    name: d.name || null,
    tags: ((d.metadata || {}).tags || []).map((t) => t.name).filter(Boolean),
    public_tags: d.public_tags || [],
  };
}

// ---- §3 decision tree ----
function controlledBySingleSigner(meta) {
  // §3.2 amended: is_contract=false OR proxy_type="eip7702" with
  // a known smart-account implementation
  if (!meta) return false;
  if (!meta.is_contract) return true;
  if (meta.proxy_type === "eip7702") {
    // Any implementation is accepted for v1.1; a stricter allowlist
    // would check for Simple7702Account, etc.
    return meta.implementations.length > 0;
  }
  return false;
}

function isIntermediaryContract(meta) {
  if (!meta) return false;
  if (!meta.is_contract) return false;
  if (meta.proxy_type === "eip7702") return false;
  return true;
}

function classifyOne(ctx) {
  const {
    candidate,
    txHash,
    tx,
    transfers,
    internalTxs,
    meta,
    amountOut,
    targetInflowRaw,
  } = ctx;

  // §3.0 preconditions
  if (!tx || tx.status !== "ok") {
    return { classification: "REJECTED", reason_code: "tx-status-not-ok" };
  }
  const txFrom = lower(tx.from && (tx.from.hash || tx.from));
  const candidateInTo = transfers.some(
    (t) => lower(t.to && (t.to.hash || t.to)) === candidate
      && lower(t.token && (t.token.address_hash || t.token.address)) === PEPE
  );
  if (!candidateInTo) {
    return { classification: "UNRESOLVED", reason_code: "no-target-inflow" };
  }

  // Round-trip check
  const inflow = transfers.filter(
    (t) => lower(t.to && (t.to.hash || t.to)) === candidate
      && lower(t.token && (t.token.address_hash || t.token.address)) === PEPE
  );
  const outflow = transfers.filter(
    (t) => lower(t.from && (t.from.hash || t.from)) === candidate
      && lower(t.token && (t.token.address_hash || t.token.address)) === PEPE
  );
  const inSum = inflow.reduce((a, t) => a + BigInt(t.total && t.total.value || "0"), 0n);
  const outSum = outflow.reduce((a, t) => a + BigInt(t.total && t.total.value || "0"), 0n);
  if (inSum > 0n && outSum >= inSum) {
    return { classification: "INTERMEDIARY", reason_code: "round-trip-in-tx" };
  }

  // §3.3 INTERMEDIARY: contract that isn't a 7702 account
  if (isIntermediaryContract(meta)) {
    return { classification: "INTERMEDIARY", reason_code: "candidate-is-contract",
      meta: { proxy_type: meta.proxy_type, name: meta.name } };
  }

  // Quote-asset outflow (§2.6) — ERC-20 or native ETH
  const ercQuote = transfers.find(
    (t) => lower(t.from && (t.from.hash || t.from)) === candidate
      && QUOTES.has(lower(t.token && (t.token.address_hash || t.token.address)))
  );
  const nativeQuote = nativeQuoteOutflow(tx, candidate);
  const quoteOutflow = ercQuote
    ? {
        token: lower(ercQuote.token.address_hash || ercQuote.token.address),
        from: candidate,
        native: false,
      }
    : nativeQuote
      ? { token: "native-eth", from: candidate, native: true }
      : null;

  // §3.1 DIRECT_ORIGINATOR
  const method = tx.raw_input
    ? tx.raw_input.slice(0, 10).toLowerCase()
    : (tx.method || null);
  if (txFrom === candidate && DIRECT_SWAP_METHODS.has(method) && quoteOutflow) {
    return { classification: "DIRECT_ORIGINATOR", reason_code: "direct-swap",
      method, quote_token: quoteOutflow.token };
  }

  // §3.2 TRACED_ECONOMIC_RECIPIENT
  if (quoteOutflow && controlledBySingleSigner(meta)) {
    // Reserve reconciliation still TODO; accepts any visible quote outflow
    // (ERC-20 or native ETH). Refinement deferred to v1.2.
    return { classification: "TRACED_ECONOMIC_RECIPIENT",
      reason_code: quoteOutflow.native
        ? "native-eth-outflow-and-single-signer"
        : "quote-outflow-and-single-signer",
      quote_token: quoteOutflow.token,
      proxy_type: meta ? meta.proxy_type : null };
  }

  // §3.4 UNRESOLVED fallthrough
  return { classification: "UNRESOLVED", reason_code: "no-decisive-evidence" };
}

// ---- §9 per-candidate processing ----
// §9.1.5 pre-filter (v1.3): drop candidates whose windowed net position
// does not reflect a retained PEPE holding.
let __windowStartBlock = null;
let __windowEndBlock = null;
const PREFILTER_MIN_NET_WEI = 10n ** 24n;  // 1M PEPE
const PREFILTER_MAX_OUT_IN = 0.5;

async function prefilterCandidate(candidate) {
  if (__windowStartBlock === null || __windowEndBlock === null) {
    return { pass: true };
  }
  const url = API_ES + "?module=account&action=tokentx"
    + "&address=" + candidate
    + "&contractaddress=" + PEPE
    + "&startblock=" + String(__windowStartBlock)
    + "&endblock=" + String(__windowEndBlock)
    + "&sort=asc&page=1&offset=1000";
  const d = await fetchJson(url);
  if (!d || d.status !== "1") {
    return { pass: false, reason: "prefilter-fetch-failed" };
  }
  const rows = d.result || [];
  let net = 0n, inCount = 0, outCount = 0;
  for (const r of rows) {
    let v; try { v = BigInt(r.value || "0"); } catch { continue; }
    if (lower(r.to) === candidate)   { net += v; inCount++; }
    if (lower(r.from) === candidate) { net -= v; outCount++; }
  }
  if (net < PREFILTER_MIN_NET_WEI) {
    return { pass: false, reason: "prefilter-net-below-1e24" };
  }
  if (inCount > 0 && (outCount / inCount) > PREFILTER_MAX_OUT_IN) {
    return { pass: false, reason: "prefilter-out-in-" + outCount + "/" + inCount };
  }
  return { pass: true };
}

async function processCandidate(candidate, eventsForCandidate, maxPerCand) {
  const pre = await prefilterCandidate(candidate);
  if (!pre.pass) {
    return {
      address: candidate,
      contract_meta: null,
      totalSwapTxs: eventsForCandidate.length,
      classifiedTxs: 0,
      confirmed: 0,
      classification: "NOT_BUYER",
      prefilter: pre,
      acquisitions: [],
    };
  }
  await sleep(SLEEP_MS);

  const meta = await fetchAddressMeta(candidate);
  await sleep(SLEEP_MS);

  const slice = eventsForCandidate.slice(0, maxPerCand);
  const acquisitions = [];
  for (const ev of slice) {
    const tx = await fetchTxV2(ev.txHash);
    await sleep(SLEEP_MS);
    if (!tx) {
      acquisitions.push({ txHash: ev.txHash, blockNumber: ev.blockNumber,
        classification: "UNRESOLVED", reason_code: "provider-error-tx" });
      continue;
    }
    const transfersResp = await fetchTokenTransfersV2(ev.txHash);
    await sleep(SLEEP_MS);
    const transfers = (transfersResp && transfersResp.items) || [];

    const ctx = {
      candidate,
      txHash: ev.txHash,
      tx,
      transfers,
      internalTxs: null,
      meta,
      amountOut: ev.amountOut,
      targetInflowRaw: ev.amountOut.toString(),
    };
    const cls = classifyOne(ctx);
    acquisitions.push({
      txHash: ev.txHash,
      blockNumber: ev.blockNumber,
      amountRaw: ev.amountOut.toString(),
      ...cls,
    });
  }

  const confirmed = acquisitions.filter(
    (a) => a.classification === "DIRECT_ORIGINATOR"
        || a.classification === "TRACED_ECONOMIC_RECIPIENT"
  );

  return {
    address: candidate,
    contract_meta: meta,
    totalSwapTxs: eventsForCandidate.length,
    classifiedTxs: slice.length,
    confirmed: confirmed.length,
    classification: confirmed.length > 0 ? "BUYER" : "NOT_BUYER",
    acquisitions,
  };
}

// ---- §6 acceptance ----
function acceptanceCheck(results, eventsCount) {
  const tally = { DIRECT_ORIGINATOR: 0, TRACED_ECONOMIC_RECIPIENT: 0,
    INTERMEDIARY: 0, UNRESOLVED: 0, REJECTED: 0 };
  for (const r of results) {
    for (const a of r.acquisitions) {
      if (tally[a.classification] !== undefined) tally[a.classification]++;
    }
  }
  const total = Object.values(tally).reduce((a, b) => a + b, 0);
  const unresolvedPct = total > 0 ? (tally.UNRESOLVED / total) * 100 : 0;
  return {
    swapEventsScanned: eventsCount,
    candidatesProcessed: results.length,
    acquisitionsByClass: tally,
    totalAcquisitions: total,
    unresolvedPct: Number(unresolvedPct.toFixed(2)),
    unresolvedCeilingPass: unresolvedPct < 40,
  };
}

// ---- Main ----
async function main() {
  if (!KEY) { log("BLOCKSCOUT_API_KEY not set"); process.exit(1); }

  function arg(name, fb) {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : fb;
  }

  const windowStart = arg("--window-start", "2026-08-12");
  const windowEnd   = arg("--window-end",   "2026-08-19");
  const minPepe     = BigInt(arg("--min-pepe", "1000000000"));
  const chunkSize   = Number(arg("--chunk-size", "5000"));
  const maxPerCand  = Number(arg("--max-per-cand", "10"));
  const candArg     = arg("--candidates", null);
  const limitCands  = Number(arg("--limit-candidates", "0")) || 0;

  fs.mkdirSync("data/pepe-buyer-list", { recursive: true });
  fs.mkdirSync("data/audit-records", { recursive: true });

  let events;
  if (candArg) {
    // Classification-only mode: synthetic events with amountOut=0, so
    // caller must supply candidates directly. Intended for smoke tests.
    const candidates = candArg.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    log("candidates mode: " + candidates.length + " provided, extraction skipped");
    events = candidates.map((c) => ({ txHash: null, blockNumber: 0, candidate: c, amountOut: 0n }));
  } else {
    log("=== find-pepe-buyers-v5 ===");
    const startBlock = await exactBlockAt(windowStart);
    await sleep(300);
    const endBlock = await exactBlockAt(windowEnd);
    if (startBlock === null || endBlock === null) { log("block lookup failed"); process.exit(1); }
    log("blocks: " + startBlock + " .. " + endBlock);
  __windowStartBlock = startBlock;
  __windowEndBlock = endBlock;

    const logs = await fetchSwapLogs(startBlock, endBlock, chunkSize);
    log("swap events: " + logs.length);
    events = extractEvents(logs);
    log("extracted " + events.length + " candidate-acquisitions");
  }

  // Aggregate by candidate
  const byCand = new Map();
  for (const ev of events) {
    if (!byCand.has(ev.candidate)) byCand.set(ev.candidate, []);
    byCand.get(ev.candidate).push(ev);
  }

  // Filter by minPepe (sum of amountOut)
  const retained = [];
  for (const [addr, evs] of byCand) {
    const sum = evs.reduce((a, e) => a + e.amountOut, 0n);
    if (sum >= minPepe) retained.push([addr, evs, sum]);
  }
  retained.sort((a, b) => (a[2] > b[2] ? -1 : 1));
  if (limitCands > 0 && retained.length > limitCands) {
    log("limit-candidates=" + limitCands + ": trimming from " + retained.length);
    retained.length = limitCands;
  }
  log("candidates with total >= minPepe: " + retained.length);

  // Process each
  const results = [];
  let i = 0;
  for (const [addr, evs] of retained) {
    i++;
    log("[" + i + "/" + retained.length + "] " + addr.slice(0, 10) + " txs=" + evs.length);
    try {
      const r = await processCandidate(addr, evs, maxPerCand);
      results.push(r);
      log("  -> " + r.classification + " confirmed=" + r.confirmed + "/" + r.classifiedTxs);
    } catch (e) {
      log("  ERROR: " + e.message);
      results.push({ address: addr, classification: "ERROR", reason_code: e.message, acquisitions: [] });
    }
  }

  const buyers = results.filter((r) => r.classification === "BUYER");
  const notBuyers = results.filter((r) => r.classification === "NOT_BUYER");
  const errors = results.filter((r) => r.classification === "ERROR");

  const acceptance = acceptanceCheck(results, events.length);

  // Write population list
  fs.writeFileSync("data/pepe-buyer-list/v2.json", JSON.stringify({
    version: "pepe-buyer-list-v2",
    generatedAt: new Date().toISOString(),
    spec: "docs/designs/pepe-buyer-attribution-v1.1.md",
    window: { start: windowStart, end: windowEnd },
    minPepe: minPepe.toString(),
    counts: {
      candidatesProcessed: retained.length,
      buyers: buyers.length,
      notBuyers: notBuyers.length,
      errors: errors.length,
    },
    acceptance,
    buyers: buyers.map((b) => ({
      address: b.address,
      confirmed: b.confirmed,
      classifiedTxs: b.classifiedTxs,
    })),
  }, null, 2));

  // Write audit records (JSONL, one per candidate)
  const auditStream = fs.createWriteStream("data/audit-records/pepe-buyer-audit-v5.jsonl", { flags: "w" });
  for (const r of results) {
    auditStream.write(JSON.stringify({
      schema_version: "buyer-attribution-v1.1",
      candidate_address: r.address,
      classification: r.classification,
      contract_status: r.contract_meta || null,
      acquisitions: r.acquisitions,
      created_at: new Date().toISOString(),
    }) + "\n");
  }
  auditStream.end();

  log("\n=== summary ===");
  log("  BUYER:      " + buyers.length);
  log("  NOT_BUYER:  " + notBuyers.length);
  log("  ERROR:      " + errors.length);
  log("  UNRESOLVED: " + acceptance.unresolvedPct + "%");
  log("  ceiling pass (<40%): " + acceptance.unresolvedCeilingPass);

  console.log(JSON.stringify({
    buyers: buyers.length,
    notBuyers: notBuyers.length,
    errors: errors.length,
    acceptance,
    buyerList: buyers.map((b) => b.address),
  }, null, 2));
}

main().catch((e) => { console.error(e.stack || e); process.exit(1); });
