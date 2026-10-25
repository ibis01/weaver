#!/usr/bin/env node
/**
 * aw-nic-verify-v12.js — Gate 0c chain-integrity wrapper (2026-10-25).
 *
 * Relationship to v11: v11 (sha256 84bc0953…) is the frozen verifier of
 * record and is NEVER edited again. v12 is a NEW file that verifies the
 * chain AROUND v11, then executes v11 and requires its 416/0 verdict.
 * Verifier evolution model: each version pins its predecessor's hash
 * (v12 pins v11; a future v13 would pin v12, etc.).
 *
 * Assertions:
 *   A1  sha256(scripts/aw-nic-verify-v11.js) == 84bc0953e147169412c7d520bf99b6c6c3cd6f2ee8d8a7d8f95f26d90eef1c8e
 *   A2  v11 executed at ROOT -> exit 0 AND "checks passed: 416 | checks DIFF: 0"
 *   A3  canonical frozen set at the documented paths:
 *         prereg          36201d78c588b9523c5ece3e38cd22ddb5da18ad969379da891c7e2247db7fc7
 *         amendment MD    7964e7ae1d358843b20e90c14614072500942670d9c12df03dbe47b284418e30
 *         amendment patch 200531e9001958ae4bebbdbfaa3b4b6c1864e17a52e2c63c24467a5d09572592
 *         result JSON     3986e710ca892ba20279c7c89a5e7c4b899647b26cfc02a68268c8542a1f6a35
 *         result MD       6383e81be1ee46e2ee55932ef2e4f054756e2ba049d12920db58516103c0f583
 *   A4  reconstruction chain, in-repo materials only:
 *         sha256(baseline copy) == 85468ac76b37c20b0db53581abc0ae395e93dd1730f19d43a05ed9051a04b6f1
 *         sha256(baseline + patch applied, strict no-fuzz) == 36201d78…  (== canonical prereg)
 *   A5  incident record present and pinned:
 *         docs/audits/gate-0c-restore-incident-record-2026-10-25.md
 *         sha256 == 354fb21c69ba423a591eaf733004c3c56470365a85651b5b3ae96bd4bafe0747
 *
 * Exit 0 only if every assertion passes. Any drift -> non-zero exit and a
 * DIFF line naming the drifted path. This script is read-only: it writes
 * nothing inside ROOT (reconstruction happens in a temp directory).
 *
 * Usage: node scripts/aw-nic-verify-v12.js [ROOT]
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(process.argv[2] || '.');

let passed = 0;
let diff = 0;

function eq(name, got, want) {
  if (got === want) { passed++; return; }
  diff++;
  console.error(`DIFF ${name}\n  got : ${got}\n  want: ${want}`);
}

function die(msg) {
  console.error(`FATAL: ${msg}`);
  process.exit(1);
}

const sha256Buf = b => crypto.createHash('sha256').update(b).digest('hex');
const sha256File = p => sha256Buf(fs.readFileSync(p));

const P = {
  v11: path.join(ROOT, 'scripts/aw-nic-verify-v11.js'),
  v12: __filename,
  prereg: path.join(ROOT, 'docs/experiments/gate-0c-skill-test-preregistration-v1.md'),
  baseline: path.join(ROOT, 'docs/experiments/gate-0c-skill-test-preregistration-v1.baseline-85468ac7.md'),
  amendment: path.join(ROOT, 'docs/experiments/gate-0c-amendment-v1.1-draft-2026-10-21.md'),
  patch: path.join(ROOT, 'docs/experiments/gate-0c-amendment-v1.1-draft-2026-10-21.patch'),
  resultJson: path.join(ROOT, 'docs/experiments/gate-0c-nic-2026-10-21-v1.1.json'),
  resultMd: path.join(ROOT, 'docs/experiments/gate-0c-nic-2026-10-21-v1.1.md'),
  record: path.join(ROOT, 'docs/audits/gate-0c-restore-incident-record-2026-10-25.md'),
};

const H = {
  v11: '84bc0953e147169412c7d520bf99b6c6c3cd6f2ee8d8a7d8f95f26d90eef1c8e',
  prereg: '36201d78c588b9523c5ece3e38cd22ddb5da18ad969379da891c7e2247db7fc7',
  baseline: '85468ac76b37c20b0db53581abc0ae395e93dd1730f19d43a05ed9051a04b6f1',
  amendment: '7964e7ae1d358843b20e90c14614072500942670d9c12df03dbe47b284418e30',
  patch: '200531e9001958ae4bebbdbfaa3b4b6c1864e17a52e2c63c24467a5d09572592',
  resultJson: '3986e710ca892ba20279c7c89a5e7c4b899647b26cfc02a68268c8542a1f6a35',
  resultMd: '6383e81be1ee46e2ee55932ef2e4f054756e2ba049d12920db58516103c0f583',
  record: '354fb21c69ba423a591eaf733004c3c56470365a85651b5b3ae96bd4bafe0747',
};

console.log('================================================================');
console.log('Gate 0c — chain-integrity verification (v12 wrapper over v11)');
console.log(`ROOT: ${ROOT}`);
console.log('================================================================');

// ---------- A0. presence ----------
for (const [k, p] of Object.entries(P)) {
  if (!fs.existsSync(p)) die(`${k} not found: ${p}`);
}

// ---------- A1. v11 byte-frozen ----------
eq('chain: verifier v11 byte-frozen', sha256File(P.v11), H.v11);

// ---------- A3. canonical frozen set ----------
eq('frozen: amended prereg sha256', sha256File(P.prereg), H.prereg);
eq('frozen: baseline prereg copy sha256', sha256File(P.baseline), H.baseline);
eq('frozen: amendment record sha256', sha256File(P.amendment), H.amendment);
eq('frozen: amendment patch sha256', sha256File(P.patch), H.patch);
eq('frozen: result JSON sha256', sha256File(P.resultJson), H.resultJson);
eq('frozen: result MD sha256', sha256File(P.resultMd), H.resultMd);

// ---------- A4. reconstruction chain (strict unified-diff applier) ----------
/**
 * Apply a unified diff to `baseText` with ZERO fuzz: every context (' ')
 * and removal ('-') line must match the base exactly at the hunk's stated
 * offset; no offset search, no whitespace tolerance. Deterministic: either
 * reproduces the exact bytes or throws.
 */
function applyUnifiedDiffStrict(baseText, diffText) {
  const dLines = diffText.split('\n');
  const base = baseText.split('\n');
  const hadTrailingNewline = baseText.endsWith('\n');
  const src = hadTrailingNewline ? base.slice(0, -1) : base.slice();

  const hunks = [];
  for (let i = 0; i < dLines.length; i++) {
    const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(dLines[i]);
    if (m) {
      const oldCount = m[2] === undefined ? 1 : parseInt(m[2], 10);
      const newCount = m[4] === undefined ? 1 : parseInt(m[4], 10);
      const body = [];
      let j = i + 1, oc = 0, nc = 0;
      // Scan EXACTLY the declared hunk body: ctx+removals == oldCount and
      // ctx+additions == newCount. Anything after that (blank separator
      // lines, the trailing-newline artifact) is not part of the hunk.
      while (j < dLines.length && (oc < oldCount || nc < newCount)) {
        const raw = dLines[j];
        const line = raw === '' ? ' ' : raw; // empty line == empty context line
        const tag = line[0];
        if (tag === ' ') { oc++; nc++; }
        else if (tag === '-') oc++;
        else if (tag === '+') nc++;
        else throw new Error(`unexpected line in hunk body at diff line ${j}: ${JSON.stringify(raw)}`);
        body.push(line);
        j++;
      }
      if (oc !== oldCount || nc !== newCount) {
        throw new Error(`hunk at oldStart ${m[1]} truncated: declared -${oldCount},+${newCount}, parsed ctx+rem=${oc}, ctx+add=${nc}`);
      }
      hunks.push({ oldStart: parseInt(m[1], 10), body });
      i = j - 1;
    }
  }
  if (hunks.length === 0) throw new Error('no hunks found in patch');

  if (/\n\\\\ No newline at end of file/.test('\n' + diffText) ||
      /\\ No newline at end of file/.test(diffText)) {
    throw new Error('"No newline at end of file" marker present — unsupported in strict mode');
  }

  const out = [];
  let srcPos = 0; // 0-based index into src
  for (const h of hunks) {
    const target = h.oldStart - 1; // 0-based
    if (target < srcPos) throw new Error(`hunk overlap at oldStart ${h.oldStart}`);
    // copy untouched lines before this hunk
    while (srcPos < target) out.push(src[srcPos++]);
    for (const line of h.body) {
      const tag = line[0];
      const content = line.slice(1);
      if (tag === ' ') {
        if (srcPos >= src.length || src[srcPos] !== content) {
          throw new Error(`strict context mismatch at src line ${srcPos + 1}: expected ${JSON.stringify(content)}`);
        }
        out.push(src[srcPos++]);
      } else if (tag === '-') {
        if (srcPos >= src.length || src[srcPos] !== content) {
          throw new Error(`strict removal mismatch at src line ${srcPos + 1}: expected ${JSON.stringify(content)}`);
        }
        srcPos++; // drop the line
      } else if (tag === '+') {
        out.push(content);
      } else {
        throw new Error(`unsupported patch line: ${JSON.stringify(line)}`);
      }
    }
  }
  while (srcPos < src.length) out.push(src[srcPos++]);
  return out.join('\n') + (hadTrailingNewline ? '\n' : '');
}

const baselineText = fs.readFileSync(P.baseline, 'utf8');
const patchText = fs.readFileSync(P.patch, 'utf8');
let reconstructed;
try {
  reconstructed = applyUnifiedDiffStrict(baselineText, patchText);
} catch (e) {
  die(`reconstruction failed (strict applier): ${e.message}`);
}
const reconSha = sha256Buf(Buffer.from(reconstructed, 'utf8'));
eq('reconstruction: baseline + patch == amended prereg', reconSha, H.prereg);

// ---------- A5. incident record pinned ----------
eq('record: restore incident record sha256', sha256File(P.record), H.record);

// ---------- A2. execute frozen v11 LAST (delegates all 416 artifact checks) ----------
const res = spawnSync(process.execPath, [P.v11, ROOT], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
if (res.error) die(`v11 exec failed: ${res.error.message}`);
eq('exec: verifier v11 exit code', String(res.status), '0');
const m = /checks passed: (\d+) \| checks DIFF: (\d+)/.exec(res.stdout || '');
if (!m) die('v11 stdout did not contain the checks summary line');
eq('exec: verifier v11 passed count', m[1], '416');
eq('exec: verifier v11 diff count', m[2], '0');

// ---------- summary ----------
console.log('----------------------------------------------------------------');
console.log(`chain checks passed: ${passed} | chain checks DIFF: ${diff}`);
if (diff === 0) {
  console.log('CHAIN INTACT: v11 byte-frozen (84bc0953…), canonical set matches the');
  console.log('frozen map, reconstruction baseline+patch == 36201d78 reproduces,');
  console.log('incident record pinned, and the frozen verifier itself reports 416/0.');
  process.exit(0);
} else {
  console.error('CHAIN BROKEN: see DIFF lines above. Do not re-anchor hashes to');
  console.error('make this pass — investigate the drift and append an incident record.');
  process.exit(1);
}
