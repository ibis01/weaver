#!/usr/bin/env node
// ============================================================
// Gate 0c — INDEPENDENT verification of the AMENDED v1.1 P4 NIC artifact
// (gate-0c-nic-2026-10-21-v1.1.json).
//
// Amendment record §5-5: independent reimplementation of the
// generalized-inverse marginal IQR for ALL 49 wallets; assertion that
// D1 == frozen G1 and legacy table == frozen artifact table; no writes.
//
// Independence: G2-P is recomputed in EXACT INTEGER ARITHMETIC — weights
// scaled by 4 (w4 = 4*max(N(-w)(d),0) + 1 are integers), CDF comparisons
// 4*cum4 >= p*4*total4 carried out on integers, quantiles are grid indices.
// No floats enter the G2-P recompute. The RNG for the legacy column is
// re-derived from the canonical xorshift128+ spec with a linear-scan
// inverse CDF (structurally different from the producer's binary search).
//
// READ-ONLY: writes nothing. Exit 0 = every assertion reproduces.
// Exit 1 = at least one mismatch (all listed).
// ============================================================
'use strict';
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

function defaultRoot() {
  const probe = 'docs/experiments/gate-0c-skill-test-preregistration-v1.md';
  const ws = path.resolve(__dirname, '..', 'weaver-review');
  if (fs.existsSync(path.join(ws, probe))) return ws;
  return path.resolve(__dirname, '..');
}
const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : defaultRoot();
const NIC11 = ROOT + '/docs/experiments/gate-0c-nic-2026-10-21-v1.1.json';
if (!fs.existsSync(NIC11)) {
  console.error('FATAL: gate-0c-nic-2026-10-21-v1.1.json not found under ROOT=' + ROOT +
    '\n       run scripts/aw-nic-p4-v11.js first, or pass the repo root: node aw-nic-verify-v11.js ~/Desktop/weaver');
  process.exit(1);
}
console.log('verifying under ROOT:', ROOT);
const A = JSON.parse(fs.readFileSync(NIC11, 'utf8'));

let nOK = 0, nDIFF = 0; const diffs = [];
function chk(name, ok, detail) {
  if (ok) { nOK++; } else { nDIFF++; diffs.push(name + ' :: ' + detail); }
}
function eq(name, got, want) {
  chk(name, JSON.stringify(got) === JSON.stringify(want),
    'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want));
}
function eqNum(name, got, want, dp) {
  const g = +(+got).toFixed(dp), w = +(+want).toFixed(dp);
  chk(name, g === w, 'got ' + g + ' want ' + w + ' (raw ' + got + ' vs ' + want + ')');
}

// ---------- 0. amendment chain + frozen pair integrity ----------
const sha256 = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
eq('chain: amended prereg sha256', sha256(ROOT + '/docs/experiments/gate-0c-skill-test-preregistration-v1.md'),
  A.amendment && '36201d78c588b9523c5ece3e38cd22ddb5da18ad969379da891c7e2247db7fc7');
eq('chain: amendment record sha256', sha256(ROOT + '/docs/experiments/gate-0c-amendment-v1.1-draft-2026-10-21.md'), A.amendment.record.sha256);
eq('chain: amendment patch sha256', sha256(ROOT + '/docs/experiments/gate-0c-amendment-v1.1-draft-2026-10-21.patch'), A.amendment.patch.sha256);
eq('chain: baseline prereg sha recorded', A.amendment.baselinePreregSha256, '85468ac76b37c20b0db53581abc0ae395e93dd1730f19d43a05ed9051a04b6f1');
eq('frozen pair: json intact', sha256(ROOT + '/docs/experiments/gate-0c-nic-2026-10-20.json'), A.frozenPairReferenced.json.sha256);
eq('frozen pair: md intact', sha256(ROOT + '/docs/experiments/gate-0c-nic-2026-10-20.md'), A.frozenPairReferenced.md.sha256);
const FROZEN = JSON.parse(fs.readFileSync(ROOT + '/docs/experiments/gate-0c-nic-2026-10-20.json', 'utf8'));

// ---------- 1. input anchors ----------
const pricePath = ROOT + '/data/prices/pepe-usd-daily-365d.json';
const ebPath = ROOT + '/data/entry-blocks/v1.json';
const v5Path = ROOT + '/data/audit-records/pepe-buyer-audit-v5.jsonl';
const v2Path = ROOT + '/data/pepe-buyer-list/v2.json';
const priceSha = sha256(pricePath), ebSha = sha256(ebPath), v5Sha = sha256(v5Path);
eq('anchor: price series sha256', priceSha, A.inputs.priceTyped.sha256);
eq('anchor: entry-blocks sha256', ebSha, A.inputs.entryBlocksV1.sha256);
eq('anchor: v5 jsonl sha256', v5Sha, A.inputs.v5jsonl.sha256);
const v2buf = fs.readFileSync(v2Path);
const v2blob = crypto.createHash('sha1')
  .update(Buffer.concat([Buffer.from('blob ' + v2buf.length + '\0'), v2buf])).digest('hex');
eq('anchor: v2.json git blob', v2blob, A.inputs.v2json.gitBlob);

// ---------- 2. population recount ----------
const eb = JSON.parse(fs.readFileSync(ebPath, 'utf8'));
const ANCH = eb.treatments.filter(e => e.firstBlock && e.firstTimestamp)
  .map(e => ({ b: e.firstBlock, t: e.firstTimestamp })).sort((a, b) => a.b - b.b);
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
const WLO = 25710000, WHI = 25820000;
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
const v2 = JSON.parse(v2buf.toString('utf8'));
const v2conf = new Map(v2.buyers.map(b => [b.address, b.confirmed]));
let mism = 0; for (const [a, k] of kBy) if (v2conf.get(a) !== k) mism++;
eq('population: k_w vs v2.confirmed mismatches', mism, A.population.perWalletMismatchVsV2);
eq('population: v2 wallets absent from recount',
  [...v2conf.keys()].filter(a => !kBy.has(a) && v2conf.get(a) > 0).length,
  A.population.v2WalletsAbsentFromRecount);
const dm = {};
for (const t of txs) dm[t.day] = (dm[t.day] || 0) + 1;
const dmCmp = o => JSON.stringify(Object.entries(o).sort((a, b) => a[0] < b[0] ? -1 : 1));
chk('population: day mass', Object.keys(dm).length === Object.keys(A.population.dayMass).length &&
  dmCmp(dm) === dmCmp(A.population.dayMass), 'got ' + dmCmp(dm) + ' want ' + dmCmp(A.population.dayMass));
eq('population: all tx days within A_w', Object.keys(dm).every(d => A_SET.has(d)), true);
eq('p2c: window edges', [dayStr(blockToDate(WLO)), dayStr(blockToDate(WHI))], A.p2cChecks.windowEdgesExtrapolated);
eq('p2c: anchors on d_det..d_det+15',
  ANCH.filter(a => A_SET.has(dayStr(new Date(a.t * 1000)))).length + '/' + ANCH.length,
  A.p2cChecks.anchorsOnDetWindow);
const mb = txs.filter(t => Math.abs(t.minFromMidnight) <= 30)
  .map(t => ({ block: t.block, day: t.day, isoTime: t.isoTime, minFromMidnight: t.minFromMidnight }));
eq('p2c: midnight-boundary tx set', mb, A.p2cChecks.midnightBoundaryTx);

// ---------- 3. price series ----------
const typed = JSON.parse(fs.readFileSync(pricePath, 'utf8'));
const pts = typed.points || typed.prices || typed.data || typed;
const last = new Map();
for (const p of Array.isArray(pts) ? pts : []) {
  const t = p.timestamp ?? p.t ?? p.time ?? p[0];
  if (typeof t !== 'number') continue;
  const c = p.close ?? p.price ?? p.c ?? p[1];
  if (!Number.isFinite(c)) continue;
  const ts = t > 1e12 ? t : t * 1000;
  last.set(new Date(ts).toISOString().slice(0, 10), c);
}
const dates = [...last.keys()].sort();
const close = dates.map(d => last.get(d));
for (let i = 1; i < dates.length; i++)
  if (Date.parse(dates[i]) - Date.parse(dates[i - 1]) !== 86400000) chk('price: contiguity', false, 'gap at ' + dates[i]);
eq('price: row count', dates.length, A.inputs.priceTyped.rows);
eq('price: span', [dates[0], dates[dates.length - 1]], A.inputs.priceTyped.span);
const idx = new Map(dates.map((d, i) => [d, i]));
const ret = dates.map((d, i) => (i === 0 ? NaN : close[i] / close[i - 1] - 1));
const retAt = d => ret[idx.get(d)];
eq('price: 0 unpriceable acquisitions', txs.filter(t => !idx.has(t.day)).length, A.population.unpriceable);
function type7(sorted, p) {
  const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

// ---------- 4. D1 (recomputed; must equal v1.1 artifact AND frozen G1) ----------
function g1Pool(b, mode) {
  let up = 0, tot = 0; const perDay = [];
  for (const d of Object.keys(dm).sort()) {
    const m = dm[d];
    const s = addDays(d, -(mode === 'excl' ? b : b - 1));
    const si = idx.get(s);
    if (si === undefined || si - 90 < 0) { chk('d1: series depth', false, b + 'd ' + d); return null; }
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
    const mine = g1Pool(b, mode), st = A.g1_descriptive.bands[key][mode], fr = FROZEN.g1[key][mode];
    eqNum('d1: ' + key + ' ' + mode + ' pooled frac_up (recomputed == artifact)', mine.frac, st.pooledFracUp, 4);
    eq('d1: ' + key + ' ' + mode + ' pooled frac_up (artifact == frozen G1)', st.pooledFracUp, fr.pooledFracUp);
    const okRows = mine.perDay.length === st.perAcqDay.length &&
      mine.perDay.every((r, i) => JSON.stringify(r) === JSON.stringify(st.perAcqDay[i]));
    chk('d1: ' + key + ' ' + mode + ' per-day rows (' + mine.perDay.length + ')', okRows,
      'first diff: ' + JSON.stringify(mine.perDay.find((r, i) =>
        !st.perAcqDay[i] || JSON.stringify(r) !== JSON.stringify(st.perAcqDay[i])) || 'none'));
    eq('d1: ' + key + ' ' + mode + ' per-day rows (artifact == frozen G1)', st.perAcqDay, fr.perAcqDay);
  }
}
eq('d1: kill-switch removed', A.g1_descriptive.killSwitchRemoved, true);
eq('d1: feeds no decision', A.g1_descriptive.feedsDecision, false);

// ---------- 5. G2-P (EXACT INTEGER reimplementation, all 49 wallets) ----------
// w4(d) = 4*max(N(-w)(d),0) + 1  (integer; equals 4*(crowd + 0.25))
// P(D = grid i) = w4(i)/total4 ; Q(p) = min{ i : cum4(i)/total4 >= p }
//   <=> integer test  4*cum4 >= p*4*total4   (p in {0.25, 0.75})
// IQR_w = (i75 - i25)/(A_LEN - 1)  — exact rational
const Nd = new Map(A_DAYS.map(d => [d, dm[d] || 0]));
const ownBy = new Map();
for (const t of txs) {
  if (!ownBy.has(t.address)) ownBy.set(t.address, new Map());
  const o = ownBy.get(t.address);
  o.set(t.day, (o.get(t.day) || 0) + 1);
}
const myG2P = [];
for (const [addr, k] of [...kBy.entries()].sort()) {
  const own = ownBy.get(addr);
  const w4 = A_DAYS.map(d => 4 * Math.max((Nd.get(d) || 0) - (own.get(d) || 0), 0) + 1);
  const S1 = w4.reduce((a, b) => a + b, 0), S2 = w4.reduce((a, b) => a + b * b, 0);
  const ess = (S1 * S1) / S2;                       // == (Σq)²/Σq², exact rational
  let ww = w4, fallbackFired = false;
  if (ess < 5) { ww = A_DAYS.map(() => 1); fallbackFired = true; }   // §8.2 Option A
  const total4 = ww.reduce((a, b) => a + b, 0);
  const cum4 = []; let acc = 0;
  for (const x of ww) { acc += x; cum4.push(acc); }
  const qInv = p => {
    const lim = p * 4 * total4;                     // integer threshold
    let i = 0; while (i < cum4.length && 4 * cum4[i] < lim) i++;
    return Math.min(i, A_LEN - 1);
  };
  const i25 = qInv(0.25), i75 = qInv(0.75);
  myG2P.push({ address: addr, k, ess, fallbackFired, iqr: (i75 - i25) / (A_LEN - 1) });
}
let minIQRw = Infinity, fbCount = 0;
for (const m of myG2P) {
  const st = A.g2p.perWallet.find(x => x.address === m.address);
  if (!st) { chk('g2p: wallet ' + m.address + ' present', false, 'missing'); continue; }
  eqNum('g2p: ' + m.address.slice(0, 10) + ' k=' + m.k + ' marginal IQR_w (integer == artifact)', m.iqr, st.iqrMarginal, 10);
  eqNum('g2p: ' + m.address.slice(0, 10) + ' ESS_w', m.ess, st.ess, 2);
  eq('g2p: ' + m.address.slice(0, 10) + ' fallback flag', m.fallbackFired, st.fallbackFired);
  if (m.iqr < minIQRw) minIQRw = m.iqr;
  if (m.fallbackFired) fbCount++;
}
const g2pSorted = myG2P.map(x => x.iqr).sort((a, b) => a - b);
eqNum('g2p: min IQR_w', minIQRw, A.g2p.min, 10);
eqNum('g2p: median IQR_w', type7(g2pSorted.slice(), 0.5), A.g2p.median, 10);
eqNum('g2p: max IQR_w', g2pSorted[g2pSorted.length - 1], A.g2p.max, 10);
eq('g2p: fallback count', fbCount, A.g2p.optionAFallbackFired);
const guardPass = minIQRw >= 0.10;
eq('g2p: gate (min IQR_w >= 0.10)', guardPass, A.g2p.pass);
eq('g2p: untestable wallet field', A.g2p.untestableWallet, guardPass ? null : A.g2p.perWallet.find(x => x.iqrMarginal === A.g2p.min).address);

// ---------- 6. legacy k-draw IQRs (independent RNG; == artifact AND == frozen) ----------
const B_W = 10000;                                   // §8.4 draw count (frozen-run convention)
function rngFromSeed(seedHex) {
  const b = Buffer.from(seedHex, 'hex');
  let s0 = 0n, s1 = 0n;
  for (let i = 0; i < 8; i++) s0 = s0 * 256n + BigInt(b[i]);
  for (let i = 8; i < 16; i++) s1 = s1 * 256n + BigInt(b[i]);
  const M = (1n << 64n) - 1n;
  return () => {
    let x = s0; const y = s1; s0 = y;
    x ^= (x << 23n) & M; x ^= x >> 17n; x ^= y ^ (y >> 26n); s1 = x & M;
    return Number((x + y) & 0xFFFFFFFFn);
  };
}
const seedFor = a => crypto.createHash('sha256')
  .update('gate0c:nic:' + a + ':' + priceSha + ':' + v2blob).digest('hex').slice(0, 32);
const myLeg = [];
for (const [addr, k] of [...kBy.entries()].sort()) {
  const own = ownBy.get(addr);
  const w = A_DAYS.map(d => Math.max((Nd.get(d) || 0) - (own.get(d) || 0), 0) + 0.25);
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
      let i = 0; while (cum[i] < target) i++;        // linear scan == binary-search result
      e += i / (A_LEN - 1);
    }
    draws[r] = e / k;
  }
  const srt = Float64Array.from(draws).sort();
  myLeg.push({ address: addr, k, ess, iqr: type7(srt, 0.75) - type7(srt, 0.25) });
}
for (const m of myLeg) {
  const st = A.legacy.perWallet.find(x => x.address === m.address);
  const fr = FROZEN.g2.perWallet.find(x => x.address === m.address);
  if (!st || !fr) { chk('legacy: wallet ' + m.address + ' present', false, 'missing'); continue; }
  eqNum('legacy: ' + m.address.slice(0, 10) + ' k=' + m.k + ' nullIQR (recomputed == artifact)', m.iqr, st.nullIQR, 4);
  eq('legacy: ' + m.address.slice(0, 10) + ' nullIQR (artifact == frozen)', st.nullIQR, fr.nullIQR);
  eqNum('legacy: ' + m.address.slice(0, 10) + ' ESS', m.ess, st.ess, 2);
  eq('legacy: ' + m.address.slice(0, 10) + ' fallback flag', m.ess < 5, st.fallbackFired);
}
const legSorted = myLeg.map(x => x.iqr).sort((a, b) => a - b);
eqNum('legacy: min', legSorted[0], A.legacy.min, 4);
eqNum('legacy: median', type7(legSorted.slice(), 0.5), A.legacy.median, 4);
eqNum('legacy: max', legSorted[legSorted.length - 1], A.legacy.max, 4);
eq('legacy: min == frozen g2.min', A.legacy.min, FROZEN.g2.min);
eqNum('population: essMin', Math.min(...myLeg.map(x => x.ess)), A.population.essMin, 2);
eqNum('population: essMax', Math.max(...myLeg.map(x => x.ess)), A.population.essMax, 2);
eq('population: fallback fired', myLeg.filter(x => x.ess < 5).length, A.population.optionAFallbackFired);

// ---------- 7. binding text reproduction (verbatim requirement) ----------
const Q1 = A.bindingQualifications.Q1 || '', Q2 = A.bindingQualifications.Q2 || '';
chk('binding: Q1 wording (threshold provenance)', Q1.includes('structurally and purposively justified, not empirically derived') &&
  Q1.includes('carried over unchanged from the original §7 gate') &&
  Q1.includes('Any post-hoc threshold re-derivation is threshold-shopping and prohibited'), 'Q1 text incomplete');
chk('binding: Q2 wording (non-sufficiency)', Q2.includes('establishes non-degeneracy only') &&
  Q2.includes('two day-positions do not establish scientific sufficiency') &&
  Q2.includes('must be reproduced verbatim in every results artifact'), 'Q2 text incomplete');
chk('binding: F6 disclosure present', (A.g1_descriptive.disclosure || '').includes('band-day up-variance is absent in this era'), 'F6 disclosure missing');
chk('binding: band selection none', Array.isArray(A.conventions.bandSelection) === false &&
  typeof A.conventions.bandSelection === 'string' && A.conventions.bandSelection.startsWith('none'), 'bandSelection must be "none — …"');

// ---------- 8. horizons + verdict ----------
const lastAcq = Object.keys(dm).sort().pop();
const frontier = dates[dates.length - 1];
for (const h of [7, 30]) {
  const need = addDays(lastAcq, h);
  eq('horizon: ' + h + 'd needBy', need, A.horizonCoverage[h].needBy);
  eq('horizon: ' + h + 'd covered', Date.parse(need) <= Date.parse(frontier), A.horizonCoverage[h].covered);
}
const minNok = kBy.size >= 15;
const myVerdict = (guardPass && minNok) ? 'P4 v1.1 PASS' : 'P4 v1.1 FAIL';
eq('verdict', myVerdict, A.verdict);
eq('untestableReason consistent', A.untestableReason, guardPass ? null : A.untestableReason);
eq('determinism: pinned timestamp', A.generatedAtUTC, A.executionDate + 'T00:00:00Z');

// ---------- report ----------
console.log('='.repeat(64));
console.log('Gate 0c — independent verification of AMENDED v1.1 P4 NIC artifact');
console.log('='.repeat(64));
console.log('checks passed:', nOK, '| checks DIFF:', nDIFF);
if (nDIFF) { console.log('\nMISMATCHES:'); for (const d of diffs) console.log('  ✗ ' + d); }
else console.log('\nALL ASSERTIONS REPRODUCE from the frozen inputs under the amended conventions.');
console.log('\nartifact verdict:', A.verdict, '| g2p min IQR_w:', A.g2p.min, '(gate >= 0.10:',
  A.g2p.pass + ')', '| legacy min (== frozen g2.min):', A.legacy.min,
  '| D1 excl frac_up 3d/7d/14d:', A.g1_descriptive.bands['3d'].excl.pooledFracUp,
  A.g1_descriptive.bands['7d'].excl.pooledFracUp, A.g1_descriptive.bands['14d'].excl.pooledFracUp);
process.exit(nDIFF ? 1 : 0);
