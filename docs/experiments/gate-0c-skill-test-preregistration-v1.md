# Gate 0c — Chance-Benchmark Skill Test: Preregistration v1

> **STATUS: DRAFT v1 — PENDING ACTIVATION.** Uncommitted. This document becomes
> binding only when §1 preconditions P1–P4 pass and the file is committed (its
> commit SHA becomes `LOCK_SHA`). No outcome exists: the only pre-lock
> executions are the informational previews and the P4 NIC (feasibility-only;
> its null draws feed no result). No wallet-level outcome computation has
> occurred. Drafted 2026-10-19.
>
> **Changelog (pre-lock, disclosed):** amended 2026-10-20 per the red-line
> review (`docs/experiments/gate-0c-redline-review-package-2026-10-20.md`):
> flags F1–F5 resolved at draft, dispositions in §4.4. P4 NIC executed
> 2026-10-20 (status recorded in §1; verdict FAIL — package addendum §8,
> flags F6/F7 registered, not applied). Previews and the NIC were
> informational and used committed blobs + the frozen price series only; no
> outcome computation has occurred, before or since. Amendment v1.1
> re-derived 2026-10-21 as DRAFT — NOT APPLIED, NOT EXECUTED (review gate
> pending): F6 → option (ii) G1 descriptive; F7 → Branch P exact-marginal
> anti-degeneracy guard; Q1/Q2 binding qualifications; Branch Q documented
> alternative. See docs/experiments/gate-0c-amendment-v1.1-draft-2026-10-21.md.

- **Supersedes**: nothing (first Gate 0c prereg). Sits downstream of
  `docs/audits/gate-0b-research-state-reconciliation-2026-10-17.md` (r7) and the
  2026-10-18 decision to stop patching the control-population program.
- **Design lineage**: Approach C chance benchmark (session 2026-10-18) →
  Bayesian hierarchy layer (session 2026-10-18) → three-layer method review
  (session 2026-10-19); all three are resolved into the single prereg below.
- **Governing rule**: every layer is built only on verified prerequisites
  (six-stage plan: reconcile → data audit → freeze populations → prereg → run …).

## 1. Activation preconditions

- **P1 — Gate 0b closes.** r7 finalized and committed: recount PASS recorded;
  SHA ledger (script blob `120c49f1…`, v2.json blob `73024f5f…`; 12m artifact
  blob `64df6b71919286a24ed13707e3e4abafb6d0d2d8`, recovered from the object
  store, data commit `d2e5d8b` — its JSON-inclusion fix is part of the docs
  commit, reconciliation doc r7 §5.4); C5 arithmetic
  (fromPair 136 buys / 92 days = 1.48/day < 30% floor → §7-P3 confirmed empty
  by data); incident register including both halves of the 12m-artifact
  recovery sweep (sandbox: exhausted, artifact never present — §6.3;
  user machine: **resolved 2026-10-20** — per-wallet artifact recovered,
  aggregates match the pre-loss transcript on all four recorded dimensions
  and the committed 3-month artifact's Jul–Sep `tAI`/`tFP` exactly;
  reconciliation doc r7 §5.4).
- **P2 — Population freeze committed.** `data/pepe-buyer-list/v2.json`
  (git blob `73024f5f5e4b6dc67125fd674e30c9c1b8499c40`), plus:
  (P2a) ascertainment premise verified from attribution spec v1.5 and recorded
  (§3.2); (P2b) stale spec pointer inside v2.json corrected (v1.3 → v1.5 run
  reference) and the blob SHA re-recorded; (P2c) window cross-check recorded —
  every in-window anchor timestamp lies on `d_det..d_det+15` and the `v2.json`
  `window`-metadata conflict is registered (§4.1, §5).
- **P3 — Price series secured.** `data/prices/pepe-usd-daily-365d.json` +
  provenance sidecar, validated. **Satisfied in this clone 2026-10-19** (§6.1).
  A user-machine re-fetch is unnecessary (public market data); if performed,
  its provenance appends to the sidecar.
- **P4 — NIC executed** (price-only, §7) and the passing band list fixed
  before any wallet-level outcome computation.
  **Executed 2026-10-20 (pre-lock, offline):** artifact
  `docs/experiments/gate-0c-nic-2026-10-20.md` (+ JSON sidecar; inputs
  hash-verified; 65 confirmed acquisitions / 49 eligible wallets, 0
  per-wallet cross-check mismatches vs `v2.json`; 27/27 anchors on
  `d_det..d_det+15`; both horizons covered; exact ESS_w 6.04–6.45,
  fallback never fires — §8.2's 5.4–6.3 was the package's preview
  estimate). **Verdict: FAIL — no passing (band, horizon) list exists as
  specified.** G1: the F5 re-specified P90 trailing-90d threshold yields
  pooled frac_up 0.00–0.05 across all bands (trailing-era P90 ≈
  2.9–3.3%/day vs band-day returns -5.6%..+1.5%) — the era property
  survives the re-specification. G2: min per-wallet null IQR 0.078 <
  0.10 under the strictest (min-over-wallets) reading; median 0.267
  passes — reading ambiguity registered as F7. Resolution required at
  draft before any lock (package §8 addendum, flags F6/F7); no outcome
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
  until the review gate passes.

**Lock protocol.** After P1–P4 this file is committed; `LOCK_SHA` = its commit
SHA; all seeds derive from `LOCK_SHA` (§8.4). No outcome computation before
`LOCK_SHA` exists. Any post-lock change requires a new prereg version that
discloses this one.

## 2. Background, design turn, and disclosures

### 2.1 Why the control-population program was replaced

The control-population line (matching traced wallets to comparison wallets) is
structurally — not incidentally — unable to produce a decisive test here. Any
candidate control set is (i) contaminated (shares the behavior under test),
(ii) non-comparable (differs on the ascertainment channel), or (iii) obtainable
only by new gated extraction that re-opens selection on unobservables. Each
patch moved the failure somewhere else; the 2026-10-17 falsification (exchange
contamination in control-2, activity-regime mismatch) and the C5 arithmetic
(§7-P3 empty) closed every remaining P3 candidate. The program is therefore
replaced by a **chance benchmark**: each wallet is tested against its own
counterfactual entry-day distribution built by constrained resampling, and the
population is tested jointly so cross-wallet dependence (herding) is preserved
rather than assumed away.

### 2.2 Exploratory finding (disclosed; excluded from evidence)

The committed audit
`docs/audits/exploratory-entry-timing-comparison-2026-10-15.md` found treatment
wallets entering **later** than the comparison series (headline statistics
0.042 vs 0.375, p ≈ 0.0215, as defined in that audit). Consequences locked
here: (i) the primary test is **two-sided** — the lower tail is a decision-grade
inverse signal, not a nuisance; (ii) the confirmatory model's prior is centered
on no-skill, not on the exploratory direction; (iii) this result is not
evidence inside Gate 0c.

### 2.3 Unprovenanced claims excluded

Activity statistics quoted during method discussion (median 7, p75 25, max 453
buys) have no committed provenance and contradict the committed artifacts (65
confirmed acquisitions, median ≈ 1 per wallet; pool-total anyIn = 380 across
the 3-month window). They are excluded from the evidence base unless a
committed artifact establishes them.

## 3. Design decisions — the 2026-10-19 three-layer review, resolved

| Proposal | Verdict | Disposition |
|---|---|---|
| Shuffle test / exchangeability gating (L1) | **ADOPTED** | It *is* the chance benchmark; formalized as §7 NIC + §8.5 null diagnostics |
| Stratified bootstrap (L1) | ADOPTED, descriptive only | Sampling variability of T by channel stratum (§9.5); never decision-bearing |
| Conditional permutation, within-regime (L2) | **ADOPTED — primary per-wallet null** | Option B §8.2: leave-self-out population day weights = regime-normalized-v1 §2 `baseline(d)` rebuilt as a permutation |
| MBB, 14-day overlapping blocks (L2) | REJECTED as specified; day-level kernel retained | Median 1 event/wallet = no within-wallet series to block-resample (decisive regardless of window length; window corrected to 16 days per F4); herding handled by §8.3. Day-clustered resampling kept as sensitivity S3 |
| DML / ATTE with cross-fitting (L2) | PARKED | n = 49; no measured confounder set; cross-fitting folds ≈ 37 units → nuisance stages are noise; Neyman orthogonality does not rescue a garbage first stage. Revisit at ≥ 300 scored wallets with extracted features |
| Matched-cohort empirical placebo (L3) | **REPLACED by sham-run placebo (§11)**; empirical form deferred | Decision record §3.1 |
| Conformal prediction (L3) | DEFERRED | Production scoring intervals ("users" stage); prediction interval ≠ skill estimand; needs a labeled calibration set that does not exist pre-run |
| Dirichlet-process prior (L3) | DEFERRED | Cluster structure weakly identified at 49 wallets × median 1 event; spike-and-slab gives 2 interpretable parameters and nests the null at θ = 0. Revisit at ≥ 200 wallets or median ≥ 5 events/wallet |
| PELT changepoint (L3) | DEFERRED (extension) | Regime segmentation for day weights; vacuous here — the population occupies a single regime (the qualifying segment runs 08-08..08-18; F4) |
| Activity-stratified prior sensitivity (review addition) | ADOPTED | §9.5 |
| Split-half replication (review addition) | ADOPTED | §9.5 |

### 3.1 Matched-cohort placebo: decision record

The empirical matched-cohort placebo cannot be built for Gate 0c v1: the Weaver
population **is the complete traced buyer set**, so no non-selected buyer pool
exists to draw matched placebo cohorts from. Any placebo cohort would have to
be (i) the same wallets (circular), (ii) the excluded INTERMEDIARY/UNRESOLVED
channels (not confirmed buyers), or (iii) a new gated extraction that re-opens
selection on unobservables — the exact structural loop the control-population
program died of.

The legitimate core of the proposal — a known-answer negative control that
catches a broken pipeline — is delivered at zero data cost by the **sham-run
placebo (§11)**, plus the population-level day-permutation null (§8.3), which
is the Weaver-equivalent of the placebo question.

The Convexly precedent is adopted for its correct lesson (known-answer controls
and paired replication are valuable) and rejected for its dangerous one: a
rescue test added after a preregistered test fails is the forking-paths loop
that produced the original structural failure. If an empirical placebo is used
later (e.g., pattern-engine subset scoring), it must be preregistered **before**
treatment outcomes, with a mechanical abort rule: placebo detection rate within
its own null's 95% envelope, else the scoring pipeline is invalidated.

### 3.2 Ascertainment premise (frozen; verified at P2a)

The 49-wallet population is the complete traced buyer population of the
attribution run: wallets entered by **being buyers**, not by entry-timing rank;
channels (DIRECT_ORIGINATOR / TRACED) are evidence-provenance classes, not
timing-selection criteria. P2a verification: confirm from spec v1.5 and the
v2.json construction that enumeration is independent of timing ranking, and
record the verification quote in the freeze commit. If verification fails, the
primary outcome is `UNTESTABLE — ascertainment-dependent` (mechanical).

## 4. Population (frozen at P2)

### 4.1 Source and composition

- `data/pepe-buyer-list/v2.json` — 49 buyer wallets carrying **65 confirmed
  acquisitions** (30 DIRECT_ORIGINATOR + 35 TRACED_ECONOMIC_RECIPIENT;
  per-tx recount matches `v2.buyers[].confirmed` 49/49) plus 5 buyer-wallet
  UNRESOLVED records with per-tx evidence (Σ classifiedTxs = 70). The
  run-wide total of 189 acquisition records (across 1,132 candidates,
  including 48 INTERMEDIARY + 71 UNRESOLVED aggregate-only) describes the
  acceptance run, not this population. [F3 tightened]
  `unresolvedPct` 40.21 (documented ceiling-fail context,
  v5-unresolved-breakdown audit). Median confirmed acquisitions per wallet
  = 1 (distribution 43×1, 2×2, 1×3, 1×4, 1×5, 1×6).
- **Detection window (authoritative; F4 corrected)**: blocks
  **[25710000..25820000] = 2026-08-08 through 2026-08-23 (16 calendar
  days)** — per the committed window-degeneracy audit and anchor calibration
  (27 entry-blocks v1 `(firstBlock, firstTimestamp)` pairs → 7,173
  blocks/day; 110,000 blocks ≈ 15.3 days). `v2.json`'s `window` metadata
  field ("2026-08-12".."2026-08-19") contradicts the block range used by
  the same artifact; recorded as a metadata conflict at the P2 freeze
  (metadata fields are not authoritative). Acquisition mass occupies
  2026-08-12..18 (day histogram 5/10/4/6/15/9/16); days 08-08..11 and
  08-19..23 carry zero mass.
- Per-transaction evidence: `data/audit-records/pepe-buyer-audit-v5.jsonl`
  (1,132 candidates; `txHash`/`blockNumber`/`amountRaw`/`quote_token`;
  all 65 confirmed acquisitions inside the window, 0 outside — the only
  per-tx source; carries block numbers only, so UTC-day assignment uses the
  anchor-interpolated map of §5, disclosed there).
- Anchors: `data/entry-blocks/v1.json` (firstBlock/firstTimestamp/inCount per
  wallet; cached; **no RPC during analysis**).

### 4.2 Exclusions and support tiers (mechanical; every count reported)

1. INTERMEDIARY / UNRESOLVED channels (not confirmed acquisitions).
2. Acquisitions on days outside the price series (unpriceable). The
   2026-10-11 calibration audit measured a 29% unpriced precedent — the
   realized rate is reported against it. (Preview: the frozen series covers
   the entire window; expected unpriceable = 0.)
3. **Support tiers (no exclusion; F1 re-scoped).** Wallets with < 5 distinct
   eligible acquisition days are registered `thin-support`; their per-wallet
   statistics are reported in the thin tier of every descriptive table
   (§9.2, §9.5, BH family) and never silently dropped. Preview fact
   (r7 §5.5; package E2): distinct-day distribution is 45×1, 3×2, 1×4 —
   the whole population is thin-support, which is exactly why the
   population-level primary (§8.3, §9.3) and the hierarchy (§9.4) are the
   decision quantities while per-wallet results stay descriptive.
4. Wallets left with zero eligible acquisitions (dropped, counted).
5. **Minimum-N rule (population-counted)**: fewer than 15 eligible wallets
   (eligible = ≥ 1 priceable confirmed acquisition) → primary outcome
   `UNTESTABLE — population insufficient` (mechanical; no rescue
   reclassification). Preview: 49 expected eligible.

### 4.3 Test multiset

D = the multiset of all confirmed acquisition days of eligible wallets
(wallet-attributed, one entry per acquisition). Every null construction
preserves each wallet's count k_w within D.

### 4.4 Pre-activation review flags (registered 2026-10-20, pre-lock)

Recorded before any freeze so the red-line review resolves them with full
knowledge. No flag uses outcome information — none exists; the counts are
data-inventory facts from committed blobs (reconciliation doc r7 §5.5) and,
for F4/F5, the frozen price series. The spec above stood unchanged by F1–F3
until the dispositions at the end of this subsection amended it at draft
stage (binding at commit per §1).

- **F1 — §4.2 rule 3 vs the population it will govern.** Confirmed
  acquisition support is 65 across 49 wallets (median 1, max 6). Distinct
  acquisition days: max 4; zero wallets reach 5. The window-length reading
  of "|A_w| < 5 distinct days" reaches 5 for 2 of the 13 anchor-covered
  wallets only. **Under every reading, rule 5 (minimum-N 15) fires: as
  drafted, the run outputs `UNTESTABLE — population insufficient`.** The
  review must either (a) re-scope rule 3 to what the population-level
  primary needs (the per-wallet family is already descriptive-only;
  §9.4's hierarchy was designed for median-1 support; §9.5's strata
  already split k=1 vs k≥2), or (b) accept the mechanical UNTESTABLE as
  the outcome of record, or (c) shelve v1 at draft. Rule 3's notation
  itself is ambiguous (|A_w| is defined in §5 as a date range, not a
  support count) and must be rewritten whichever way the review goes.
  **Robustness (r7 §5.5):** pooled 12-month per-wallet totals from the
  recovered artifact (16/49 ≥10 anyIn; 5/49 ≥10 fromPair) cap a
  hypothetical full-year per-tx evidence window at roughly 7–9 eligible
  wallets — still below 15; the minimum-N failure is a population
  property, not a window artifact.
- **F2 — §5 `first_seen_w` anchors do not cover the population.**
  entry-blocks v1 treatments are the 27 v1-era wallets (overlap with the
  49-wallet population: 13), and their `firstBlock` is scan-window-scoped
  (first inflow inside the scan window 2026-08-08..23), not first-ever
  inflow. The primary
  window as specified is not constructible from committed data for any
  wallet. Options: a first-ever-inflow anchor extraction (new gated RPC —
  the reconciliation doc §9 Not-authorized territory, requires explicit
  authorization); or a pre-lock re-specification (`first_seen_w :=`
  detection-window start, disclosed as a limitation); or a window-free
  formulation.
- **F3 — §4.1 denominator wording.** "189 acquisition records" is the
  run-wide attribution total (1,132 candidates); the 49 buyer wallets
  carry 65 confirmed acquisitions (per-wallet recount matches
  `v2.buyers[].confirmed` 49/49), plus 5 buyer-wallet UNRESOLVED records
  with per-tx evidence (Σ classifiedTxs = 70). Tighten at review so the
  P2 freeze counts the right denominator.
- **F4 — window day-span (registered 2026-10-20, pre-lock).** The window is
  16 calendar days (2026-08-08..23) per the committed degeneracy audit and
  anchor calibration (7,173 blocks/day over 110,000 blocks) — not the
  8 days / "08-12..19" this draft originally carried, which came from
  `v2.json`'s contradictory `window` metadata field. Corrected throughout
  (§4.1, §5, §7).
- **F5 — §7 G1 mis-scaled (registered 2026-10-20, pre-lock).** With the
  fixed +20% daily threshold, every (band, day) pair fails at
  frac_up = 0.00 (era daily returns −5.6%..+1.5%; the era's signal is
  14-day cumulative, +33.9..+45.5% forward through 08-18). As drafted, P4
  would mechanically output `UNTESTABLE — no informative band`. G1
  re-specified in §7.

**Red-line review dispositions (applied at draft 2026-10-20; binding at
commit per §1 lock protocol; package §3/§5):**

- **F1 → re-scoped.** Rule 3 is a support-tier register (§4.2); minimum-N
  counts eligible wallets (49 expected). Per-wallet granularity is absorbed
  by the population primary (§8.3) and the hierarchy (§9.4).
- **F2 → re-specified.** `first_seen_w` deleted; uniform window
  `A_w := [d_det, d_det+15]` (§5). Gated first-ever-inflow extraction NOT
  required for v1 (r7 §5.5: even full-year evidence caps eligible N ≈ 7–9
  < 15); remains a v2 upgrade path.
- **F3 → tightened** (§4.1): denominators 65 / Σ 70; 189 is run-wide
  context.
- **F4 → corrected** to 16 days throughout; v2.json metadata conflict
  registered at P2 (P2c); v2.json untouched except the planned P2b spec
  pointer.
- **F5 → re-specified** (§7): G1 threshold becomes volatility-calibrated
  (P90 trailing-90d, price-only, pre-unblinding); G2 unchanged.
- **D1 (day assignment) → interpolated + disclosed** (§5): no RPC
  authorization outstanding. Upgrade path before lock: a 4-block gated
  timestamp fetch (metadata-only; blocks 25742511, 25771116, 25778314,
  25742495 — the four acquisitions within 30 min of a UTC midnight) if
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

## 5. Windows and censoring

- Launch day `d_0` = first day with a price in the frozen series (taken from
  the frozen price file, not from memory).
- **Window start (fixed by definition; F2/F4)**: `d_det = 2026-08-08` — the
  UTC day of block 25710000, fixed by the committed window-degeneracy audit
  and anchor calibration. The P2 freeze (P2c) cross-checks that every
  in-window anchor timestamp falls on `d_det..d_det+15` and records the
  check.
- **Primary window (uniform)**: `A_w = [d_det, d_det + 15]` for **every**
  wallet — the full 16-day detection window. The original `first_seen_w`
  anchor term is deleted: entry-blocks v1 covers 27 v1-era wallets (13 of
  this population) with scan-window-scoped firsts, not first-ever inflows,
  and cannot honestly anchor any wallet. Disclosed limitation: entry before
  `d_det` is unobservable; the design tests day-position **conditional on
  detection-window purchase** (consistent with §3.2's ascertainment
  premise).
- **Day assignment**: v5 jsonl carries block numbers only; UTC days come
  from a deterministic piecewise-linear block→time map through the 27 anchor
  pairs, frozen as a committed sidecar at P2. Boundary disclosure: 4 of 65
  acquisitions have interpolated times within 30 min of a UTC midnight
  (worst ±28 min); their assignment is interpolated and the §12 recount
  re-derives it. Upgrade path before lock: the 4-block gated timestamp
  fetch (§4.4 D1) if explicitly authorized.
- **Censoring sensitivity (preregistered)**: `A_w+ = [d_det, price_end]`
  (right edge extended to the price frontier). Primary-vs-sensitivity
  disagreement → `INCONCLUSIVE — window-sensitive`.
- Days outside `A_w` are neither drawn by any null nor scored.

## 6. Data prerequisites and provenance

### 6.1 Price series (P3 — satisfied 2026-10-19)

- Endpoint: `GET https://api.coingecko.com/api/v3/coins/pepe/market_chart?vs_currency=usd&days=365&interval=daily`
  (user-approved command, session 2026-10-18).
- Executor: `scripts/fetch-pepe-prices.js` (project-external scripts dir),
  sandbox clone, node v24.21.0; fallback path (auto daily granularity) unused.
- Artifacts: `data/prices/pepe-usd-daily-365d.raw.json` (verbatim HTTP body);
  `…-365d.json` (typed wrapper); `…-365d.provenance.json` (URL, UTC timestamp,
  HTTP status, byte count, SHA-256 of raw body, executor, authorization note).
- Validation: **366 points, 2025-10-20 .. 2026-10-19, 0 non-finite, valid=true**;
  typed-file sha256
  `ae47b4e74167259b75a6d6e589e30fc608d19e6bc30ae72c168c35dea5c0100c`
  (raw-body hash in the sidecar is the deeper anchor).
- Conventions (per the committed 2026-10-11 calibration audit): UTC day
  boundaries; daily close = last price point of the UTC day; close-to-close
  returns; a "≥20% day" = close_t/close_{t−1} − 1 ≥ 0.20.

### 6.2 Frozen analysis inputs (sha256 recorded at freeze)

- `data/pepe-buyer-list/v2.json` — git blob `73024f5f…` (P2b re-records)
- `data/audit-records/pepe-buyer-audit-v5.jsonl` —
  `3ab1a0a3a571423290145a66a8e97c62c0409dda8c45f047ac5a8706089b20bc`
- `data/entry-blocks/v1.json` —
  `6b4f25350793216d4f7240be553f09a7d6f6f1585ffedb34c2ade0f10cf4face`
- `data/experiments/availability-2026-10-17.json` (context only, control side)
  — `1a7a73b9…`

### 6.3 12m artifact incident (r5 cross-reference)

The overwritten 12-month availability artifact is **not recoverable from this
clone**: read-only forensic sweep 2026-10-19T04:35Z
(`scripts/recovery-sweep-12m.sh`, project-external) found zero unreachable
objects, zero dangling blobs, no availability-named trees, the empty blob not
present, and a reflog consisting of a single clone event. Sandbox side is
closed as "never present here"; the user-machine half of the recovery block
was the only recovery surface and is carried in the r6 incident register.
**Resolved 2026-10-20:** the per-wallet artifact was recovered on the user
machine; its aggregates match the pre-loss transcript on all four recorded
dimensions (reconciliation doc r6 §5.4, third pass).
No Gate 0c input depends on the artifact either way.

## 7. NIC — Null Informativeness Check (price-only, pre-unblinding)

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
  degenerate → `UNTESTABLE — degenerate assignment null` (logged, wallet
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
ESS_w — are frozen into the results artifact before unblinding.

## 8. Null models

### 8.1 Preserved structure

Every null preserves each wallet's eligible count k_w and window A_w.

### 8.2 Option B — primary per-wallet null (market-conditional day weights)

`q_w(d) ∝ #{confirmed acquisitions by OTHER eligible wallets on day d} + ε`,
ε = 0.25, for d ∈ A_w. Leave-self-out prevents self-normalization circularity;
this is regime-normalized-v1 §2 `baseline(d)` rebuilt as a permutation.
**Degeneracy guard**: `ESS_w = (Σq)² / Σq²` over A_w; if `ESS_w < 5`, that
wallet falls back to Option A (uniform within A_w), logged. Preview
(package §5): under the uniform window, leave-self-out `ESS_w` ∈ 5.4–6.3
across all observed wallet profiles — the fallback never fires on this
population.

### 8.3 Population-level primary null (joint day-permutation; herding preserved)

Independent per-wallet draws would destroy cross-wallet dependence and make
the null of T anti-conservative. **Primary**: constrained joint re-deal of the
observed acquisition-day multiset D across eligible wallets — permute day
labels and deal k_w days to each wallet, requiring day ∈ A_w(receiver);
rejection sampling, ≤ 10,000 attempts per replicate, acceptance rate logged.
Under the uniform window (§5) every day of D lies in every A_w(receiver):
the constraint is satisfied by construction (acceptance ≈ 100%); the
rejection loop is retained for form and as the guard if windows ever differ
again.

- S1 sensitivity: `A_w+` windows (§5).
- S2 sensitivity: Option A weights in the per-wallet scoring step.
- S3 sensitivity (day-block kernel of MBB): re-deal whole days WITH
  replacement from D (day-clustered bootstrap).

### 8.4 Draw counts and seeds

- Per-wallet nulls B_w = 10,000; `seed_w = uint32(sha256("gate0c:wallet:" +
  address + ":" + LOCK_SHA)[0..7])`.
- Population nulls B_pop = 5,000; `seed = uint32(sha256("gate0c:pop:" +
  LOCK_SHA)[0..7])`.
- One PRNG implementation (xorshift128+), pure Node, no RPC, no network
  during analysis.

### 8.5 Null diagnostics (exchangeability gates)

Before scoring: realized nuisance summaries (k_w, |A_w|, day-of-week mix,
band-day share) must each lie within the corresponding null's [1st, 99th]
percentile. Any violation → HALT, log, investigate exchangeability before
proceeding.

## 9. Statistics

### 9.1 Primary per-wallet statistic — entry-day percentile

`e_w = mean over eligible acquisitions of (d − d_first(A_w)) / (|A_w| − 1)`,
in [0, 1]; 0 = earliest possible day. Two-sided p from the §8.2 null with the
`(count + 1)/(B_w + 1)` convention:
`p_w = min(1, 2 · min(P(e* ≤ e_w), P(e* ≥ e_w)))`.

### 9.2 Secondary statistics (descriptive)

- Entry-price percentile (0 = cheapest day of A_w) — the construct nearest to
  the 2026-10-15 exploratory finding.
- Post-entry returns at NIC-passing horizons (close-to-close).
- Directional labels (early-tail / late-tail vs the wallet's null median).

### 9.3 Population primary

`T = #{w : p_w < 0.05}` under Option B scoring;
`p_pop = (1 + #{T* ≥ T_obs}) / (B_pop + 1)` with T* from §8.3 joint
day-permutation. Tail decomposition T_early / T_late is reported (which side
of each wallet's null median the realized e_w sits on).

### 9.4 Confirmatory — Bayesian hierarchy (replaces the never-fired
`earlyEntryRate ≥ 0.5` gate)

- **L1 (wallet)**: `P(d_i | θ_w) ∝ q_w(d_i) · exp(θ_w · s(d_i))` with
  `s(d) = 2·(L_w − idx(d)) / (L_w − 1) − 1 ∈ [−1, 1]` (positive θ = earlier-
  than-chance preference). **θ_w = 0 exactly reproduces the chance benchmark**
  (built-in calibration property; the two must agree to machine precision).
- **L2 (population)**: spike-and-slab `P(θ_w) = (1−π)·δ_0 + π·HalfNormal(σ)`;
  π = skilled fraction of the population.
- **Inference (no MCMC)**: θ grid [−4, 4] step 0.02 (401 points);
  π grid {0, 0.01, …, 1}; σ ∈ {0.25, 0.5, 1, 2, 4}; priors p(π) ∝ 1,
  p(σ) ∝ 1/σ; deterministic grid marginalization in pure Node
  (`scripts/oneoff/wallet-skill-hierarchy.js`, written at run time to this
  spec — no model code exists pre-lock, by design).
- **Decision quantity**: `P(π > 0 | data)`. Report posterior median π and
  90% interval; directional split `P(Σ_w θ_w > 0 | data)` is descriptive.

### 9.5 Robustness battery (descriptive, pre-specified)

- Activity-stratified prior sensitivity (k = 1 vs k ≥ 2 strata).
- Split-half replication: seeded population split; T and P(π>0) per half;
  agreement = same sign and overlapping intervals.
- Stratum-bootstrap sampling variability of T (channel strata).

## 10. Decision rules (locked)

- **Co-primary agreement rule**: `SKILL-DETECTED` ⇔ `p_pop < 0.05` **and**
  `P(π > 0 | data) ≥ 0.90`. Both fail → `NOT-DETECTED`. Exactly one fires →
  `INCONCLUSIVE — escalation review`; no override, no re-analysis; any
  follow-up requires a new prereg that discloses this one.
- Two-sided reporting with mandatory tail decomposition.
- BH FDR 0.05 on the per-wallet descriptive family only (q-values reported;
  never decision-bearing).
- Null-model sensitivity: primary vs S1/S2 direction disagreement →
  `INCONCLUSIVE — null-model sensitive`.
- Production mapping (recorded; out of scope here): a SKILL-DETECTED outcome
  initiates a separate design doc replacing `earlyEntryRate ≥ 0.5` with
  posterior-π-based scoring.

## 11. Sham-run placebo (pipeline self-test)

Known-answer negative control, executed at lock time **before** any real
outcome computation:

1. `SHAM_SEED = uint32(first 8 hex of sha256(prereg file bytes at lock))`.
2. For each eligible wallet, deterministically reshuffle the observed entry
   days within A_w (uniform, seed SHAM_SEED ⊕ wallet index) — structure
   preserved, signal destroyed by construction.
3. Run the **full unblinded pipeline end-to-end** on the shuffled data
   (NIC → nulls → statistics → hierarchy).
4. **Required outcome**: `p_sham ≥ 0.05` (T_sham below the null T's 95th
   percentile) and the per-wallet p-histogram recorded (approximate
   uniformity; inspected, not gated).
5. **Violation → implementation bug → HALT**: incident-register entry, fix,
   re-run the lock protocol. Reinterpreting a failed sham run is forbidden.

## 12. Determinism and audit

- Pure Node; no RPC; no network during analysis; fixed seeds derived from
  `LOCK_SHA`; a single PRNG implementation.
- Every results artifact carries: script blob SHA, input file SHAs (§6.2),
  `LOCK_SHA`, seeds, B values, node version, UTC timestamps.
- **Recount protocol**: an independent recomputation path (a second entry
  point in the same script family re-deriving T and p_pop from frozen inputs)
  must reproduce T and p_pop exactly; any mismatch is an incident.

## 13. Results artifact skeleton (`data/experiments/gate0c-results-v1.json`)

```
meta:        {lock_sha, prereg_sha256, script_blobs, seeds, node_version, timestamps}
population:  {counts_before, exclusions_by_rule, counts_after, ascertainment_record}
nic:         {g1_descriptive, g2_guard_marginal, g2_marginal_iqr_min,
             g2_pass, legacy_g2_kdraw_iqr, degenerate_wallets}
sham:        {seed, T_sham, p_sham, p_histogram}
per_wallet:  [{address, k, A_w, e_w, p_w, q_w, tail, theta_post}]
population:  {T, p_pop, tail_split, permutation_acceptance_rate}
hierarchy:   {P_pi_pos, pi_median, pi_ci90, directional}
sensitivity: {S1, S2, S3, split_half, strata}
incidents:   []
```

## 14. References

- `docs/audits/gate-0b-research-state-reconciliation-2026-10-17.md` (r7) —
  supersession register, C1–C5, incident register, §5.5 feasibility preview.
- `docs/experiments/gate-0c-redline-review-package-2026-10-20.md` — F1–F5
  evidence and dispositions (§4.4); §8 addendum registers F6/F7.
- `docs/experiments/gate-0c-nic-2026-10-20.md` (+ JSON sidecar) — frozen
  P4 FAIL artifact, independently verified 2026-10-21 (188/188).
- `docs/audits/gate-0c-implementation-review-2026-10-21.md` — independent
  implementation review; finding: the reported v1.1 implementation had no
  persisted artifacts; basis for this re-derivation.
- `docs/experiments/gate-0c-amendment-v1.1-draft-2026-10-21.md` (+ .patch)
  — this amendment's record and reviewable diff (DRAFT, not applied).
- `docs/audits/exploratory-entry-timing-comparison-2026-10-15.md` — disclosed
  exploratory finding (§2.2).
- `docs/audits/gate-0b-window-degeneracy-2026-10-15.md` — the no-variance
  lesson NIC generalizes (§7).
- `docs/audits/smart-money-early-entry-2026-10-11.md` — day-close conventions,
  1.47% @1d base rate, 29% unpriced precedent (§6.1, §4.2).
- `docs/designs/early-entry-rate-regime-normalized-v1.md` — §2 `baseline(d)`,
  superseded here by its permutation generalization (§8.2).
- Prior art (session 2026-10-18 research): Monte Carlo permutation testing is
  established practice in backtest validation (BuildAlpha methodology; Gatto
  2026, SSRN 6636018); Nansen's smart-money methodology publishes no
  null-inference framework. CoinGecko free tier: 100 calls/min, 10k/month —
  one fetch consumed (§6.1).

