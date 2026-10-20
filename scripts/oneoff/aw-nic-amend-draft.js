#!/usr/bin/env node
// ============================================================
// Gate 0c — Amendment v1.1 RE-DERIVATION (DRAFT generator).
// NOTE: Paths and BASE_SHA updated for /home/ibismuh/Desktop/weaver.
// The baseline prereg locally has a different SHA (de51cba3...), so
// running this will safely abort on the integrity check.
// ============================================================
'use strict';
const fs = require('fs');
const crypto = require('crypto');

const ROOT = '/home/ibismuh/Desktop/weaver';
const PREREG = ROOT + '/docs/experiments/gate-0c-skill-test-preregistration-v1.md';
const TMP = ROOT + '/scripts/.tmp-amended-PROPOSED.md';
// Note: This is the expected SHA from the original sandbox, which will fail locally.
const BASE_SHA = '85468ac76b37c20b0db53581abc0ae395e93dd1730f19d43a05ed9051a04b6f1';

let src = fs.readFileSync(PREREG, 'utf8');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
if (sha(src) !== BASE_SHA) { console.error('FATAL: baseline prereg sha mismatch — aborting'); process.exit(1); }

function rep(name, oldStr, newStr) {
  const n = src.split(oldStr).length - 1;
  if (n !== 1) { console.error(`FATAL: anchor "${name}" matched ${n} times (need exactly 1) — aborting`); process.exit(1); }
  src = src.replace(oldStr, newStr);
  console.log(`applied: ${name}`);
}

// ---------- R1: header changelog ----------
rep('R1 header changelog',
`> informational and used committed blobs + the frozen price series only; no
> outcome computation has occurred, before or since.`,
`> informational and used committed blobs + the frozen price series only; no
> outcome computation has occurred, before or since. Amendment v1.1
> re-derived 2026-10-21 as DRAFT — NOT APPLIED, NOT EXECUTED (review gate
> pending): F6 → option (ii) G1 descriptive; F7 → Branch P exact-marginal
> anti-degeneracy guard; Q1/Q2 binding qualifications; Branch Q documented
> alternative. See docs/experiments/gate-0c-amendment-v1.1-draft-2026-10-21.md.`);

// ---------- R2: §1 P4 bullet ----------
rep('R2 P4 bullet',
`  draft before any lock (package §8 addendum, flags F6/F7); no outcome
  computation has occurred.`,
`  draft before any lock (package §8 addendum, flags F6/F7); no outcome
  computation has occurred. **Amendment v1.1 re-derivation (2026-10-21,
  DRAFT — NOT APPLIED, NOT EXECUTED):** the 2026-10-21 independent
  implementation review found no persisted amendment, patch, or amended
  artifact behind the reported 2026-10-20 v1.1 implementation; the
  amendment is therefore re-derived as a review draft
  (docs/experiments/gate-0c-amendment-v1.1-draft-2026-10-21.md + .patch).
  F6 → option (ii): G1 reclassified descriptive (D1). F7 → Branch P:
  exact-marginal anti-degeneracy guard (G2-P); Branch Q documented
  alternative. The frozen FAIL artifact of 2026-10-20 remains the last
  executed NIC; no amended P4 execution has occurred, and none follows
  until the review gate passes.`);

// ---------- R3: §4.4 v1.1 disposition block ----------
rep('R3 §4.4 dispositions',
`  25742495 — the four acquisitions within 30 min of a UTC midnight) if
  explicitly authorized.
`,
`  25742495 — the four acquisitions within 30 min of a UTC midnight) if
  explicitly authorized.

**Amendment v1.1 dispositions (drafted 2026-10-21; DRAFT — NOT APPLIED,
NOT EXECUTED; reconstruction of the lost 2026-10-20 implementation per
the 2026-10-21 implementation review; binding only at commit per §1,
after the review gate approves the draft):**

- **F6 → option (ii), re-scope (package §8 addendum).** G1 is
  reclassified as the **descriptive era diagnostic D1** (§7): reported,
  not gating; the band-free kill-switch is removed; the absence of
  band-day up-variance in this era becomes binding disclosure. Era
  diagnostics and the primary estimand are thereby separated.
- **F7 → Branch P (explicit anti-degeneracy guard).** G2 is replaced by
  **G2-P** (§7): per-wallet IQR of the exact single-day-position null
  under the §8.2 weights, generalized-inverse quantiles, no Monte Carlo;
  gate min over eligible wallets ≥ 0.10; legacy k-draw null IQRs remain
  reported (descriptive, non-gating). Threshold qualifications Q1/Q2 are
  binding text (§7), not explanatory notes.
- **Branch Q — documented alternative, NOT selected.** Population-level
  guard: median-over-wallets of the per-wallet k-draw null IQR (package
  F7 option (a)), optionally refined to the §8.3 population-null IQR
  (option (b)). Would pass on the frozen 2026-10-20 numbers (median
  0.267 ≥ 0.10). Not selected because (1) the primary estimand is
  per-wallet (§9.1 e_w feeds every p_w; §9.3 T counts wallets) — a median
  tolerates individually degenerate wallets whose p_w would be
  uninterpretable; (2) it re-locates rather than repairs the √k
  contraction F7 identified; (3) it keeps a Monte-Carlo, seed-dependent
  quantity in a gate that can be exact and seed-free. Retained as the
  fallback disposition if the review gate rejects Branch P.
`);

// ---------- R4: §7 full replacement ----------
rep('R4 §7 rewrite',
`## 7. NIC — Null Informativeness Check (price-only, pre-unblinding)

Purpose: refuse to test degenerate questions. The window-degeneracy audit
showed the 16-day detection window had **no in-period outcome variance** (every
day ≤ 08-18 preceded a ≥20%/14-day rise); NIC generalizes that lesson to
candidate bands. Uses ONLY the price series; wallet outcomes untouched.

Candidates: bands b ∈ {3d, 7d, 14d} measured back from each eligible
acquisition day; horizons h ∈ {7d, 30d} post-entry.

- **G1 (calendar-time variance; F5 re-specified 2026-10-20)**: an "up-day"
  is a close-to-close return ≥ **P90 of the trailing 90 daily returns as of
  the band start** (threshold computed mechanically from the frozen price
  series; price-only; pre-unblinding). \`frac_up(b)\` = fraction of band days
  that are up-days must lie in **[0.20, 0.80]**. Outside → band is
  degenerate (all-up or all-flat): mechanically excluded, logged.
  [Rationale: the original fixed +20% daily threshold excludes every band
  in this era at frac_up = 0.00 although 14-day cumulative rises were
  +33.9..+45.5% — the question is not degenerate; the threshold was
  mis-scaled. Package §3-F5.]
- **G2 (null result variance)**: the per-wallet statistic's null IQR under
  §8.2 weights must be **≥ 0.10** on the percentile scale; below → the test
  cannot discriminate; band excluded, logged.

Only (band, horizon) pairs passing G1+G2 enter the analysis. If none pass →
primary outcome \`UNTESTABLE — no informative band\`. NIC outputs are frozen
into the results artifact before unblinding.`,
`## 7. NIC — Null Informativeness Check (price-only, pre-unblinding)

Purpose: refuse to test degenerate questions, and separate era diagnostics
from the primary estimand (F6). The window-degeneracy audit showed the
16-day detection window had **no in-period outcome variance** (every day
≤ 08-18 preceded a ≥20%/14-day rise); the NIC carries that lesson as a
**descriptive era diagnostic (D1)** and an **anti-degeneracy guard
(G2-P)**. Uses ONLY the price series and the frozen day-assignment; wallet
outcomes untouched.

Candidates: bands b ∈ {3d, 7d, 14d} measured back from each eligible
acquisition day; horizons h ∈ {7d, 30d} post-entry, **fixed without D1** —
the primary statistic below consumes no band.

- **D1 — descriptive era diagnostic (F6 re-scope; was gate G1)**: identical
  machinery to the F5 re-specified G1: an "up-day" is a close-to-close
  return ≥ P90 of the trailing 90 daily returns as of the band start
  (frozen price series only, pre-unblinding); frac_up(b) pooled over
  acquisition days; excl construction primary, incl sensitivity.
  **D1 is reported, not gating**: outputs are frozen into the results
  artifact (nic.g1_descriptive) and feed no decision. **Binding disclosure
  (F6): band-day up-variance is absent in this era** — P4 NIC 2026-10-20:
  pooled frac_up 0.00–0.05 across all bands under both constructions
  (trailing-era P90 ≈ 2.9–3.3%/day vs band-day returns −5.6%..+1.5%); the
  era's discriminating signal exists at horizon scale (14d forward
  +33.9..+45.5% through 08-18). The former kill-switch ("no passing pair →
  UNTESTABLE — no informative band") is **removed**: the §9.1 primary
  consumes no band, so a band diagnostic cannot route it to UNTESTABLE.
  After two calibrated threshold failures (F5, F6), further threshold
  search for D1 is threshold-shopping and is prohibited.
- **G2-P — anti-degeneracy guard (F7 Branch P)**: for each eligible wallet
  w, let D_w be the **exact marginal null distribution of a single
  day-position** on the A_w grid: P(D_w = i/(|A_w|−1)) = q_w(d_i) /
  Σ_{d∈A_w} q_w(d), i = 0..|A_w|−1, with q_w the §8.2 weights. Let
  IQR_w = Q_{D_w}(0.75) − Q_{D_w}(0.25), where Q_{D_w}(p) = inf{x on the
  grid : P(D_w ≤ x) ≥ p} (exact generalized-inverse quantile; no Monte
  Carlo, no seeds, fully deterministic). **Gate: min over eligible wallets
  IQR_w ≥ 0.10.** Below → that wallet's assignment null is mechanically
  degenerate → \`UNTESTABLE — degenerate assignment null\` (logged, wallet
  identified). The per-wallet k-draw null IQRs (§8.2 machinery, B_w
  draws) remain **reported (descriptive)** in the results artifact; they
  no longer gate. Rationale (F7): the k-draw mean contracts the null
  spread ∝ 1/√k, so the original min-over-wallets reading failed exactly
  the two highest-support wallets (k=6: 0.078; k=5: 0.093) — the most
  discriminative ones — inverting G2's stated rationale; the marginal
  distribution is the wallet's actual assignment mechanism and is
  support-size independent. For k=1 wallets the marginal distribution
  coincides with the original null (all 43 such wallets ≥ 0.200 on the
  frozen 2026-10-20 artifact).
  - **Binding qualification Q1 (threshold provenance).** The 0.10 floor is
    **structurally and purposively justified, not empirically derived**: it
    is carried over unchanged from the original §7 gate for pre-registration
    continuity, as a minimal non-degeneracy floor (the middle 50% of the
    wallet's day-position null must span ≥ 0.10 of the [0,1] percentile
    scale ≈ 1.5 grid steps on the 16-day grid). No empirical optimization
    or calibration supports it; it is not claimed to be empirically
    optimal. Any post-hoc threshold re-derivation is threshold-shopping
    and prohibited.
  - **Binding qualification Q2 (non-sufficiency).** Passing this floor
    establishes non-degeneracy only. An IQR of 0.10 on the 16-day grid
    corresponds to roughly **two distinct day-positions** of interquartile
    spread; **two day-positions do not establish scientific sufficiency**
    of the design, detectability of the primary effect, or any strategy
    property. Passing G2-P must not be cited as evidence of discriminative
    adequacy beyond the floor's literal content. Q1 and Q2 are binding
    text and must be reproduced verbatim in every results artifact's
    interpretation fields.

The analysis is band-free: the primary (§9.1) and the population primary
(§9.3) enter with the full eligible population and fixed horizons 7d/30d;
no (band, horizon) selection gates them. NIC outputs — the D1 table, the
G2-P table (all 49 IQR_w values), the legacy per-wallet k-draw IQRs, and
ESS_w — are frozen into the results artifact before unblinding.`);

// ---------- R5: §13 skeleton ----------
rep('R5 §13 skeleton',
`nic:         {bands, g1, g2, passed_bands, degenerate_bands}`,
`nic:         {g1_descriptive, g2_guard_marginal, g2_marginal_iqr_min,
             g2_pass, legacy_g2_kdraw_iqr, degenerate_wallets}`);

// ---------- R6: §14 references ----------
rep('R6 §14 references',
`- \`docs/experiments/gate-0c-redline-review-package-2026-10-20.md\` — F1–F5
  evidence and dispositions (§4.4).`,
`- \`docs/experiments/gate-0c-redline-review-package-2026-10-20.md\` — F1–F5
  evidence and dispositions (§4.4); §8 addendum registers F6/F7.
- \`docs/experiments/gate-0c-nic-2026-10-20.md\` (+ JSON sidecar) — frozen
  P4 FAIL artifact, independently verified 2026-10-21 (188/188).
- \`docs/audits/gate-0c-implementation-review-2026-10-21.md\` — independent
  implementation review; finding: the reported v1.1 implementation had no
  persisted artifacts; basis for this re-derivation.
- \`docs/experiments/gate-0c-amendment-v1.1-draft-2026-10-21.md\` (+ .patch)
  — this amendment's record and reviewable diff (DRAFT, not applied).`);

// ---------- post-edit integrity checks ----------
const markers = [
  ['NOT APPLIED', 3], ['Branch P', 5], ['Branch Q', 3], ['Q1', 4], ['Q2', 4],
  ['G2-P', 6], ['g1_descriptive', 2],
];
let warn = 0;
for (const [m, want] of markers) {
  const n = src.split(m).length - 1;
  const flag = n === want ? '' : '  <-- UNEXPECTED';
  if (n !== want) warn++;
  console.log(`marker "${m}": ${n} (expected ${want})${flag}`);
}
const s7 = src.slice(src.indexOf('## 7.'), src.indexOf('## 8.'));
const op7 = (s7.match(/If none pass/g) || []).length;
const ks7 = (s7.match(/UNTESTABLE — no informative band/g) || []).length;
console.log(`operative "If none pass" occurrences inside §7: ${op7} (required 0)`);
console.log(`kill-switch phrase occurrences inside §7: ${ks7} (required 1 — the removal disclosure)`);
if (op7 !== 0 || ks7 !== 1) { console.error('FATAL: kill-switch not properly removed from §7'); process.exit(1); }
console.log(`historical kill-switch mentions total: ${(src.match(/UNTESTABLE — no informative band/g) || []).length} (expected 2: §7 removal disclosure + §4.4 F5 record)`);
if (warn > 0) console.log(`NOTE: ${warn} marker count(s) differ from hand count — inspect output above before use`);

fs.writeFileSync(TMP, src);
console.log('\nwrote proposed amended prereg (TEMP):', TMP);
console.log('amended sha256:', sha(src));
console.log('original prereg untouched (sha256 still', sha(fs.readFileSync(PREREG, 'utf8')), ')');
