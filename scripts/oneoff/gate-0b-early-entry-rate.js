#!/usr/bin/env node
"use strict";
/**
 * Gate 0b: earlyEntryRate on 24 matched treatment/control pairs.
 * Local computation only — reads data/entry-blocks/v1.json.
 */
const fs = require("node:fs");

const ENTRY   = JSON.parse(fs.readFileSync("data/entry-blocks/v1.json","utf8"));
const START   = ENTRY.window.startBlock;
const END     = ENTRY.window.endBlock;
const SPAN    = END - START;
const THRESH  = START + Math.floor(SPAN * 0.25);   // first 25% of window

function positionOf(block) { return (block - START) / SPAN; }
function isEarly(block)    { return block <= THRESH; }

// Build maps
const t = new Map(ENTRY.treatments.map(r => [r.address.toLowerCase(), r]));
const c = new Map(ENTRY.controls.map(r => [r.address.toLowerCase(), r]));

// Match: for each treatment, one control with same inCount.
// Rule: when multiple controls share an inCount, pick by sorted address
// (deterministic, not by net).
const byCount = new Map();
for (const r of ENTRY.controls) {
  if (!byCount.has(r.inCount)) byCount.set(r.inCount, []);
  byCount.get(r.inCount).push(r);
}
for (const arr of byCount.values()) arr.sort((a,b)=>a.address.localeCompare(b.address));

const used = new Set();
const pairs = [];
for (const tRow of ENTRY.treatments) {
  if (tRow.inCount >= 16) continue;   // outliers, excluded per design v2
  const pool = (byCount.get(tRow.inCount) || []).filter(x => !used.has(x.address));
  if (!pool.length) continue;
  const ctl = pool[0];
  used.add(ctl.address);
  pairs.push({ treatment: tRow, control: ctl });
}

console.log("threshold block: " + THRESH + "  (" + (100*0.25) + "% through window)");
console.log("pairs: " + pairs.length);
console.log();

let tEarly=0, cEarly=0;
const rows = [];
for (const { treatment: tr, control: cr } of pairs) {
  const te = isEarly(tr.firstBlock);
  const ce = isEarly(cr.firstBlock);
  if (te) tEarly++;
  if (ce) cEarly++;
  rows.push({ inCount: tr.inCount, treatment: tr.address.slice(0,10), tPos: positionOf(tr.firstBlock).toFixed(3), tEarly: te,
              control: cr.address.slice(0,10), cPos: positionOf(cr.firstBlock).toFixed(3), cEarly: ce });
}

console.log("inCnt  treatment      tPos   early    control        cPos   early");
for (const r of rows) {
  console.log(`  ${r.inCount}    ${r.treatment}  ${r.tPos}  ${r.tEarly?"Y":"n"}      ${r.control}  ${r.cPos}  ${r.cEarly?"Y":"n"}`);
}

const tRate = tEarly / pairs.length;
const cRate = cEarly / pairs.length;
console.log();
console.log("earlyEntryRate treatment: " + tRate.toFixed(4));
console.log("earlyEntryRate control  : " + cRate.toFixed(4));
console.log("difference              : " + (tRate - cRate).toFixed(4));

// Wilcoxon signed-rank on paired binary differences (McNemar exact)
let nPos=0, nNeg=0;
for (const r of rows) {
  if (r.tEarly && !r.cEarly) nPos++;
  if (!r.tEarly && r.cEarly) nNeg++;
}
const n = nPos + nNeg;
if (n === 0) {
  console.log("discordant pairs: 0 — no testable difference");
} else {
  // exact two-sided McNemar via binomial
  function choose(n,k){ let r=1n; for (let i=0n;i<BigInt(k);i++) r = r*BigInt(n-i)/BigInt(i+1n); return r; }
  const N = BigInt(n);
  const kLo = BigInt(Math.min(nPos, nNeg));
  let tail = 0n;
  for (let k=0n; k<=kLo; k++) tail += choose(N, k);
  const oneSided = Number(tail) / Math.pow(2, n);
  const pVal = Math.min(2 * oneSided, 1);
  console.log(`McNemar discordant: +${nPos} -${nNeg}  n=${n}  two-sided p≈${pVal.toFixed(4)}`);
}
