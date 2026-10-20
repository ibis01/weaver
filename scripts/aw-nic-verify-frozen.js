#!/usr/bin/env node
// ============================================================
// Gate 0c — INDEPENDENT verification of the frozen P4 NIC artifact
// (gate-0c-nic-2026-10-20.json, verdict P4 FAIL).
//
// Reimplements every recorded assertion from the sidecar's own
// recorded conventions (prereg §5/§7/§8.2/§9.1 + sidecar
// `conventions`), as a fresh implementation — NOT reusing
// scripts/aw-nic-p4.js code paths (inverse CDF via linear scan,
// RNG re-derived from the canonical xorshift128+ spec, G1 pooled
// counts accumulated as integers).
//
// READ-ONLY: writes nothing. Exit 0 = every assertion reproduces.
// Exit 1 = at least one mismatch (all listed).
// ============================================================
'use strict';
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

// ROOT: CLI arg wins; else auto-detect layout — (a) assistant-workspace
// layout (this script lives in <ws>/scripts next to a weaver-review clone)
// or (b) in-repo layout (this script lives in <repo>/scripts of the clone).
function defaultRoot() {
  const probe = 'docs/experiments/gate-0c-skill-test-preregistration-v1.md';
  const ws = path.resolve(__dirname, '..', 'weaver-review');
  if (fs.existsSync(path.join(ws, probe))) return ws;
  return path.resolve(__dirname, '..');
}
const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : defaultRoot();
const NIC = ROOT + '/docs/experiments/gate-0c-nic-2026-10-20.json';
if (!fs.existsSync(NIC)) {
  console.error('FATAL: gate-0c-nic-2026-10-20.json not found under ROOT=' + ROOT +
    '\n       run from the repo, or pass the repo root: node aw-nic-verify-frozen.js ~/Desktop/weaver');
  process.exit(1);
}
console.log('verifying under ROOT:', ROOT);
const A = JSON.parse(fs.readFileSync(NIC, 'utf8'));

let nOK = 0, nDIFF = 0; const diffs = [];
function chk(name, ok, detail) {
  if (ok) { nOK++; } else { nDIFF++; diffs.push(name + ' :: ' + detail); }
}
function eq(name, got, want) {
  chk(name, JSON.stringify(got) === JSON.stringify(want),
    'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want));
}
function eqNum(name, got, want, dp) {
  const g = +got.toFixed(dp), w = +want.toFixed(dp);
  chk(name, g === w, 'got ' + g + ' want ' + w + ' (raw ' + got + ' vs ' + want + ')');
}

// ---------- 1. input anchors ----------
const sha256 = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const pricePath = ROOT + '/data/prices/pepe-usd-daily-365d.json';
const ebPath = ROOT + '/data/entry-blocks/v1.json';
const v5Path = ROOT + '/data/audit-records/pepe-buyer-audit-v5.jsonl';
const v2Path = ROOT + '/data/pepe-buyer-list/v2.json';
const priceSha = sha256(pricePath), ebSha = sha256(ebPath), v5Sha = sha256(v5Path);
eq('anchor: price series sha256', priceSha, A.inputs.priceTyped.sha256);
eq('anchor: entry-blocks sha256', ebSha, A.inputs.entryBlocksV1.sha256);
eq('anchor: v5 jsonl sha256', v5Sha, A.inputs.v5jsonl.sha256);
// git blob sha1 = sha1("blob <size>\0" + content)
const v2buf = fs.readFileSync(v2Path);
const v2blob = crypto.createHash('sha1')
  .update(Buffer.concat([Buffer.from('blob ' + v2buf.length + '\0'), v2buf])).digest('hex');
eq('anchor: v2.json git blob', v2blob, A.inputs.v2json.gitBlob);

// ---------- 2. population recount ----------
const eb = JSON.parse(fs.readFileSync(ebPath, 'utf8'));
const ANCH = eb.treatments.filter(e => e.firstBlock && e.firstTimestamp)
  .map(e => ({ b: e.firstBlock, t: e.firstTimestamp })).sort((a, b) => a.b - b.b);

// piecewise-linear block→time; edges extrapolated from the first/last two anchors
function blockToDate(b) {
  const L = ANCH.length - 1;
  if (b <= ANCH[0].b) {
    const r = (ANCH[1].b - ANCH[0].b) / (ANCH[1].t - ANCH[0].t);
    return new Date((ANCH[0].t + (b - ANCH[0].b) / r) * 1000);
  }
  if (b >= ANCH[L].b) {
    const r = (ANCH[L].b - ANCH[L - 1].b) / (ANCH[L].t - ANCH[L - 1].t);
    return new Date((ANCH[L].t + (b - ANCH[L].b) / r) * 1000);
  }
  let lo = 0, hi = L;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ANCH[mid].b <= b) lo = mid; else hi = mid; }
  const p = ANCH[lo], q = ANCH[hi];
  return new Date((p.t + (b - p.b) * (q.t - p.t) / (q.b - p.b)) * 1000);
}

const dayStr = t => new Date(t).toISOString().slice(0, 10);
const addDays = (d, n) => dayStr(Date.parse(d + 'T00:00:00Z') + n * 86400000);
const D_DET = A.inputs.dDet, A_LEN = A.inputs.windowDays;
const A_DAYS = Array.from({ length: A_LEN }, (_, i) => addDays(D_DET, i));
const A_SET = new Set(A_DAYS);

const WLO = 25710000, WHI = 25820000;                       // window blocks (prereg §5)
const OK_CLASS = new Set(['DIRECT_ORIGINATOR', 'TRACED_ECONOMIC_RECIPIENT']);
const txs = [];
for (const l of fs.readFileSync(v5Path, 'utf8').trim().split('\n')) {
  const r = JSON.parse(l);
  if (r.classification !== 'BUYER') continue;
  for (const a of (r.acquisitions || [])) {
    if (!OK_CLASS.has(a.classification)) continue;
    if (a.blockNumber < WLO || a.blockNumber > WHI) continue;
    const t = blockToDate(a.blockNumber), iso = t.toISOString();
    const mid = Date.parse(iso.slice(0, 10) + 'T00:00:00Z');
    txs.push({ address: r.candidate_address, block: a.blockNumber, day: iso.slice(0, 10), isoTime: iso,
      minFromMidnight: Math.round(Math.min(t.getTime() - mid, mid + 86400000 - t.getTime()) / 60000) });
  }
}
const kBy = new Map();
for (const t of txs) kBy.set(t.address, (kBy.get(t.address) || 0) + 1);

eq('population: tx total', txs.length, A.population.txTotal);
eq('population: eligible wallets', kBy.size, A.population.eligibleWallets);
eq('population: per-wallet k_w map', Object.fromEntries([...kBy.entries()].sort()),
  Object.fromEntries(A.population.perWalletKw.map(x => [x.address, x.k])));

const v2 = JSON.parse(fs.readFileSync(v2Path, 'utf8'));
const v2conf = new Map(v2.buyers.map(b => [b.address, b.confirmed]));
let mism = 0; for (const [a, k] of kBy) if (v2conf.get(a) !== k) mism++;
eq('population: k_w vs v2.confirmed mismatches', mism, A.population.perWalletMismatchVsV2);
eq('population: v2 wallets absent from recount',
  [...v2conf.keys()].filter(a => !kBy.has(a) && v2conf.get(a) > 0).length,
  A.population.v2WalletsAbsentFromRecount);

const dm = {};
for (const t of txs) dm[t.day] = (dm[t.day] || 0) + 1;
const dmCmp = o => JSON.stringify(Object.entries(o).sort((a, b) => a[0] < b[0] ? -1 : 1));
chk('population: day mass (7 entries, values equal, order-insensitive)',
  Object.keys(dm).length === Object.keys(A.population.dayMass).length &&
    dmCmp(dm) === dmCmp(A.population.dayMass), 'got ' + dmCmp(dm) + ' want ' + dmCmp(A.population.dayMass));
eq('population: all tx days within A_w', Object.keys(dm).every(d => A_SET.has(d)), true);

// P2c checks
eq('p2c: window edges', [dayStr(blockToDate(WLO)), dayStr(blockToDate(WHI))],
  A.p2cChecks.windowEdgesExtrapolated);
eq('p2c: anchors on d_det..d_det+15',
  ANCH.filter(a => A_SET.has(dayStr(new Date(a.t * 1000)))).length + '/' + ANCH.length,
  A.p2cChecks.anchorsOnDetWindow);
const mb = txs.filter(t => Math.abs(t.minFromMidnight) <= 30)
  .map(t => ({ block: t.block, day: t.day, isoTime: t.isoTime, minFromMidnight: t.minFromMidnight }));
eq('p2c: midnight-boundary tx set', mb, A.p2cChecks.midnightBoundaryTx);

// ---------- 3. price series ----------
const typed = JSON.parse(fs.readFileSync(pricePath, 'utf8'));
const pts = typed.points || typed.prices || typed.data || typed;
const last = new Map();                                     // UTC day -> last close of that day
for (const p of Array.isArray(pts) ? pts : []) {
  const t = p.timestamp ?? p.t ?? p.time ?? p[0];
  if (typeof t !== 'number') continue;
  const c = p.close ?? p.price ?? p.c ?? p[1];
  if (!Number.isFinite(c)) continue;
  const ts = t > 1e12 ? t : t * 1000;
  last.set(new Date(ts).toISOString().slice(0, 10), c);     // later ts overwrites (§6.1)
}
const dates = [...last.keys()].sort();
const close = dates.map(d => last.get(d));
for (let i = 1; i < dates.length; i++)
  if (Date.parse(dates[i]) - Date.parse(dates[i - 1]) !== 86400000) { chk('price: contiguity', false, 'gap at ' + dates[i]); }
eq('price: row count', dates.length, A.inputs.priceTyped.rows);
eq('price: span', [dates[0], dates[dates.length - 1]], A.inputs.priceTyped.span);
const idx = new Map(dates.map((d, i) => [d, i]));
const ret = dates.map((d, i) => (i === 0 ? NaN : close[i] / close[i - 1] - 1));
const retAt = d => ret[idx.get(d)];
eq('price: 0 unpriceable acquisitions', txs.filter(t => !idx.has(t.day)).length, A.population.unpriceable);

// type-7 percentile (recorded convention)
function type7(sorted, p) {
  const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

// ---------- 4. G1 (P90 trailing-90d, excl + incl) ----------
function g1Pool(b, mode) {
  let up = 0, tot = 0; const perDay = [];
  for (const d of Object.keys(dm).sort()) {
    const m = dm[d];
    const s = addDays(d, -(mode === 'excl' ? b : b - 1));    // band start
    const si = idx.get(s);
    if (si === undefined || si - 90 < 0) { chk('g1: series depth', false, b + 'd ' + d); return null; }
    const trail = [];
    for (let i = si - 90; i < si; i++) trail.push(ret[i]);
    const thr = type7(trail.sort((a, b) => a - b), 0.90);
    let u = 0;
    for (let j = 0; j < b; j++) if (retAt(addDays(s, j)) >= thr) u++;
    up += m * u; tot += m * b;
    perDay.push({ acqDay: d, occurrences: m, bandStart: s, bandEnd: addDays(s, b - 1),
      thresholdP90: +thr.toFixed(6), up: u, b, fracUp: +(u / b).toFixed(4) });
  }
  return { frac: up / tot, perDay };
}
for (const b of [3, 7, 14]) {
  const key = b + 'd';
  for (const mode of ['excl', 'incl']) {
    const mine = g1Pool(b, mode), stored = A.g1[key][mode];
    eqNum('g1: ' + key + ' ' + mode + ' pooled frac_up', mine.frac, stored.pooledFracUp, 4);
    const okRows = mine.perDay.length === stored.perAcqDay.length &&
      mine.perDay.every((r, i) => JSON.stringify(r) === JSON.stringify(stored.perAcqDay[i]));
    chk('g1: ' + key + ' ' + mode + ' per-day rows (' + mine.perDay.length + ')', okRows,
      'first diff: ' + JSON.stringify(mine.perDay.find((r, i) =>
        !stored.perAcqDay[i] || JSON.stringify(r) !== JSON.stringify(stored.perAcqDay[i])) || 'none'));
  }
}

// ---------- 5. G2 (per-wallet null IQR, §8.2 weights, provisional seeds) ----------
const EPS = 0.25, B_W = A.conventions.seeds.draws;
function rngFromSeed(seedHex) {                            // canonical xorshift128+
  const b = Buffer.from(seedHex, 'hex');
  let s0 = 0n, s1 = 0n;
  for (let i = 0; i < 8; i++) s0 = s0 * 256n + BigInt(b[i]);
  for (let i = 8; i < 16; i++) s1 = s1 * 256n + BigInt(b[i]);
  const M = (1n << 64n) - 1n;
  return () => {
    let x = s0; const y = s1; s0 = y;
    x ^= (x << 23n) & M; x ^= x >> 17n; x ^= y ^ (y >> 26n); s1 = x & M;
    return Number((x + y) & 0xFFFFFFFFn);                  // low word of (new s1 + new s0)
  };
}
const seedFor = a => crypto.createHash('sha256')
  .update('gate0c:nic:' + a + ':' + priceSha + ':' + v2blob).digest('hex').slice(0, 32);
const Nd = new Map(A_DAYS.map(d => [d, dm[d] || 0]));
const ownBy = new Map();
for (const t of txs) {
  if (!ownBy.has(t.address)) ownBy.set(t.address, new Map());
  const o = ownBy.get(t.address);
  o.set(t.day, (o.get(t.day) || 0) + 1);
}
const myG2 = [];
for (const [addr, k] of [...kBy.entries()].sort()) {
  const own = ownBy.get(addr);
  const w = A_DAYS.map(d => Math.max((Nd.get(d) || 0) - (own.get(d) || 0), 0) + EPS);
  const s1 = w.reduce((a, b) => a + b, 0), s2 = w.reduce((a, b) => a + b * b, 0);
  const ess = (s1 * s1) / s2;
  const cum = []; let acc = 0;
  for (const x of w) { acc += x; cum.push(acc); }
  const rng = rngFromSeed(seedFor(addr));
  const draws = new Float64Array(B_W);
  for (let r = 0; r < B_W; r++) {
    let e = 0;
    for (let j = 0; j < k; j++) {
      const target = (rng() / 4294967296) * acc;
      let i = 0; while (cum[i] < target) i++;              // linear scan == binary-search result
      e += i / (A_LEN - 1);
    }
    draws[r] = e / k;
  }
  const srt = Float64Array.from(draws).sort();
  myG2.push({ address: addr, k, ess, iqr: type7(srt, 0.75) - type7(srt, 0.25) });
}
let minIQR = Infinity;
for (const m of myG2) {
  const st = A.g2.perWallet.find(x => x.address === m.address);
  if (!st) { chk('g2: wallet ' + m.address + ' present in artifact', false, 'missing'); continue; }
  eqNum('g2: ' + m.address.slice(0, 10) + ' k=' + m.k + ' nullIQR', m.iqr, st.nullIQR, 4);
  eqNum('g2: ' + m.address.slice(0, 10) + ' ESS', m.ess, st.ess, 2);
  eq('g2: ' + m.address.slice(0, 10) + ' fallback flag', m.ess < 5, st.fallbackFired);
  if (m.iqr < minIQR) minIQR = m.iqr;
}
const iqrAll = myG2.map(x => x.iqr).sort((a, b) => a - b);
eqNum('g2: min IQR', minIQR, A.g2.min, 4);
eqNum('g2: median IQR', type7(iqrAll, 0.5), A.g2.median, 4);
eqNum('g2: max IQR', iqrAll[iqrAll.length - 1], A.g2.max, 4);
eqNum('population: essMin', Math.min(...myG2.map(x => x.ess)), A.population.essMin, 2);
eqNum('population: essMax', Math.max(...myG2.map(x => x.ess)), A.population.essMax, 2);
eq('population: fallback fired', myG2.filter(x => x.ess < 5).length, A.population.optionAFallbackFired);

// ---------- 6. horizons + verdict ----------
const lastAcq = Object.keys(dm).sort().pop();
const frontier = dates[dates.length - 1];
for (const h of [7, 30]) {
  const need = addDays(lastAcq, h);
  eq('horizon: ' + h + 'd needBy', need, A.horizonCoverage[h].needBy);
  eq('horizon: ' + h + 'd covered', Date.parse(need) <= Date.parse(frontier), A.horizonCoverage[h].covered);
}
const passExcl = [3, 7, 14].filter(b => { const g = g1Pool(b, 'excl'); return g && g.frac >= 0.20 && g.frac <= 0.80; });
const g2pass = minIQR >= 0.10;
const myVerdict = (passExcl.length > 0 && g2pass && kBy.size >= 15) ? 'P4 PASS' : 'P4 FAIL';
eq('verdict', myVerdict, A.verdict);
eq('passing pairs', passExcl.flatMap(b => [7, 30].filter(h =>
  Date.parse(addDays(lastAcq, h)) <= Date.parse(frontier)).map(h => b + 'd/' + h + 'd')), A.passingPairs);

// ---------- report ----------
console.log('='.repeat(64));
console.log('Gate 0c — independent verification of frozen P4 NIC artifact');
console.log('='.repeat(64));
console.log('checks passed:', nOK, '| checks DIFF:', nDIFF);
if (nDIFF) { console.log('\nMISMATCHES:'); for (const d of diffs) console.log('  ✗ ' + d); }
else console.log('\nALL ASSERTIONS REPRODUCE from the frozen inputs under the recorded conventions.');
console.log('\nfrozen artifact verdict:', A.verdict, '| passing pairs:', JSON.stringify(A.passingPairs),
  '| g2.min:', A.g2.min, '| g1 pooled frac_up 3d/7d/14d excl:',
  A.g1['3d'].excl.pooledFracUp, A.g1['7d'].excl.pooledFracUp, A.g1['14d'].excl.pooledFracUp);
process.exit(nDIFF ? 1 : 0);
