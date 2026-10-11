#!/usr/bin/env node
/**
 * Weaver — pattern-check-v2.js
 *
 * Evidence-graded DEX-buy verification for the 5 gold-standard wallets.
 * Port of the Python scratch script, committed so the pattern check is
 * reproducible. Node 22 built-in fetch. No npm dependencies.
 *
 * Classification:
 *   CONFIRMED_DEX_BUY     router interaction + quote outflow + token inflow
 *   LIKELY_DEX_BUY        token inflow + (router OR quote outflow)
 *   TRANSFER_ONLY         token inflow only
 *   UNCLASSIFIED          parent tx unavailable or data contradictory
 *
 * Output: gold-pattern-check-v2.json in the current directory.
 * Run:    node scripts/oneoff/pattern-check-v2.js
 */

"use strict";

const fs = require("fs");
const path = require("path");

// ── Config ─────────────────────────────────────────────────────────────

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

const ROUTERS = {
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
  "0x2f0b23f53734252bda2277357e97e1517d6b042a": "Uniswap V3 Router (migrated)",
  "0x00000000006c3852cbef3e08e8df289169ede581": "OpenSea Seaport",
};

const QUOTES = {
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": "WETH",
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "USDC",
  "0xdac17f958d2ee523a2206206994597c13d831ec7": "USDT",
  "0x6b175474e89094c44da98b954eedeac495271d0f": "DAI",
  "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": "WBTC",
  "0x4fabb145d64652a948d72533023f6e7a623c7c53": "BUSD",
};

const BLOCKSCOUT = "https://eth.blockscout.com/api";
const BLOCKSCOUT_V2 = "https://eth.blockscout.com/api/v2";
const HEADERS = { "User-Agent": "Mozilla/5.0 weaver-pattern-check/2.0" };

// ── Helpers ────────────────────────────────────────────────────────────

function log(msg) {
  process.stderr.write(msg + "\n");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url, timeoutMs = 25000, maxTries = 4) {
  for (let attempt = 0; attempt < maxTries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
      clearTimeout(timer);
      if (res.status === 429) {
        const wait = 20000 * Math.pow(2, attempt);
        log(`    429; sleeping ${wait / 1000}s`);
        await sleep(wait);
        continue;
      }
      if (res.status >= 500) {
        await sleep(5000 * (attempt + 1));
        continue;
      }
      if (!res.ok) {
        log(`    HTTP ${res.status} on ${url.slice(0, 100)}`);
        return null;
      }
      return await res.json();
    } catch (e) {
      log(`    err: ${e && e.message}`);
      if (attempt < maxTries - 1) {
        await sleep(5000);
        continue;
      }
      return null;
    }
  }
  return null;
}

async function exactBlockAt(datestr) {
  const ts = Math.floor(new Date(datestr + "T00:00:00Z").getTime() / 1000);
  const d = await fetchJson(
    `${BLOCKSCOUT}?module=block&action=getblocknobytime&timestamp=${ts}&closest=before`
  );
  if (d && d.status === "1" && d.result && typeof d.result === "object") {
    const n = parseInt(d.result.blockNumber, 10);
    if (Number.isFinite(n)) return { block: n, exact: true };
  }
  return { block: null, exact: false };
}

async function* pagesOf(startUrl, maxPages = 50, sleepMs = 1000) {
  let url = startUrl;
  let page = 1;
  const failed = [];
  while (page <= maxPages) {
    const d = await fetchJson(url);
    if (d === null) {
      failed.push(page);
      break;
    }
    const items = Array.isArray(d.items) ? d.items : [];
    yield items;
    if (!d.next_page_params) break;
    const qs = Object.entries(d.next_page_params)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join("&");
    const sep = url.includes("?") ? "&" : "?";
    url = `${url}${sep}${qs}`;
    page += 1;
    await sleep(sleepMs);
  }
  if (failed.length) log(`    failed pages: [${failed.join(",")}]`);
}

async function classifyTx(txHash, wallet, tokenAddr) {
  const evidence = [];
  const detail = {
    txHash,
    router: null,
    quoteAsset: null,
    tokenAmount: null,
    quoteAmount: null,
  };

  const tx = await fetchJson(`${BLOCKSCOUT_V2}/transactions/${txHash}`);
  if (!tx) return { classification: "UNCLASSIFIED", evidence: ["parent transaction unavailable"], detail };

  const txTo = ((tx.to && tx.to.hash) || "").toLowerCase();
  const txFrom = ((tx.from && tx.from.hash) || "").toLowerCase();
  const wl = wallet.toLowerCase();
  if (txFrom !== wl) evidence.push("wallet is not tx originator");

  if (ROUTERS[txTo]) {
    detail.router = ROUTERS[txTo];
    evidence.push(`interacts with ${ROUTERS[txTo]}`);
  }

  const transfers = await fetchJson(`${BLOCKSCOUT_V2}/transactions/${txHash}/token-transfers`);
  if (transfers === null) {
    return { classification: "UNCLASSIFIED", evidence: ["token transfers unavailable for tx"], detail };
  }
  const items = Array.isArray(transfers.items) ? transfers.items : [];

  let tokenInflow = 0;
  let quoteOutflow = 0;
  const ta = tokenAddr.toLowerCase();

  for (const tr of items) {
    const toAddr = ((tr.to && tr.to.hash) || "").toLowerCase();
    const fromAddr = ((tr.from && tr.from.hash) || "").toLowerCase();
    const tokAddr = tr.token && tr.token.address ? String(tr.token.address).toLowerCase() : "";
    const total = tr.total || {};
    const dec = parseInt(total.decimals, 10) || 18;
    let amount = 0;
    try {
      amount = parseFloat(total.value) / Math.pow(10, dec);
    } catch (_) {
      continue;
    }
    if (!Number.isFinite(amount)) continue;

    if (tokAddr === ta && toAddr === wl) {
      tokenInflow += amount;
      evidence.push(`target token in +${amount.toFixed(0)}`);
    }
    if (QUOTES[tokAddr] && fromAddr === wl) {
      quoteOutflow += amount;
      detail.quoteAsset = QUOTES[tokAddr];
      evidence.push(`${QUOTES[tokAddr]} out -${amount.toFixed(6)}`);
    }
  }

  detail.tokenAmount = tokenInflow;
  detail.quoteAmount = quoteOutflow;

  const hasToken = tokenInflow > 0;
  const hasQuote = quoteOutflow > 0;
  const hasRouter = !!ROUTERS[txTo];

  if (hasToken && hasQuote && hasRouter)
    return { classification: "CONFIRMED_DEX_BUY", evidence, detail };
  if (hasToken && (hasQuote || hasRouter))
    return { classification: "LIKELY_DEX_BUY", evidence, detail };
  if (hasToken) return { classification: "TRANSFER_ONLY", evidence, detail };
  return { classification: "UNCLASSIFIED", evidence: evidence.length ? evidence : ["no target token in tx"], detail };
}

async function reVerifyWallet(wallet, tokenAddr, windowStart, windowEnd) {
  log(`  fetching ${wallet.slice(0, 10)}... transfers of target token`);
  const sb = await exactBlockAt(windowStart);
  const eb = await exactBlockAt(windowEnd);
  if (sb.block === null || eb.block === null) {
    log(`    block lookup failed; cannot proceed`);
    return { error: "block_lookup_failed", window_start: windowStart, window_end: windowEnd };
  }

  const url = `${BLOCKSCOUT_V2}/addresses/${wallet}/token-transfers?token=${tokenAddr}`;
  const tStart = new Date(windowStart + "T00:00:00Z").getTime() / 1000;
  const tEnd = new Date(windowEnd + "T00:00:00Z").getTime() / 1000 + 86400;
  const wl = wallet.toLowerCase();
  const ta = tokenAddr.toLowerCase();

  const transfersIn = [];
  for await (const pageItems of pagesOf(url, 20)) {
    for (const tr of pageItems) {
      const ts = tr.timestamp;
      if (!ts) continue;
      const t = new Date(ts).getTime() / 1000;
      if (!Number.isFinite(t)) continue;
      if (t < tStart || t > tEnd) continue;
      const tokAddr = tr.token && tr.token.address ? String(tr.token.address).toLowerCase() : "";
      if (tokAddr !== ta) continue;
      const toAddr = ((tr.to && tr.to.hash) || "").toLowerCase();
      if (toAddr !== wl) continue;
      transfersIn.push({
        txHash: tr.transaction_hash,
        timestamp: ts,
        amount_raw: tr.total && tr.total.value,
        decimals: (tr.total && tr.total.decimals) || 18,
      });
    }
  }

  log(`    ${transfersIn.length} target-token inflows in window`);

  const graded = [];
  for (const ti of transfersIn) {
    const dec = parseInt(ti.decimals, 10) || 18;
    const amt = parseFloat(ti.amount_raw || "0") / Math.pow(10, dec);
    const { classification, evidence, detail } = await classifyTx(ti.txHash, wallet, tokenAddr);
    graded.push({
      txHash: ti.txHash,
      timestamp: ti.timestamp,
      amount: Number.isFinite(amt) ? amt : 0,
      classification,
      evidence,
      detail,
    });
    log(`      ${classification}: ${ti.txHash.slice(0, 12)}... amt=${Number.isFinite(amt) ? amt.toFixed(0) : "?"}`);
    await sleep(300);
  }

  return {
    wallet,
    token: tokenAddr,
    window_start: windowStart,
    window_end: windowEnd,
    block_range: [sb.block, eb.block],
    blockRangeExact: sb.exact && eb.exact,
    transfers_in_window: transfersIn.length,
    graded,
  };
}

async function main() {
  log("=== Weaver pattern-check v2: evidence-graded PEPE re-verification ===\n");

  const results = [];
  for (const w of WALLETS) {
    log(`[${w.slice(0, 10)}...]`);
    const r = await reVerifyWallet(w, PEPE, WINDOW_START, PUMP_DAY);
    results.push(r);
    log("");
    await sleep(2000);
  }

  const summary = [];
  for (const r of results) {
    if (r.error) {
      summary.push({ wallet: r.wallet, status: "ERROR", reason: r.error });
      continue;
    }
    const byClass = {};
    for (const g of r.graded) {
      byClass[g.classification] = (byClass[g.classification] || 0) + 1;
    }
    const confirmed = byClass.CONFIRMED_DEX_BUY || 0;
    const likely = byClass.LIKELY_DEX_BUY || 0;
    const totalAmount = r.graded
      .filter((g) => g.classification === "CONFIRMED_DEX_BUY" || g.classification === "LIKELY_DEX_BUY")
      .reduce((s, g) => s + (g.amount || 0), 0);
    summary.push({
      wallet: r.wallet,
      blockRangeExact: r.blockRangeExact,
      transfers_in_window: r.transfers_in_window,
      classifications: byClass,
      confirmed_amount: totalAmount,
      verified_buyer: confirmed > 0,
      probable_buyer: confirmed + likely > 0,
    });
  }

  const verified = summary.filter((s) => s.verified_buyer).length;
  const output = {
    version: "gold-pattern-check-v2",
    ran_at: new Date().toISOString(),
    purpose:
      "Re-verify the 5 gold-standard wallets' PEPE entry as a market purchase, not a transfer-in heuristic.",
    target_token: { symbol: "PEPE", address: PEPE },
    window: { start: WINDOW_START, end: PUMP_DAY, pump_day: PUMP_DAY },
    wallets_summary: summary,
    details: results,
    verdict: `${verified} of ${WALLETS.length} wallets have at least one CONFIRMED_DEX_BUY.`,
    note: "Any wallet without a CONFIRMED_DEX_BUY may still be a skilled early entrant, but it entered via a path other than a direct DEX swap. Downgrade or re-examine.",
  };

  const outPath = path.join(process.cwd(), "gold-pattern-check-v2.json");
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  log(`\nWritten: ${outPath}`);
  console.log(JSON.stringify(output, null, 2));
}

main().catch((e) => {
  console.error("FATAL:", e && e.stack ? e.stack : e);
  process.exit(1);
});
