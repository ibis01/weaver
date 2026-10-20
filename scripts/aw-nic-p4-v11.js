#!/usr/bin/env node
// ============================================================
// Gate 0c — P4 NIC execution, AMENDED v1.1 (pre-lock, offline, no RPC).
// Implements amended prereg v1.1 (sha256 36201d78…) §7 as realized by
// patch 200531e9… and recorded in gate-0c-amendment-v1.1-draft-2026-10-21.md:
//   D1     — descriptive era diagnostic (was gate G1; identical machinery,
//            reported not gating; kill-switch removed)
//   G2-P   — anti-degeneracy guard (F7 Branch P): exact marginal null IQR_w
//            via generalized-inverse quantiles; seed-free, deterministic
//   legacy — per-wallet k-draw null IQRs under the frozen run's provisional
//            seed convention (descriptive, non-gating; comparability)
//   ESS_w  — unchanged §8.2 machinery
// F7 scope discipline: no §8 null-model machinery changes; the frozen
// 2026-10-20 FAIL pair (e064f625…/07cb0ffc…) is referenced, never altered.
// NO wallet-level outcome computation (pre-unblinding). Writes ONLY:
//   docs/experiments/gate-0c-nic-2026-10-21-v1.1.{md,json}  (refuses overwrite)
// Incident rule (amendment record §5-4): D1 must reproduce the frozen
// artifact's G1 numbers EXACTLY and the legacy column must reproduce the
// frozen per-wallet k-draw IQRs EXACTLY — any difference aborts the run.
// Byte-determinism: generatedAtUTC pinned to the execution date; float ops
// in fixed order; companion verifier cross-checks G2-P with exact integer
// arithmetic.
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
const EXEC_DATE = '2026-10-21';
const OUT_MD = ROOT + '/docs/experiments/gate-0c-nic-' + EXEC_DATE + '-v1.1.md';
const OUT_JSON = ROOT + '/docs/experiments/gate-0c-nic-' + EXEC_DATE + '-v1.1.json';
for (const f of [OUT_MD, OUT_JSON]) if (fs.existsSync(f)) {
  console.error('FATAL: refusing to overwrite existing output:', f); process.exit(1);
}
console.log('executing under ROOT:', ROOT);

const D_DET = '2026-08-08', A_LEN = 16, BANDS = [3, 7, 14], HORIZONS = [7, 30];
const TRAIL = 90, EPS = 0.25, B_W = 10000;
const SHAS = {
  v2blob: '73024f5f5e4b6dc67125fd674e30c9c1b8499c40',
  v5jsonl: '3ab1a0a3a571423290145a66a8e97c62c0409dda8c45f047ac5a8706089b20bc',
  entryBlocks: '6b4f25350793216d4f7240be553f09a7d6f6f1585ffedb34c2ade0f10cf4face',
  priceTyped: 'ae47b4e74167259b75a6d6e589e30fc608d19e6bc30ae72c168c35dea5c0100c',
  preregAmended: '36201d78c588b9523c5ece3e38cd22ddb5da18ad969379da891c7e2247db7fc7',
  amendRecord: '7964e7ae1d358843b20e90c14614072500942670d9c12df03dbe47b284418e30',
  amendPatch: '200531e9001958ae4bebbdbfaa3b4b6c1864e17a52e2c63c24467a5d09572592',
  frozenNicJson: 'e064f625bb8efefa3f3e90f9c05c587643e8360ba6f824de3e26ad91882402b7',
  frozenNicMd: '07cb0ffcd25ce4465b36d491500d817dc409f52a6d2937b312ad5889ebbfb2f0',
};

function sha256(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }
function dayStr(t) { return new Date(t).toISOString().slice(0, 10); }
function addDays(d, n) { return dayStr(Date.parse(d + 'T00:00:00Z') + n * 86400000); }
function fatal(m) { console.error('FATAL:', m); process.exit(1); }

// ---------- amendment-chain + anchor hash gate (all FATAL) ----------
const preregSha = sha256(ROOT + '/docs/experiments/gate-0c-skill-test-preregistration-v1.md');
const recSha = sha256(ROOT + '/docs/experiments/gate-0c-amendment-v1.1-draft-2026-10-21.md');
const patSha = sha256(ROOT + '/docs/experiments/gate-0c-amendment-v1.1-draft-2026-10-21.patch');
if (preregSha !== SHAS.preregAmended) fatal('amended prereg sha mismatch: ' + preregSha + ' (expected 36201d78… — apply the patch first)');
if (recSha !== SHAS.amendRecord) fatal('amendment record sha mismatch: ' + recSha);
if (patSha !== SHAS.amendPatch) fatal('amendment patch sha mismatch: ' + patSha);
const priceSha = sha256(ROOT + '/data/prices/pepe-usd-daily-365d.json');
const ebSha = sha256(ROOT + '/data/entry-blocks/v1.json');
const v5Sha = sha256(ROOT + '/data/audit-records/pepe-buyer-audit-v5.jsonl');
if (priceSha !== SHAS.priceTyped) fatal('price series sha mismatch: ' + priceSha);
if (ebSha !== SHAS.entryBlocks) fatal('entry-blocks sha mismatch: ' + ebSha);
if (v5Sha !== SHAS.v5jsonl) fatal('v5 jsonl sha mismatch: ' + v5Sha);
const v2buf = fs.readFileSync(ROOT + '/data/pepe-buyer-list/v2.json');
const v2blob = crypto.createHash('sha1')
  .update(Buffer.concat([Buffer.from('blob ' + v2buf.length + '\0'), v2buf])).digest('hex');
if (v2blob !== SHAS.v2blob) fatal('v2.json git blob mismatch: ' + v2blob);
const frJsonSha = sha256(ROOT + '/docs/experiments/gate-0c-nic-2026-10-20.json');
const frMdSha = sha256(ROOT + '/docs/experiments/gate-0c-nic-2026-10-20.md');
if (frJsonSha !== SHAS.frozenNicJson) fatal('frozen NIC json sha mismatch: ' + frJsonSha + ' — frozen pair must be intact');
if (frMdSha !== SHAS.frozenNicMd) fatal('frozen NIC md sha mismatch: ' + frMdSha + ' — frozen pair must be intact');
console.log('anchor gate: prereg(36201d78) record(7964e7ae) patch(200531e9) price(eae47b…) eb(6b4f25…) v5(3ab1a0…) v2blob(73024f…) frozen-pair(e064f625/07cb0ffc) — all OK');
const FROZEN = JSON.parse(fs.readFileSync(ROOT + '/docs/experiments/gate-0c-nic-2026-10-20.json', 'utf8'));

// ---------- anchor calibration (same code path as frozen run) ----------
const eb = JSON.parse(fs.readFileSync(ROOT + '/data/entry-blocks/v1.json', 'utf8'));
const anchors = eb.treatments.filter(e => e.firstBlock && e.firstTimestamp)
  .map(e => ({ b: e.firstBlock, t: e.firstTimestamp })).sort((x, y) => x.b - y.b);
function blockToDate(b) {
  if (b <= anchors[0].b) {
    const r = (anchors[1].b - anchors[0].b) / (anchors[1].t - anchors[0].t);
    return new Date((anchors[0].t + (b - anchors[0].b) / r) * 1000);
  }
  const last = anchors[anchors.length - 1];
  if (b >= last.b) {
    const r = (last.b - anchors[anchors.length - 2].b) / (last.t - anchors[anchors.length - 2].t);
    return new Date((last.t + (b - last.b) / r) * 1000);
  }
  for (let i = 1; i < anchors.length; i++) {
    if (b <= anchors[i].b) {
      const a = anchors[i - 1], c = anchors[i];
      return new Date((a.t + (b - a.b) * (c.t - a.t) / (c.b - a.b)) * 1000);
    }
  }
}

// ---------- confirmed acquisitions from v5 jsonl (unchanged recount) ----------
const WLO = 25710000, WHI = 25820000;
const CONFIRMED = new Set(['DIRECT_ORIGINATOR', 'TRACED_ECONOMIC_RECIPIENT']);
const txs = [];
for (const l of fs.readFileSync(ROOT + '/data/audit-records/pepe-buyer-audit-v5.jsonl', 'utf8').trim().split('\n')) {
  const r = JSON.parse(l);
  if (r.classification !== 'BUYER') continue;
  for (const a of (r.acquisitions || [])) {
    if (!CONFIRMED.has(a.classification)) continue;
    if (a.blockNumber < WLO || a.blockNumber > WHI) continue;
    const t = blockToDate(a.blockNumber);
    const iso = t.toISOString();
    const midnight = Date.parse(iso.slice(0, 10) + 'T00:00:00Z');
    txs.push({
      address: r.candidate_address, block: a.blockNumber, isoTime: iso,
      day: iso.slice(0, 10),
      minFromMidnight: Math.round(Math.min(t.getTime() - midnight, midnight + 86400000 - t.getTime()) / 60000),
    });
  }
}
const A0 = Date.parse(D_DET + 'T00:00:00Z');
const A_DAYS = Array.from({ length: A_LEN }, (_, i) => dayStr(A0 + i * 86400000));
const A_SET = new Set(A_DAYS);
const dayMass = new Map();
for (const t of txs) { dayMass.set(t.day, (dayMass.get(t.day) || 0) + 1); if (!A_SET.has(t.day)) fatal('tx day outside A_w: ' + t.day); }
const kByWallet = new Map();
for (const t of txs) kByWallet.set(t.address, (kByWallet.get(t.address) || 0) + 1);
const N = kByWallet.size;
const v2 = JSON.parse(v2buf.toString('utf8'));
const v2conf = new Map(v2.buyers.map(b => [b.address, b.confirmed]));
let perWalletMismatch = 0;
for (const [addr, k] of kByWallet) if (v2conf.get(addr) !== k) perWalletMismatch++;
const v2Only = [...v2conf.keys()].filter(a => !kByWallet.has(a) && v2conf.get(a) > 0);
const wloD = dayStr(blockToDate(WLO)), whiD = dayStr(blockToDate(WHI));
const anchorDaysInWin = anchors.filter(a => A_SET.has(dayStr(new Date(a.t * 1000)))).length;
console.log('population recount:', txs.length, 'txs |', N, 'eligible wallets |', perWalletMismatch, 'k_w mismatches');

// ---------- price series (frozen; unchanged) ----------
const typed = JSON.parse(fs.readFileSync(ROOT + '/data/prices/pepe-usd-daily-365d.json', 'utf8'));
const pts = typed.points || typed.prices || typed.data || typed;
const rowsRaw = (Array.isArray(pts) ? pts : []).map(p => {
  const t = p.timestamp ?? p.t ?? p.time ?? (typeof p[0] === 'number' ? p[0] : null);
  const c = p.close ?? p.price ?? p.c ?? (typeof p[1] === 'number' ? p[1] : null);
  return { ts: t * (t > 1e12 ? 1 : 1000), date: new Date(t * (t > 1e12 ? 1 : 1000)).toISOString().slice(0, 10), close: c };
}).filter(r => r.date && Number.isFinite(r.close)).sort((a, b) => a.ts - b.ts);
const closeByDate = new Map(rowsRaw.map(r => [r.date, r.close]));
const dates = [...closeByDate.keys()];
const close = dates.map(d => closeByDate.get(d));
const rows = dates.map(d => ({ date: d, close: closeByDate.get(d) }));
const dateIdx = new Map(dates.map((d, i) => [d, i]));
for (let i = 1; i < dates.length; i++)
  if (Date.parse(dates[i]) - Date.parse(dates[i - 1]) !== 86400000) fatal('price series gap at ' + dates[i]);
const rets = new Map();
for (let i = 1; i < dates.length; i++) rets.set(dates[i], close[i] / close[i - 1] - 1);
let unpriceable = 0;
for (const t of txs) if (!rets.has(t.day)) unpriceable++;
function pct(sorted, p) {
  const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

// ---------- D1: descriptive era diagnostic (G1 machinery VERBATIM) ----------
function g1ForBand(b, mode) {
  let totOcc = 0, upOcc = 0;
  const perDay = [];
  for (const [d, m] of [...dayMass.entries()].sort()) {
    const off = mode === 'excl' ? -b : -(b - 1);
    const s = addDays(d, off);
    const si = dateIdx.get(s);
    if (si === undefined || si - TRAIL < 0) fatal('band/trailing precedes series: ' + b + 'd ' + d);
    const trailing = [];
    for (let i = si - TRAIL; i < si; i++) trailing.push(rets.get(dates[i]));
    const thr = pct(trailing.slice().sort((x, y) => x - y), 0.90);
    const bandDays = [];
    for (let j = 0; j < b; j++) bandDays.push(addDays(s, j));
    let up = 0;
    for (const bd of bandDays) if (rets.get(bd) >= thr) up++;
    const frac = up / b;
    perDay.push({ acqDay: d, occurrences: m, bandStart: s, bandEnd: bandDays[b - 1], thresholdP90: +thr.toFixed(6), up, b, fracUp: +frac.toFixed(4) });
    totOcc += m * b; upOcc += m * up;
  }
  return { mode, b, pooledFracUp: +(upOcc / totOcc).toFixed(4), perDay };
}
const d1 = {};
for (const b of BANDS) d1[b] = { excl: g1ForBand(b, 'excl'), incl: g1ForBand(b, 'incl') };
// incident rule: D1 must reproduce the frozen artifact's G1 numbers EXACTLY
for (const b of BANDS) for (const mode of ['excl', 'incl']) {
  const mine = d1[b][mode], fr = FROZEN.g1[b + 'd'][mode];
  if (mine.pooledFracUp !== fr.pooledFracUp)
    fatal('INCIDENT: D1 ' + b + 'd ' + mode + ' pooledFracUp ' + mine.pooledFracUp + ' != frozen G1 ' + fr.pooledFracUp);
  if (JSON.stringify(mine.perDay) !== JSON.stringify(fr.perAcqDay))
    fatal('INCIDENT: D1 ' + b + 'd ' + mode + ' per-day rows differ from frozen G1');
}
console.log('D1 (descriptive): pooled frac_up excl/incl 3d/7d/14d =',
  BANDS.map(b => d1[b].excl.pooledFracUp + '/' + d1[b].incl.pooledFracUp).join('  '), '— == frozen G1 exactly (no incident)');

// ---------- §8.2 weights helper (shared construction) ----------
const Nd = new Map(A_DAYS.map(d => [d, dayMass.get(d) || 0]));
function crowdWeights(addr) {
  const own = new Map();
  for (const t of txs) if (t.address === addr) own.set(t.day, (own.get(t.day) || 0) + 1);
  const w = A_DAYS.map(d => Math.max((Nd.get(d) || 0) - (own.get(d) || 0), 0) + EPS);
  const s1 = w.reduce((a, b) => a + b, 0), s2 = w.reduce((a, b) => a + b * b, 0);
  return { w, ess: (s1 * s1) / s2 };
}

// ---------- G2-P: exact marginal anti-degeneracy guard (seed-free) ----------
// D_w: P(D_w = i/(|A_w|-1)) = q_w(d_i) / Σ q_w(d), i = 0..|A_w|-1 (§8.2 weights).
// Generalized-inverse quantile Q(p) = inf{ x on the grid : P(D_w <= x) >= p }.
// IQR_w = Q(0.75) - Q(0.25). Gate: min over eligible wallets IQR_w >= 0.10.
// Option-A fallback (§8.2): if ESS_w < 5 the wallet's weights become uniform
// within A_w (logged). Frozen run: 0 wallets fired; reproduced here if any.
const g2p = [];
let g2pFallbacks = 0;
for (const [addr, k] of [...kByWallet.entries()].sort()) {
  const { w: wCrowd, ess } = crowdWeights(addr);
  let w = wCrowd, fallbackFired = false;
  if (ess < 5) { w = A_DAYS.map(() => 1); fallbackFired = true; g2pFallbacks++; }
  const tot = w.reduce((a, b) => a + b, 0);
  const cdfs = []; let acc = 0;
  for (const x of w) { acc += x; cdfs.push(acc); }
  const qInv = p => {
    const i = cdfs.findIndex(c => c / tot >= p);
    return (i === -1 ? A_LEN - 1 : i) / (A_LEN - 1);
  };
  const iqrM = qInv(0.75) - qInv(0.25);
  g2p.push({ address: addr, k, ess: +ess.toFixed(2), fallbackFired, iqrMarginal: +iqrM.toFixed(10) });
}
const g2pSorted = g2p.map(x => x.iqrMarginal).sort((a, b) => a - b);
const g2pMin = g2pSorted[0], g2pMax = g2pSorted[g2pSorted.length - 1];
const g2pMedian = +pct(g2pSorted.slice(), 0.5).toFixed(10);
const worst = g2p.find(x => x.iqrMarginal === g2pMin);
const guardPass = g2pMin >= 0.10;
console.log('G2-P exact marginal IQR: min=' + g2pMin + ' median=' + g2pMedian + ' max=' + g2pMax,
  '-> guard', guardPass ? 'PASS (>= 0.10)' : 'FAIL (< 0.10)', '| fallbacks:', g2pFallbacks);

// ---------- legacy k-draw null IQRs (VERBATIM frozen-run machinery; descriptive) ----------
function makeRng(seedHex) {
  const buf = Buffer.from(seedHex, 'hex');
  let s0 = 0n, s1 = 0n;
  for (let i = 0; i < 8; i++) s0 = (s0 << 8n) | BigInt(buf[i]);
  for (let i = 8; i < 16; i++) s1 = (s1 << 8n) | BigInt(buf[i]);
  const M = (1n << 64n) - 1n;
  return function nextU32() {
    let x = s0; const y = s1;
    s0 = y;
    x ^= (x << 23n) & M;
    x ^= x >> 17n;
    x ^= y ^ (y >> 26n);
    s1 = x & M;
    return Number((s1 + y) & 0xFFFFFFFFn);
  };
}
const seedFor = addr => crypto.createHash('sha256')
  .update('gate0c:nic:' + addr + ':' + priceSha + ':' + SHAS.v2blob).digest('hex').slice(0, 32);
const legacy = [];
for (const [addr, k] of [...kByWallet.entries()].sort()) {
  const { w, ess } = crowdWeights(addr);
  const cum = []; let acc = 0;
  for (const x of w) { acc += x; cum.push(acc); }
  const nextU32 = makeRng(seedFor(addr));
  const draws = new Float64Array(B_W);
  for (let r = 0; r < B_W; r++) {
    let e = 0;
    for (let j = 0; j < k; j++) {
      const u = nextU32() / 4294967296;
      let lo = 0, hi = A_LEN - 1, target = u * acc;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < target) lo = mid + 1; else hi = mid; }
      e += lo / (A_LEN - 1);
    }
    draws[r] = e / k;
  }
  const sorted = Float64Array.from(draws).sort();
  const iqr = pct(sorted, 0.75) - pct(sorted, 0.25);
  legacy.push({ address: addr, k, ess: +ess.toFixed(2), nullIQR: +iqr.toFixed(4), fallbackFired: ess < 5 });
}
// incident rule: legacy column must reproduce the frozen per-wallet k-draw IQRs EXACTLY
for (const m of legacy) {
  const fr = FROZEN.g2.perWallet.find(x => x.address === m.address);
  if (!fr) fatal('INCIDENT: legacy wallet missing from frozen artifact: ' + m.address);
  if (m.nullIQR !== fr.nullIQR) fatal('INCIDENT: legacy nullIQR ' + m.address + ' ' + m.nullIQR + ' != frozen ' + fr.nullIQR);
  if (m.ess !== fr.ess) fatal('INCIDENT: legacy ESS ' + m.address + ' ' + m.ess + ' != frozen ' + fr.ess);
}
const legSorted = legacy.map(x => x.nullIQR).sort((a, b) => a - b);
const legMin = legSorted[0], legMax = legSorted[legSorted.length - 1], legMedian = +pct(legSorted.slice(), 0.5).toFixed(4);
const essMin = Math.min(...legacy.map(x => x.ess)), essMax = Math.max(...legacy.map(x => x.ess));
console.log('legacy k-draw IQR (descriptive): min=' + legMin + ' median=' + legMedian + ' max=' + legMax,
  '— == frozen g2.perWallet exactly (no incident)');

// ---------- horizon coverage (informative; horizons fixed without D1) ----------
const lastAcqDay = [...dayMass.keys()].sort().pop();
const frontier = dates[dates.length - 1];
const hOK = {};
for (const h of HORIZONS) {
  const need = addDays(lastAcqDay, h);
  hOK[h] = { needBy: need, covered: Date.parse(need) <= Date.parse(frontier) };
}

// ---------- verdict (v1.1: G2-P guard + minimum-N; band-free primary; no kill-switch) ----------
const minNok = N >= 15;
const verdict = (guardPass && minNok) ? 'P4 v1.1 PASS' : 'P4 v1.1 FAIL';
const untestableReason = guardPass ? null
  : ('UNTESTABLE — degenerate assignment null: wallet ' + worst.address + ' IQR_w=' + worst.iqrMarginal + ' < 0.10');
console.log('\nverdict:', verdict, '| G2-P guard:', guardPass ? 'pass' : 'fail', '| eligible N:', N, minNok ? '>= 15' : '< 15');
if (untestableReason) console.log('reason:', untestableReason);

// ---------- binding text (verbatim from amended prereg §7) ----------
const Q1 = 'Binding qualification Q1 (threshold provenance). The 0.10 floor is **structurally and purposively justified, not empirically derived**: it is carried over unchanged from the original §7 gate for pre-registration continuity, as a minimal non-degeneracy floor (the middle 50% of the wallet\'s day-position null must span ≥ 0.10 of the [0,1] percentile scale ≈ 1.5 grid steps on the 16-day grid). No empirical optimization or calibration supports it; it is not claimed to be empirically optimal. Any post-hoc threshold re-derivation is threshold-shopping and prohibited.';
const Q2 = 'Binding qualification Q2 (non-sufficiency). Passing this floor establishes non-degeneracy only. An IQR of 0.10 on the 16-day grid corresponds to roughly **two distinct day-positions** of interquartile spread; **two day-positions do not establish scientific sufficiency** of the design, detectability of the primary effect, or any strategy property. Passing G2-P must not be cited as evidence of discriminative adequacy beyond the floor\'s literal content. Q1 and Q2 are binding text and must be reproduced verbatim in every results artifact\'s interpretation fields.';
const F6_DISCLOSURE = 'Binding disclosure (F6): band-day up-variance is absent in this era — P4 NIC 2026-10-20: pooled frac_up 0.00–0.05 across all bands under both constructions (trailing-era P90 ≈ 2.9–3.3%/day vs band-day returns −5.6%..+1.5%); the era\'s discriminating signal exists at horizon scale (14d forward +33.9..+45.5% through 08-18).';

// ---------- artifact ----------
const artifact = {
  generatedAtUTC: EXEC_DATE + 'T00:00:00Z',
  executionDate: EXEC_DATE,
  determinismNote: 'generatedAtUTC is pinned to the execution date for byte-determinism (wall-clock intentionally not recorded); all float operations in fixed order; the companion verifier (aw-nic-verify-v11.js) recomputes G2-P by exact integer arithmetic and must agree to 10 decimal places.',
  prereg: 'docs/experiments/gate-0c-skill-test-preregistration-v1.md (amended v1.1, 2026-10-21; sha256 ' + SHAS.preregAmended + ')',
  amendment: {
    record: { path: 'docs/experiments/gate-0c-amendment-v1.1-draft-2026-10-21.md', sha256: SHAS.amendRecord },
    patch: { path: 'docs/experiments/gate-0c-amendment-v1.1-draft-2026-10-21.patch', sha256: SHAS.amendPatch },
    baselinePreregSha256: '85468ac76b37c20b0db53581abc0ae395e93dd1730f19d43a05ed9051a04b6f1',
    reviewGate: 'RQ1=a (generalized-inverse quantiles on the exact discrete distribution); RQ2=yes (single wallet below floor -> UNTESTABLE, hard, no wallet-dropping); RQ3=yes (Branch Q as documented fallback only; Branch P remains primary); RQ4=approved (binding Q1/Q2 text inspected on hash-verified copies; approval realized by patch application and owner go-ahead); RQ5=yes (legacy k-draw IQRs descriptive, non-gating)',
    executionProtocol: 'amendment record §5 (steps 1-6); this run executes steps 2-4',
  },
  frozenPairReferenced: {
    json: { sha256: SHAS.frozenNicJson }, md: { sha256: SHAS.frozenNicMd },
    note: 'frozen 2026-10-20 P4 FAIL pair — referenced, never altered; D1 and legacy columns reproduce its numbers exactly (incident rule enforced at run time)',
  },
  scope: 'P4 NIC v1.1 — D1 descriptive (price-only) + G2-P anti-degeneracy guard (assignment-only, seed-free) + legacy k-draw IQRs (descriptive); offline, no RPC, pre-unblinding; contains no wallet-level outcome statistic',
  inputs: {
    v2json: { gitBlob: SHAS.v2blob }, v5jsonl: { sha256: v5Sha }, entryBlocksV1: { sha256: ebSha },
    priceTyped: { sha256: priceSha, span: [dates[0], dates[dates.length - 1]], rows: rows.length, contiguous: true },
    dDet: D_DET, windowDays: A_LEN, window: [A_DAYS[0], A_DAYS[A_LEN - 1]],
  },
  conventions: {
    return: 'close-to-close, r(day) = close(day)/close(prev day) - 1 (UTC day boundaries)',
    percentile: 'type-7 linear interpolation (D1 thresholds and legacy k-draw IQRs, unchanged from frozen run); G2-P uses exact generalized-inverse quantiles on the discrete grid — no interpolation, no Monte Carlo',
    d1: 'identical machinery to frozen-run G1: up-day := close-to-close return >= P90 of the trailing 90 daily returns as of the band start; band primary excl [d-b..d-1], sensitivity incl [d-b+1..d]; pooled frac_up over acquisition days; REPORTED NOT GATING; kill-switch removed',
    g2p: 'per-wallet exact marginal null of a single day-position on the A_w grid: P(D_w = i/(|A_w|-1)) = q_w(d_i)/Σ q_w(d) with q_w the §8.2 weights (leave-self-out crowd counts + 0.25; Option-A uniform fallback if ESS_w < 5, logged); IQR_w = Q_D_w(0.75) - Q_D_w(0.25) with generalized-inverse Q; gate: min over eligible wallets >= 0.10',
    legacy: 'per-wallet k-draw null IQR of the §9.1 entry-day percentile under §8.2 weights; k_w i.i.d. draws with replacement; B_W=' + B_W + ' draws; provisional seeds identical to the frozen run (sha256("gate0c:nic:"+address+":"+priceSha+":"+v2blob), xorshift128+ canonical, low word of s1+s0); DESCRIPTIVE, NON-GATING (F7 scope discipline); no §8 null-model machinery changes',
    bandSelection: 'none — the §9.1 primary is band-free; D1 feeds no decision; no (band, horizon) pair is selected or pass-listed',
  },
  population: {
    eligibleWallets: N, minimumNRequired: 15, minimumNok: minNok,
    perWalletKw: legacy.map(x => ({ address: x.address, k: x.k })),
    perWalletMismatchVsV2: perWalletMismatch, v2WalletsAbsentFromRecount: v2Only.length,
    dayMass: Object.fromEntries([...dayMass.entries()].sort()),
    txTotal: txs.length, unpriceable: unpriceable,
    essMin: +essMin.toFixed(2), essMax: +essMax.toFixed(2),
    optionAFallbackFired: legacy.filter(x => x.fallbackFired).length,
  },
  p2cChecks: {
    windowEdgesExtrapolated: [wloD, whiD],
    anchorsOnDetWindow: anchorDaysInWin + '/' + anchors.length,
    txDaysAllWithinWindow: true,
    midnightBoundaryTx: txs.filter(t => Math.abs(t.minFromMidnight) <= 30)
      .map(t => ({ block: t.block, day: t.day, isoTime: t.isoTime, minFromMidnight: t.minFromMidnight })),
  },
  g1_descriptive: {
    disclosure: F6_DISCLOSURE,
    killSwitchRemoved: true,
    feedsDecision: false,
    bands: Object.fromEntries(BANDS.map(b => [b + 'd', {
      excl: { pooledFracUp: d1[b].excl.pooledFracUp, perAcqDay: d1[b].excl.perDay },
      incl: { pooledFracUp: d1[b].incl.pooledFracUp, perAcqDay: d1[b].incl.perDay },
    }])),
  },
  g2p: {
    definition: 'exact marginal null of a single day-position under §8.2 weights; generalized-inverse quantiles; seed-free and deterministic (F7 Branch P)',
    gate: 'min over eligible wallets of exact marginal IQR_w >= 0.10 (Q1 floor)',
    perWallet: g2p,
    min: g2pMin, median: g2pMedian, max: g2pMax,
    pass: guardPass,
    optionAFallbackFired: g2pFallbacks,
    untestableWallet: guardPass ? null : worst.address,
  },
  bindingQualifications: { Q1, Q2 },
  legacy: {
    note: 'k-draw null IQRs under the frozen run\'s provisional-seed convention — descriptive, non-gating (RQ5); values reproduce the frozen artifact g2.perWallet exactly (incident rule enforced at run time)',
    perWallet: legacy, min: legMin, median: legMedian, max: legMax,
  },
  horizonCoverage: { lastAcqDay, informativeOnly: true, ...hOK },
  verdict, untestableReason,
  notes: [
    'Executed under amended prereg v1.1 (36201d78…); amendment chain hash-verified before execution (record 7964e7ae…, patch 200531e9…, baseline prereg 85468ac7…).',
    'D1 reproduces the frozen artifact\'s G1 numbers exactly and the legacy column reproduces the frozen per-wallet k-draw IQRs exactly — verified at run time; any difference is an incident and aborts.',
    'The frozen 2026-10-20 P4 FAIL pair (e064f625…/07cb0ffc…) remains untouched; its verdict stands for the v1 analysis.',
    'G2-P is seed-free: an exact quantity verifiable without PRNG reproduction (strengthens §12 recount).',
    'Q1/Q2 binding text reproduced verbatim in this artifact\'s interpretation fields (amended prereg §7 requirement).',
    'This artifact is frozen before unblinding; no wallet-level outcome statistic appears in it.',
  ],
};
fs.writeFileSync(OUT_JSON, JSON.stringify(artifact, null, 2));

// ---------- markdown artifact ----------
const md = [];
md.push('# Gate 0c — P4 NIC Artifact, AMENDED v1.1 (' + EXEC_DATE + ', pre-lock)');
md.push('');
md.push('**Scope:** amended prereg v1.1 §7 — D1 descriptive era diagnostic (price-only) + G2-P anti-degeneracy');
md.push('guard (assignment-only, seed-free) + legacy k-draw IQRs (descriptive). Offline, no RPC, pre-unblinding;');
md.push('contains no wallet-level outcome statistic. Machine sidecar: `gate-0c-nic-' + EXEC_DATE + '-v1.1.json`.');
md.push('');
md.push('**Provenance:** executed under amended prereg v1.1 (sha256 `36201d78…`), realized by patch `200531e9…` and');
md.push('recorded in `gate-0c-amendment-v1.1-draft-2026-10-21.md` (sha256 `7964e7ae…`; execution protocol §5, steps 2–4).');
md.push('Baseline prereg `85468ac7…` superseded. Review gate: RQ1=a; RQ2=yes; RQ3=yes (Branch Q documented fallback');
md.push('only); RQ4=approved (binding text inspected on hash-verified copies; realized by patch application and owner');
md.push('go-ahead); RQ5=yes. The frozen 2026-10-20 FAIL pair (`e064f625…`/`07cb0ffc…`) is referenced, never altered.');
md.push('');
md.push('## Inputs (hash-verified before execution)');
md.push('');
md.push('| Input | Anchor | Verified |');
md.push('|---|---|---|');
md.push('| v2.json | git blob `' + SHAS.v2blob.slice(0, 16) + '…` | ✓ recomputed |');
md.push('| pepe-buyer-audit-v5.jsonl | sha256 `' + v5Sha.slice(0, 16) + '…` | ✓ recomputed |');
md.push('| entry-blocks/v1.json | sha256 `' + ebSha.slice(0, 16) + '…` | ✓ recomputed |');
md.push('| pepe-usd-daily-365d.json | sha256 `' + priceSha.slice(0, 16) + '…` | ✓ recomputed |');
md.push('| amended prereg v1.1 | sha256 `36201d78…` | ✓ recomputed |');
md.push('| frozen NIC pair 2026-10-20 | sha256 `e064f625…` / `07cb0ffc…` | ✓ intact |');
md.push('');
md.push('Price series: ' + rows.length + ' rows, ' + dates[0] + '..' + dates[dates.length - 1] + ', contiguous (UTC daily). Window `A_w = [' + A_DAYS[0] + ', ' + A_DAYS[A_LEN - 1] + ']` (16 days, §5 uniform).');
md.push('');
md.push('## Population (P2 freeze preview — unchanged recount)');
md.push('');
md.push('- Eligible wallets (≥1 priceable confirmed acquisition): **' + N + '** — minimum-N 15 ' + (minNok ? 'PASS' : 'FAIL') + ' (§4.2 rule 5).');
md.push('- Confirmed acquisitions: ' + txs.length + '; day mass ' + JSON.stringify([...dayMass.entries()].sort()) + '; 0 days outside A_w; ' + unpriceable + ' unpriceable.');
md.push('- Per-wallet k_w matches v2.json `buyers[].confirmed`: ' + perWalletMismatch + ' mismatches; v2 wallets absent from recount: ' + v2Only.length + '.');
md.push('- P2c cross-checks: extrapolated window edges ' + wloD + '..' + whiD + '; anchors with timestamps on d_det..d_det+15: ' + anchorDaysInWin + '/' + anchors.length + '; midnight-boundary tx (≤30 min): ' + txs.filter(t => Math.abs(t.minFromMidnight) <= 30).length + '/' + txs.length + '.');
md.push('');
md.push('## D1 — descriptive era diagnostic (F6 re-scope; was gate G1)');
md.push('');
md.push('Identical machinery to the frozen run\'s G1 (P90 trailing-90d threshold; excl primary, incl sensitivity).');
md.push('**Reported, not gating; the kill-switch is removed** — the §9.1 primary consumes no band, so a band diagnostic');
md.push('cannot route it to UNTESTABLE. Incident rule enforced: these numbers reproduce the frozen artifact\'s G1 exactly.');
md.push('');
md.push('| Band | primary (excl) frac_up | sensitivity (incl) frac_up |');
md.push('|---|---|---|');
for (const b of BANDS) md.push('| ' + b + 'd | ' + d1[b].excl.pooledFracUp.toFixed(2) + ' | ' + d1[b].incl.pooledFracUp.toFixed(2) + ' |');
md.push('');
md.push(F6_DISCLOSURE);
md.push('');
md.push('After two calibrated threshold failures (F5, F6), further threshold search for D1 is threshold-shopping and prohibited. Per-acquisition-day detail: sidecar `g1_descriptive.bands.<band>.{excl,incl}.perAcqDay`.');
md.push('');
md.push('## G2-P — anti-degeneracy guard (F7 Branch P; seed-free, deterministic)');
md.push('');
md.push('Exact marginal null of a single day-position per wallet under the §8.2 weights; IQR_w = Q(0.75) − Q(0.25) with');
md.push('generalized-inverse quantiles; **no Monte Carlo, no seeds**. Gate: **min over eligible wallets IQR_w ≥ 0.10**.');
md.push('');
md.push('Result: min **' + g2pMin + '**, median ' + g2pMedian + ', max ' + g2pMax + ' over ' + N + ' wallets → guard **' + (guardPass ? 'PASS' : 'FAIL') + '**. Option-A fallback fired for ' + g2pFallbacks + ' wallet(s).');
if (!guardPass) md.push('');
if (!guardPass) md.push('**' + untestableReason + '**');
md.push('');
md.push('| # | Wallet | k_w | ESS_w | marginal IQR_w | ≥ 0.10 |');
md.push('|---|---|---|---|---|---|');
g2p.forEach((x, i) => md.push('| ' + (i + 1) + ' | `' + x.address.slice(0, 10) + '…` | ' + x.k + ' | ' + x.ess.toFixed(2) + ' | ' + x.iqrMarginal + ' | ' + (x.iqrMarginal >= 0.10 ? 'yes' : 'NO') + ' |'));
md.push('');
md.push('### Binding qualifications (verbatim; normative, not notes)');
md.push('');
md.push('- ' + Q1);
md.push('');
md.push('- ' + Q2);
md.push('');
md.push('## Legacy k-draw null IQRs (descriptive, non-gating — RQ5)');
md.push('');
md.push('Same provisional-seed convention as the frozen run (' + B_W.toLocaleString() + ' draws/wallet, xorshift128+ — sidecar `conventions.legacy`): min ' + legMin + ', median ' + legMedian + ', max ' + legMax + '. Values reproduce the frozen artifact `g2.perWallet` exactly (incident rule enforced). Scope discipline (F7): the §8 null-model machinery is unchanged; these IQRs no longer gate.');
md.push('');
md.push('ESS_w ∈ [' + essMin.toFixed(2) + ', ' + essMax.toFixed(2) + ']; Option-A fallback fired for ' + legacy.filter(x => x.fallbackFired).length + ' wallet(s) (prereg §8.2 preview 5.4–6.3 reproduced).');
md.push('');
md.push('## Horizon coverage (informative — horizons 7d/30d fixed without D1)');
md.push('');
for (const h of HORIZONS) md.push('- ' + h + 'd: last acquisition day ' + lastAcqDay + ' + ' + h + ' = ' + hOK[h].needBy + ' vs price frontier ' + frontier + ' → ' + (hOK[h].covered ? 'covered' : 'NOT COVERED') + '.');
md.push('');
md.push('## Verdict');
md.push('');
md.push('**' + verdict + '.** G2-P guard: ' + (guardPass ? 'pass (min marginal IQR_w ' + g2pMin + ' ≥ 0.10)' : 'fail (min marginal IQR_w ' + g2pMin + ' < 0.10)') + '. Eligible N = ' + N + ' (≥ 15: ' + (minNok ? 'yes' : 'no') + ').');
md.push('');
md.push('Band selection: **none** — the §9.1 primary is band-free; no (band, horizon) pair is selected or pass-listed; D1 feeds no decision' + (guardPass ? '.' : '; the design is UNTESTABLE under Q1/Q2 as qualified.') );
md.push('');
md.push('## Protocol notes');
md.push('');
for (const n of artifact.notes) md.push('- ' + n);
md.push('');
fs.writeFileSync(OUT_MD, md.join('\n'));
console.log('\nwrote:', OUT_MD, '+ .json sidecar (byte-deterministic; no other path touched)');
