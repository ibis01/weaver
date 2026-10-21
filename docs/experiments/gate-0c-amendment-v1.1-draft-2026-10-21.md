> **RECONCILIATION UPDATE — 2026-10-21.** This review was authored before
> the recovery commit (f86d19f). The artifacts it describes as missing
> were subsequently recovered. The verifier confirms 416/416 checks.
> **EXECUTION STATUS UPDATE — 2026-10-21.** The "DRAFT — NOT APPLIED —
> NOT EXECUTED" wording above was accurate at the time this file was
> committed. The amendment was subsequently applied and executed, and
> the results were committed in `gate-0c-nic-2026-10-21-v1.1.json` and
> `.md`. The recovery commit (f86d19f) restored those artifacts after
> they were omitted from a prior commit. The independent verifier now
> confirms 416/416 checks against the committed bytes.

---

# Gate 0c — Amendment v1.1 Re-Derivation Record

> **STATUS: DRAFT — NOT APPLIED — NOT EXECUTED. Review gate pending.**
> This record and its patch propose an amendment to
> `docs/experiments/gate-0c-skill-test-preregistration-v1.md`. **The prereg
> is unmodified** (sha256 `85468ac76b37c20b…` re-verified after generation);
> the frozen P4 FAIL artifacts are unmodified (`e064f625…` / `07cb0ffc…`);
> no amended P4 execution has occurred and none is authorized until the
> review gate passes. Drafted 2026-10-21.

## 0. Provenance and disclosure — why "re-derivation"

The 2026-10-21 independent implementation review
(`docs/audits/gate-0c-implementation-review-2026-10-21.md`) established that
the previously reported "Amendment v1.1" implementation left **no persisted
artifacts** — no amendment text, no patch, no amended P4 artifact, nothing in
any commit or reachable stash. Per the review directive, the amendment is
therefore **re-derived as a new draft for review, not applied**. Every piece
of operative wording below is newly drafted; nothing is claimed to be the
lost 2026-10-20 wording. Deviations between this reconstruction and the
owner's intent must be resolved at the review gate **before** application.

Evidence base:

- **E1 — redline package §8 addendum** (persisted): F6 options (i)/(ii)/(iii)
  with (ii) specified as "G1's band table becomes a descriptive era
  characterization (reported, not gating); the kill-switch is removed from
  the band-free primary; horizons … fixed without G1; disclose that band-day
  up-variance is absent in this era"; F7 options (a)/(b)/(c) and the
  structural observation that the min-reading "penalizes precisely the
  wallets whose nulls are tightest, i.e. most discriminative", inverting
  G2's rationale. A third G1 threshold re-specification is explicitly
  excluded as threshold-shopping.
- **E2 — frozen P4 FAIL artifact** (persisted, independently verified
  188/188 on 2026-10-21): G1 pooled frac_up (excl) 3d/7d/14d =
  0.0000/0.0000/0.0538 (incl: 0.0000/0.0000/0.0400), all outside [0.20,
  0.80]; G2 k-draw null IQR min **0.0778** (k=6 wallet), next 0.093 (k=5),
  median 0.267, all 43 k=1 wallets ≥ 0.200; ESS_w 6.04–6.45, fallback
  never fires; verdict `P4 FAIL`, passing pairs `[]`.
- **E3 — reviewer directive (2026-10-21)**, six points: preserve the original
  preregistration and FAIL artifact; reconstruct the approved F6 redline and
  F7 Branch P wording from the audit evidence; explicitly disclose that
  `0.10` is structurally and purposively justified, not empirically derived,
  and that two day-positions do not establish scientific sufficiency; retain
  Branch Q as the documented alternative and record why Branch P was
  selected; produce a reviewable patch and amendment record before any new
  P4 execution; require independent verification of the amended
  specification and new artifact before the freeze and lock stages.
- **E4 — reviewer characterization of the lost implementation** (uncertified,
  reported only): F6 "Appropriate separation of era diagnostics from the
  primary estimand"; F7 "Branch P selected — explicit anti-degeneracy guard,
  with the threshold limitation disclosed"; "the minimum exact marginal IQR
  … exceeds the specified floor" (a **reported** result with no artifact —
  it is not treated here as evidence).

**Reconstruction status:** the branch labels (F6 option letters; Branch P/Q)
originate in the package addendum and the lost conversation; the G2-P
mathematical definition below is a reconstruction from E4's phrase "exact
marginal IQR" plus E1's structural observation, and is flagged for owner
confirmation (review question RQ1). The G1→D1 re-scope is a direct
instantiation of E1 option (ii) and requires no mathematical invention.

## 1. F6 disposition — G1 reclassified as descriptive (D1)

Choice: package option **(ii)**. Proposed §7 text (verbatim in patch hunk 4):

- The former gate G1 becomes **D1 — descriptive era diagnostic**: identical
  machinery (up-day := close-to-close return ≥ P90 of the trailing 90 daily
  returns as of the band start; pooled frac_up; excl primary, incl
  sensitivity), **reported, not gating**; outputs frozen into the results
  artifact (`nic.g1_descriptive`) and feed no decision.
- **Binding disclosure:** band-day up-variance is absent in this era
  (E2 numbers); the era's discriminating signal exists at horizon scale.
- The kill-switch ("no passing pair → `UNTESTABLE — no informative band`")
  is **removed**: the §9.1 primary consumes no band, so a band diagnostic
  cannot route it to UNTESTABLE. This is the E1 "kill-switch scope flaw"
  repair and realizes E4's "separation of era diagnostics from the primary
  estimand".
- After the two calibrated threshold failures (F5, F6), further threshold
  search for D1 is prohibited as threshold-shopping (E1 rule, made
  normative).
- Horizons 7d/30d are fixed without D1; the analysis is band-free.

## 2. F7 disposition — Branch P: the G2-P exact-marginal anti-degeneracy guard

**Definition (reconstructed; RQ1).** For each eligible wallet w, let D_w be
the exact marginal null distribution of a **single day-position** on the A_w
grid: P(D_w = i/(|A_w|−1)) = q_w(d_i)/Σ_{d∈A_w} q_w(d), i = 0..|A_w|−1, with
q_w the §8.2 weights (leave-self-out crowd weights + 0.25). Let
IQR_w = Q_{D_w}(0.75) − Q_{D_w}(0.25) with the exact generalized-inverse
quantile Q_{D_w}(p) = inf{x on the grid : P(D_w ≤ x) ≥ p} — no Monte Carlo,
no seeds, fully deterministic. **Gate: min over eligible wallets IQR_w ≥
0.10.** Failure → `UNTESTABLE — degenerate assignment null` (logged, wallet
identified).

Why this repairs the F7 defect rather than re-locating it: the original gate
measured the IQR of the **k-draw mean**, which contracts ∝ 1/√k; the
min-reading then failed exactly the two highest-support wallets (k=6: 0.078,
k=5: 0.093 — E2), inverting G2's stated rationale. The marginal distribution
is the wallet's actual assignment mechanism; its spread is a property of the
design, independent of support size. For k=1 wallets D_w coincides with the
original null (all 43 ≥ 0.200 in E2 — consistent with the guard's intent).

Scope discipline: the legacy per-wallet **k-draw null IQRs remain reported
(descriptive, non-gating)** — continuity with the frozen artifact is
preserved and **no §8 null-model machinery changes**. The guard itself is
seed-free, which strengthens §12 recount (an exact quantity, verifiable
without PRNG reproduction).

**The two binding qualifications (verbatim in §7; normative, not notes):**

- **Q1 (threshold provenance).** The 0.10 floor is *structurally and
  purposively justified, not empirically derived*: carried over unchanged
  from the original §7 gate for pre-registration continuity, as a minimal
  non-degeneracy floor (middle 50% of the wallet's day-position null spans
  ≥ 0.10 of the [0,1] percentile scale ≈ 1.5 grid steps on the 16-day
  grid). No empirical optimization or calibration supports it; it is not
  claimed to be empirically optimal. Post-hoc threshold re-derivation is
  threshold-shopping and prohibited.
- **Q2 (non-sufficiency).** Passing the floor establishes non-degeneracy
  only. An IQR of 0.10 on the 16-day grid corresponds to roughly **two
  distinct day-positions** of interquartile spread; **two day-positions do
  not establish scientific sufficiency** of the design, detectability of
  the primary effect, or any strategy property. Q1 and Q2 must be
  reproduced verbatim in every results artifact's interpretation fields.

These implement E3 point 3 and the reviewer's statistical-boundary paragraph
(no claim of empirical optimality; no claim of sufficiency; no claim about
the primary effect or trading edge).

## 3. Branch Q — documented alternative (not selected)

**Definition** (package F7 options (a)+(b) combined): population-level guard
— median over eligible wallets of the per-wallet k-draw null IQR (option a),
optionally refined to the §8.3 population-null IQR (option b). On the frozen
2026-10-20 numbers the median is **0.267 ≥ 0.10**, so Branch Q would pass
without any new gate machinery (option (b) needs one further offline
computation).

**Why Branch P was selected over Q** (recorded per E3 point 4):

1. The primary estimand is per-wallet (§9.1 e_w feeds every p_w; §9.3 T
   counts wallets with p_w < 0.05). A wallet with a degenerate null yields an
   uninterpretable p_w regardless of the population median; a median guard
   tolerates up to half the wallets being degenerate. The anti-degeneracy
   property must hold per wallet.
2. Branch Q re-locates the threshold to a friendlier summary statistic
   rather than repairing the √k contraction that F7 identified — uncomfortably
   close to the threshold-shopping pattern registered at F6.
3. Branch Q keeps a Monte-Carlo, seed-dependent quantity inside a gate that
   can be exact and seed-free; Branch P makes the gate deterministic and
   independently verifiable at zero machinery cost.

**Retention:** Branch Q is the pre-approved fallback if the review gate
rejects Branch P (question RQ3); option (c) "keep min → FAIL" remains the
do-nothing baseline that the global review may still choose instead of any
amendment.

## 4. Change register and unchanged-by-design list

| Hunk | Location | Change |
|---|---|---|
| 1 | header changelog | v1.1 re-derivation disclosed (DRAFT — NOT APPLIED, NOT EXECUTED) |
| 2 | §1 P4 bullet | re-derivation note; frozen FAIL remains the last executed NIC; no amended execution |
| 3 | §4.4 (after D1 entry) | v1.1 disposition block: F6 → (ii); F7 → Branch P; Branch Q documented + selection rationale |
| 4 | §7 | full rewrite: D1 descriptive (kill-switch removed, binding disclosure, threshold-shopping ban) + G2-P with Q1/Q2 binding qualifications + band-free analysis statement |
| 5 | §13 skeleton | `nic:` fields → g1_descriptive, g2_guard_marginal, g2_marginal_iqr_min, g2_pass, legacy_g2_kdraw_iqr, degenerate_wallets |
| 6 | §14 references | NIC artifact, implementation review, amendment record (+ patch) added |

**Unchanged by design** (reviewer's "statistical machinery unchanged"
boundary): §4 population and support tiers; §5 window, day assignment, D1
interpolation disclosure; §6 data prerequisites and anchors; §8 null models
in full (Options A/B weights, ESS, §8.3 joint permutation, S1–S3, §8.4 draw
counts and seed discipline, §8.5 gates); §9 statistics; §10 decision rules;
§11 sham-run; §12 determinism and recount; §13 other skeleton fields. The
frozen FAIL artifact pair is referenced, never altered.

## 5. Amended P4 execution protocol (ONLY after the review gate passes)

1. **Application:** apply the patch to the prereg (commands in §6), verify
   the amended file's sha256 equals `36201d78c588b952…`; the amendment
   record + patch enter the review record; **still nothing is committed**
   (commit happens only at the docs-commit stage, on current `main`).
2. **New artifact identity:** `docs/experiments/gate-0c-nic-<execution-date>-v1.1.md`
   + JSON sidecar. The frozen 2026-10-20 FAIL pair is never touched; its
   fingerprints (`e064f625…` / `07cb0ffc…`) must still hold afterwards.
3. **Inputs:** the same four frozen anchors, hash-verified at execution
   (v2 blob `73024f5f…`, v5 jsonl `3ab1a0a3…`, entry-blocks `6b4f2535…`,
   price `ae47b4e7…`).
4. **Computations:** D1 table (must reproduce the frozen artifact's G1
   numbers **exactly** — machinery unchanged; any difference is an
   incident); G2-P IQR_w for all 49 wallets (deterministic, seed-free);
   legacy k-draw IQRs under the same provisional-seed convention as the
   frozen run (comparability); ESS_w unchanged.
5. **Independent verification:** extend
   `scripts/aw-nic-verify-frozen.js` (the 188/188 read-only verifier) to a
   v1.1 verifier: independent reimplementation of the generalized-inverse
   marginal IQR, all 49 wallets; assertion that D1 == frozen G1 and legacy
   table == frozen artifact table; no writes to any artifact path.
6. **Disclosure requirements:** Q1/Q2 verbatim; the F6 era disclosure
   verbatim; provenance note citing this record and the approving review;
   no wallet-level outcome statistic (pre-unblinding, as before).

## 6. Review-gate checklist and patch verification

Questions for the owner/reviewer before application:

- **RQ1** — Does the G2-P definition match the intended "exact marginal
  IQR"? Alternatives considered: (a) as defined (generalized-inverse
  quantiles on the exact discrete distribution); (b) type-7-interpolated
  quantiles instead (reported as a sensitivity either way); (c) marginal of
  the k-draw mean — rejected, that is exactly the √k-contracted quantity F7
  flagged.
- **RQ2** — Severity confirmed: single wallet below floor → UNTESTABLE
  (mirrors the original min-reading; the failure route is hard, no
  wallet-dropping option is offered)?
- **RQ3** — Branch Q approved as the documented fallback?
- **RQ4** — Q1/Q2 wording approved as binding text (verbatim)?
- **RQ5** — Legacy k-draw IQR reporting (descriptive, non-gating) approved?

Patch verification (verified 2026-10-21; reproducible):

- `patch -p1 --dry-run < gate-0c-amendment-v1.1-draft-2026-10-21.patch` —
  clean; real apply + `cmp` against a pristine copy reproduced the proposed
  file **byte-for-byte** (round-trip verified during generation).
- Regenerator (deterministic, anchored, refuses ambiguity):
  `node scripts/aw-nic-amend-draft.js` — asserts the baseline sha256 before
  editing and writes only to a temp path.

## 7. Fingerprints and state (2026-10-21)

| Object | sha256 / state |
|---|---|
| Baseline prereg (unmodified) | `85468ac76b37c20b0db53581abc0ae395e93dd1730f19d43a05ed9051a04b6f1` |
| Amendment patch (this draft) | `200531e9001958ae4bebbdbfaa3b4b6c1864e17a52e2c63c24467a5d09572592` (195 lines, +123/−27, 6 hunks) |
| Proposed amended prereg (realized only on approval) | `36201d78c588b9523c5ece3e38cd22ddb5da18ad969379da891c7e2247db7fc7` (667 lines) |
| Frozen P4 FAIL json / md | `e064f625bb8efefa…` / `07cb0ffcd25ce446…` (must remain) |
| Redline package (unmodified) | `501eae9154cd2add…` |
| Baseline verifier | `scripts/aw-nic-verify-frozen.js` — 188/188, exit 0 |
| Amendment generator | `scripts/aw-nic-amend-draft.js` — deterministic, temp-only writes |
| Git / execution state | nothing committed; no amended P4 execution; confirmatory run blocked |
