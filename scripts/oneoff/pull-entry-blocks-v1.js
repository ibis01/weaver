#!/usr/bin/env node
"use strict";
/**
 * For each treatment + control wallet, fetch PEPE inflows over the
 * window and record the first-inflow block. Output feeds Gate 0b
 * earlyEntryRate.
 */
const fs = require("node:fs");
const PEPE   = "0x6982508145454ce325ddbe47a25d4ec3d2311933";
const API_ES = "https://api.blockscout.com/1/api";
const KEY    = process.env.BLOCKSCOUT_API_KEY || "";
const START_BLOCK = 25710000, END_BLOCK = 25820000;
const SLEEP_MS = 1200;

function log(m){ process.stderr.write(m+"\n"); }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function lower(s){ return (s||"").toLowerCase(); }
function authUrl(u){ return KEY ? u + (u.includes("?")?"&":"?") + "apikey=" + encodeURIComponent(KEY) : u; }
async function fetchJson(u){
  const r = await fetch(authUrl(u), { headers:{accept:"application/json"} });
  if (!r.ok) { log("  HTTP "+r.status); return null; }
  return r.json();
}

async function firstInflow(addr){
  const url = `${API_ES}?module=account&action=tokentx`
    + `&address=${addr}&contractaddress=${PEPE}`
    + `&startblock=${START_BLOCK}&endblock=${END_BLOCK}`
    + `&sort=asc&page=1&offset=200`;
  const d = await fetchJson(url);
  if (!d || d.status !== "1") return null;
  const rows = d.result || [];
  const inflows = rows.filter(r => lower(r.to) === lower(addr));
  if (!inflows.length) return null;
  return {
    firstBlock: parseInt(inflows[0].blockNumber, 10),
    firstTimestamp: parseInt(inflows[0].timeStamp, 10),
    inflowCount: inflows.length,
  };
}

async function main(){
  if (!KEY) { log("BLOCKSCOUT_API_KEY not set"); process.exit(1); }
  const buyers   = JSON.parse(fs.readFileSync("data/pepe-buyer-list/v1.json","utf8")).buyers;
  const controls = JSON.parse(fs.readFileSync("data/control-candidates/v2.json","utf8")).candidates;

  const out = {
    version: "entry-blocks-v1",
    created: new Date().toISOString(),
    window: { startBlock: START_BLOCK, endBlock: END_BLOCK },
    treatments: [],
    controls: [],
  };

  const all = [
    ...buyers.map(b => ({ addr: b.address, pop: "treatment", inCount: b.inCount })),
    ...controls.map(c => ({ addr: c.address, pop: "control", inCount: c.inCount })),
  ];
  log("pulling " + all.length + " addresses");

  for (let i=0; i<all.length; i++){
    const { addr, pop, inCount } = all[i];
    log(`[${i+1}/${all.length}] ${pop} ${addr.slice(0,10)} inCount=${inCount}`);
    const rec = await firstInflow(addr);
    if (!rec) { log("  no inflow found"); await sleep(SLEEP_MS); continue; }
    const row = { address: addr, inCount, ...rec };
    (pop === "treatment" ? out.treatments : out.controls).push(row);
    log("  firstBlock=" + rec.firstBlock + "  inflows=" + rec.inflowCount);
    await sleep(SLEEP_MS);
  }

  fs.mkdirSync("data/entry-blocks", { recursive: true });
  fs.writeFileSync("data/entry-blocks/v1.json", JSON.stringify(out, null, 2));
  log("wrote data/entry-blocks/v1.json");
}
main().catch(e => { console.error(e.stack||e); process.exit(1); });
