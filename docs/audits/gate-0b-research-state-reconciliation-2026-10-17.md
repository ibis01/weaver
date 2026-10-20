# Gate 0b — Research State Reconciliation

**Date:** 2026-10-18
**Reconciles the record as of:** commit `11d99d2` (2026-10-17, "falsify v1 design — populations are incompatible")
**Status:** Active record (rev. r5, 2026-10-18, post-review). Supersedes the specific claims listed in §6. Selects no population, authorizes no run, and changes no metric. Revision r2 adds: evidence boundary (§2.1), status vocabulary (§2.2), claim-status separation (§5.3), the P2 qualification standard (§7-P2), measurable acceptance tests (§8), the artifact naming convention (§9.2), and gate-closure criteria (§10.1). Revision r3 adds: §5.4 (post-`11d99d2` local-evidence register — informational, not incorporated) and aligns §9.2/§10.1 with the locally committed artifact naming. Revision r4 records the 2026-10-18 validation outcomes for §5.4's registered evidence ("Validation outcomes" in §5.4); §10.1 closure now awaits only the recount, SHA recording, rename staging, and the commit itself. Revision r5 (2026-10-18, second verification pass) records the recount and SHA results, closes §10.1 item 7, adds the §8-C5 arithmetic from pool-level totals, and registers the loss of the untracked 12-month artifact in a bookkeeping accident (recovery attempt pending). Revision r6 (2026-10-20, third verification pass) records the resolution of that incident — the per-wallet artifact is present again at the §9.2-conformant path and its aggregates match the pre-loss transcript on all four recorded dimensions (§5.4) — and registers the Gate 0c minimum-N feasibility preview as informational input to the prereg red-line review (§5.5). Revision r7 (2026-10-20, third-pass addendum) registers the recovery attestation and data commit `d2e5d8b` (channel: git object store, unreachable blob `64df6b71…`; cross-artifact window validation exact vs the committed 3-month artifact; cumulative per-wallet verification committing; falsification-doc 16/49 figure confirmed) and one open anomaly: the 12m JSON itself did not enter `d2e5d8b` (commit-scope fix required, §5.4).
**Predecessors:** `v1-vs-v2-population-reconciliation-2026-10-15.md`, `gate-0b-window-degeneracy-2026-10-15.md`, `gate-0b-attempt-1-result.md`, `gate-0b-discrimination-result-2026-10-13.md` (retracted), `windowed-net-check-2026-10-13.md`, `data/experiments/availability-2026-10-17.json`, `docs/experiments/gate-0b-preregistration-v1.md`, `docs/designs/early-entry-rate-regime-normalized-v1.md`

---

## 1. Purpose and scope

This document reconciles the Gate 0b research record after the 2026-10-17
falsification. It establishes, in one place: which findings remain valid,
which claims are retracted or superseded, what qualifies a wallet for each
population class, which constraints block the next gate, and what evidence
is required to advance.

Historical documents are preserved unmodified. Corrections are made by the
supersession notices in §6, not by rewriting predecessors.

**This document does not:** select a new control population, revise the
`earlyEntryRate` definition, choose an evaluation window, or authorize any
experimental run. Those actions belong to the design revision and
preregistration v2, which must cite this document.

## 2. Verification method

Every quantitative claim in this document was re-derived from committed
artifacts at HEAD `11d99d2` on 2026-10-18 — not copied from prose. Where a
prose claim could not be reproduced from a committed artifact, it is
recorded in §5 as a provenance gap rather than silently repeated.

### 2.1 Evidence boundary

This document describes the record as of `11d99d2`. Three evidence
categories are kept distinct throughout:

- **Verified at `11d99d2`** — findings re-derived from artifacts
  committed at that exact revision (§3 lists them). These form the
  historical audit and are not revised by later work.
- **Subsequent evidence** — findings from commits or working-tree
  artifacts dated after `11d99d2`, each requiring its own provenance.
  At the time of writing, this document and the two supersession
  banners (§6) are themselves working-tree changes dated 2026-10-18;
  they become part of the record only when committed together with
  this document. Known post-`11d99d2` commits on the author's local
  branch are registered — but not incorporated — in §5.4.
- **Unresolved** — claims that cannot yet be reproduced from the
  artifacts available at the pinned revision (§5).

Later evidence may close a gap recorded here, but closure does not
retroactively change the historical audit: a resolved item is updated
by a dated supersession notice or addendum, never by rewriting the
`11d99d2` findings in place.

### 2.2 Status vocabulary

The register in §6 and the findings in §4–§5 use these terms
exclusively, per claim:

- **FALSIFIED** — a prespecified claim has been contradicted by valid
  evidence (e.g., control-2's "exchanges excluded" construction claim,
  §4.5; the 2026-10-13 PASS, §4.4).
- **BLOCKED** — a design or section cannot proceed because a
  prerequisite is invalid or unavailable. The premise that failed is
  named in each entry. A design blocked this way is not itself
  "falsified" (e.g., §6.2's matching design is blocked because its
  activity-compatibility premise cannot currently be established).
- **UNSUPPORTED** — the available evidence does not justify the claim
  either way (e.g., §6.3's sample-size feasibility, §5.1's
  treatment-side figures).
- **SUPERSEDED** — replaced by newer data or decisions; the claim was
  accurate for the snapshot it described (e.g., §6.4, §6.7).
- **RETRACTED** — withdrawn by the authors and retained only for audit
  trail (e.g., §6.9, §6.10).

A design can be BLOCKED because one of its premises is FALSIFIED; the
register entries name which proposition failed.

## 3. Evidence base inspected

| Artifact | What it is | Status after this doc |
|---|---|---|
| `data/experiments/availability-2026-10-17.json` | Activity pre-flight, `--pool control` run | Valid for control side; treatment side absent (§5) |
| `docs/audits/gate-0b-window-degeneracy-2026-10-15.md` | Forward-return analysis of the PEPE window | Valid |
| `docs/audits/v1-vs-v2-population-reconciliation-2026-10-15.md` | Overlap of v1 and the 2026-10-15 v2 snapshot | Valid method; figures superseded (§6.6) |
| `docs/audits/gate-0b-attempt-1-result.md` | First discrimination measurement | Valid; inconclusive |
| `docs/audits/gate-0b-discrimination-result-2026-10-13.md` | Retracted PASS | Retracted 2026-10-13; retained for audit trail |
| `docs/audits/windowed-net-check-2026-10-13.md` | Basis for the retraction | Valid |
| `docs/audits/v5-unresolved-breakdown-2026-10-15.md` | UNRESOLVED 76-split classification | Valid |
| `docs/experiments/gate-0b-preregistration-v1.md` | Preregistration, status DRAFT | §6.2, §8, §11.1 blocked/superseded (§6) |
| `docs/designs/early-entry-rate-regime-normalized-v1.md` | Normalized-metric draft | §3, §4.3 blocked (§6) |
| `data/pepe-buyer-list/v1.json` | 27 buyers, net-holder pipeline | Valid as event-scoped buyer population |
| `data/pepe-buyer-list/v2.json` | 49 buyers, v1.5 attribution run | Valid as event-scoped buyer population; metadata stale (§8) |
| `data/wallet-pool-control-2-v1.json` | 50-wallet control pool | **Disqualified as reference/control (2026-10-17)** |
| `scripts/oneoff/check-eval-window-availability.js` | Generator of the availability artifact | Valid; see §5 on run scope |

## 4. Findings that remain valid

### 4.1 Window degeneracy

PEPE window [2026-08-08, 2026-08-23]: every entry date 08-08 through 08-18
was followed by a ≥20% 14-day rise (range +33.9% to +45.5%); every date
from 08-19 onward was not (+17.6% down to −14.3%). All 27 v1 buyers entered
inside the qualifying band; under the real metric their `earlyEntryRate`
would be 1.0 regardless of any wallet property. On this window the metric
is a date classifier. Any evaluation window must demonstrate in-window
forward-return variance before a discrimination result is interpretable.

Consequence that compounds: v2's extraction window (2026-08-12 .. 2026-08-19)
sits inside the degenerate band. No population extracted from it can be
scored on the unmodified metric within that window.

### 4.2 The two buyer populations disagree — and the disagreement changed

v1 (27 buyers; net-holder pipeline, window blocks [25710000, 25820000])
and v2 (49 buyers; v1.5 attribution pipeline, 1,132 candidates, window
2026-08-12..2026-08-19) are independent extractions by different methods.
Against the **current** `v2.json`:

| set | count |
|---|---|
| v1 buyers | 27 |
| v2 buyers (current file) | 49 |
| in both | 13 |
| v1-only | 14 |
| v2-only | 36 |

48% of v1 is confirmed by the current v2; only 27% of the current v2
appears in v1. The 2026-10-15 reconciliation reported a 12-wallet
intersection and "71% of v2 confirmed by v1" — those figures refer to the
**2026-10-15 v2 snapshot (17 buyers)** and no longer describe the
committed file. The earlier conclusion that v2 is "structurally narrower"
than v1 is also stale: the v1.5 v2 is broader in candidate source
(1,132 swap-event candidates) and now contains 36 wallets v1 lacks.

Scope of what the comparison establishes: the current lists overlap on
13 wallets, while 14 v1 wallets and 36 v2 wallets appear in only one
list. This establishes substantial disagreement between the two
extracted populations — assuming the set comparison itself was performed
correctly — but it does not identify which method has better recall,
does not establish that the 13 shared wallets are the only confirmed
buyers, and does not establish the complete buyer population. Agreement
between two extraction methods is a different question from coverage of
the true buyer population. Population definition and route coverage
remain unresolved.

### 4.3 Attempt 1 stands as measured, and as inconclusive

Five wallets selected by event-adjacency (bought ≥1B PEPE in the 7 days
before the 2026-08-22 +28.63% pump) scored `earlyEntryRate` 0.084–0.133
(median 0.095) against a control median of 0.22; all five dropped at
`rateBelowMin`. Inconclusive between "the wallets lack skill" and "the
measurement design is wrong." What it does establish: **event-adjacent
buying is not, by itself, documented timing skill.** The gold-standard
label as used in Attempt 1 is retired.

### 4.4 The 2026-10-13 PASS remains retracted

The discrimination PASS (gold median 1.000 vs control 0.000) was retracted
the same week: `windowed-net-check-2026-10-13.md` showed 16/20 candidates
are pass-through, 3 are dust net-holders, 1 a net-seller. That test
measured trading infrastructure against random holders. The metric remains
untested. Document retained for audit-trail continuity.

### 4.5 Availability check result (control side) — verified

From `data/experiments/availability-2026-10-17.json`
(`version: availability-v1`, generated 2026-10-17T18:14:48Z, months
2026-07..2026-09, blocks 25415294..26066470):

- Control wallets with ≥10 PEPE acquisitions (`anyIn`) per month:
  **23 / 25 / 22** (July/August/September).
- 16 of 50 control wallets errored: **15 `api-status-0`, 1 `page-cap`** —
  their histories are truncated or absent, not zero.
- `0x28c6c06298d514db089934071355e5743bf21d60` is present in control-2
  with monthly `anyIn` **3,014 / 532 / 0** — it is the `page-cap` wallet.
  Two distinct propositions, kept separate: (a) the wallet's presence
  and activity are **verified at `11d99d2`** from the artifact; (b) its
  identification as a Binance hot wallet comes from the falsification
  commit's label attribution, consistent with publicly maintained
  exchange-label lists, and is to be re-confirmed under the §8-C1
  screening procedure before being relied on again. On that basis,
  control-2's construction claim "Contracts, exchanges, and bots
  excluded" is **FALSIFIED** (§2.2): the observed wallet contradicts the
  written exclusion.
- control-2 ∩ v1 = 0 and control-2 ∩ v2 = 0: the prereg §6.2 exclusion
  ("any control-2 wallet appearing in v1 or v2 is excluded") is satisfied,
  vacuously.

## 5. Provenance gaps found during verification

**5.1 The treatment-side availability figures are not reproducible from
committed artifacts.** The falsification commit message reports treatment
(v2, 49): "1, 8, 1 wallets with ≥10 buys" across the three months, and
"max 13/49" for the §11.1 infeasibility claim. The committed artifact is a
`--pool control` run: `pool: "control"`, `treatment: {}`, and summary
`tFP`/`tAI` = 0 by construction. No committed file contains the
treatment-side counts.

Consequence: the blocking of prereg §6.1/§6.2 stands on verified grounds
(§4.5: the falsified exclusion claim), but the **§11.1 "never achievable"
claim currently rests on an uncommitted run** and remains UNSUPPORTED
(§2.2). Two boundaries are explicit here:

- **Control-2's disqualification is not a proof of statistical
  infeasibility.** It invalidates the v1 design's control arm; whether
  Gate 0b is feasible at all is a fresh question for the §9.3
  power/feasibility analysis.
- **The control-only artifact does not establish an activity-regime
  mismatch between the pools.** It documents the control side only
  (23/25/22 wallets ≥10 `anyIn`; 16 error wallets). Any "treatment and
  control live in different activity regimes" statement requires the
  treatment artifact first (§5.3).

A treatment-pool availability run must be committed before
preregistration v2 cites treatment-side numbers. Note that the control
side alone already cannot meet a ≥30-wallet floor in any proxy month
(22–25 < 30) — but proxy months are not the evaluation window (§5.4 of
the preregistration is BLOCKED), so evaluation-window feasibility must
be re-derived, not assumed in either direction.

**5.2 Population-file metadata drift.** `data/pepe-buyer-list/v2.json`
was regenerated between 2026-10-15 and 2026-10-17 (17 → 49 buyers) under
the v1.5 attribution spec, but (a) its `spec` field still points to
`pepe-buyer-attribution-v1.3.md`, and (b) no supersession note was added
to the 2026-10-15 reconciliation document that cites the old figure.
Future population regenerations must update the spec pointer and append a
supersession notice in the same commit.

### 5.3 Claim-status separation

Review of this document required the following propositions to be kept
distinct. This table is the authoritative assignment:

| Proposition | Status | Basis |
|---|---|---|
| Control-2 contains the wallet `0x28c6c062…` with activity 3,014/532/0 | **Verified at `11d99d2`** | `availability-2026-10-17.json` (§4.5) |
| That wallet is a Binance hot wallet | Supported, pending §8-C1 re-confirmation of the label source | Falsification-commit attribution; consistent with public exchange-label lists |
| Control-2's stated exclusions are contradicted | **FALSIFIED** (the exclusion claim) | §4.5, §2.2 |
| The control pool's observed activity differs from the treatment activity | **NOT ESTABLISHED** | Control-only artifact; treatment side absent (§5.1) |
| The treatment cannot reach the required sample size | **NOT REPRODUCIBLE / UNSUPPORTED** | Figures exist only in the falsification commit message (§5.1) |
| The original preregistration can proceed unchanged | **NO — blocked/superseded per §6** | §6.1–§6.3 |

### 5.4 Post-pinned evidence register (informational — not incorporated)

Two commits exist on the author's local branch beyond `11d99d2`
(`726ce7b`, `bd10bba`; not on origin as of this revision). Per §2.1,
none of the following changes any status in §4–§6 until validated;
they are registered so the next reviewer knows what may close what:

| Local evidence | What it could close | Validation required before incorporation |
|---|---|---|
| `data/experiments/availability-treatment-2026-10-17.json` (committed; `monthsBack: 3`, block range reported equal to the control artifact's) | §5.1's provenance gap; the §5.3 activity-mismatch and sample-size rows, **for the proxy months** | §10.1 evidence package: generator diff review, summary recount, wallet-list SHA, error summary |
| Uncommitted 12-month re-run of the same pool (`monthsBack: 12`, 2025-10..2026-09), overwriting the committed file in the worktree | Window-dependence of the 3-month treatment figures; inputs to the §6.3 feasibility arithmetic | Commit as its own artifact under a distinct name (§9.2 scope suffix); same §10.1 package |
| `docs/audits/gate-0b-v1-design-falsified-2026-10-17.md` (307 lines; "distributions prove incompatibility") | §5.3's activity-mismatch row, upgraded from NOT ESTABLISHED for the proxy window | Provenance review: which committed artifacts the distributions derive from; §8-C3 acceptance test |
| Modified `scripts/oneoff/check-eval-window-availability.js` (10 lines changed) | Determining which script version generated which artifact | Diff review: if changes are limited to output naming, artifacts remain same-logic; if fetching/bucketing changed, control and treatment artifacts are not same-logic runs |
| Staged `data/prices/*.json` (3 files, no committed generator) | Nothing in this document | Generator and provenance note committed first, or files unstaged — same gap class as §5.1 |

Window-dependence note: the 3-month treatment window (2026-07..09) was
quiet for treatment wallets, while the uncommitted 12-month run shows
acquisition activity in 2026-01..2026-06 for several of them. If that
run validates, it bears directly on the §6.3 decision — proxy-month
seasonality is exactly why §8-C4 requires the n-floor to be derived
against the actual evaluation window, not proxy months.

**Validation outcomes (2026-10-18 — six-command verification run by the
author on the local branch).** These record what the registered evidence
withstood; no §4–§6 status changes until the artifact commit lands.

- **Generator diff review (row 4): PASS.** The committed script change
  vs `11d99d2` touches only (a) the error branch — failed wallets now
  record `{_error: reason}` instead of being written as zero-activity
  buckets — and (b) the output filename (pool-suffixed). Fetching,
  anchor-based window derivation, and bucketing are unchanged, so the
  control and treatment artifacts are same-logic runs. Side effect in
  the project's favor: the error-branch fix closes the silent-undercount
  hole that wrote 16 control wallets as zero-activity (§4.5's
  "truncated or absent, not zero").
- **Control rename (§9.2): PASS.** `git diff --stat
  11d99d2:data/experiments/availability-2026-10-17.json
  HEAD:data/experiments/availability-control-2026-10-17.json` printed
  nothing — the renamed copy is byte-identical to the pinned original,
  so §3/§4.5 references are safe under either name. The original's
  deletion still needs to be staged deliberately.
- **Window identity (§10.1 item 5): PASS.** The committed treatment
  artifact reports blocks 25415294..26066470 — identical to the control
  artifact's window (checked against the `11d99d2` blob). The
  deterministic anchor-based window derivation is confirmed in
  practice.
- **Error summary (§10.1 item 6): PASS.** Treatment run: `errors: []`
  (0/49 wallets). Its zero-activity wallets are true zeros, against the
  control run's 16/50 fetch failures.
- **Commit-message figures reproduced (§5.1):** the artifact's summary
  is tAI 1/8/1 and tFP 0/2/0 — matching the falsification commit
  message's "1, 8, 1 wallets with ≥10 buys". The figures §5.1 could not
  reproduce from committed files now exist in a committed artifact;
  closure awaits the recount (§10.1 item 7), the SHA recordings (items
  2 and 4), and the commit itself.
- **Still open:** (d) the locally committed prereg banner's blanket
  "falsified by evidence" wording vs this register's per-section
  statuses (§6.1 BLOCKED / §6.2 BLOCKED / §6.3 UNSUPPORTED ON CURRENT
  EVIDENCE) — align the banner wording at the reconciliation commit, or
  let this document govern. Items (a) recount and (b) SHA recording
  closed in the second pass below; item (c) became the incident
  registered below.

Provisional reading (not a status change): for the proxy months, the
committed artifact shows 1/8/1 of 49 treatment wallets at ≥10 `anyIn`
and 0/2/0 at ≥10 `fromPair`, against control's 23/25/22 of 50 and
0/0/0. Control's `cFP = 0` — no control wallet reaches 10 pair-origin
acquisitions in any proxy month while 23–25 exceed 10 `anyIn` — is
consistent with §4.5's exchange-withdrawal reading and keeps §8-C1
central. If the recount confirms the summary, §5.3's activity-mismatch
and sample-size rows become closable for the proxy window on commit;
§6.3 stays UNSUPPORTED pending the §10-3 feasibility decision. The
12-month worktree summary shows 24 ≥10-`anyIn` wallet-months and 3
≥10-`fromPair` wallet-months across 2025-10..2026-09 (peak August
2026: 8 and 2) — no window choice rescues the preregistration's
per-wallet floor.

**Second verification pass (2026-10-18).** Recount and SHA items closed;
one loss registered.

- **Independent recount (§10.1 item 7): PASS.** Recomputed from the
  artifact body: `anyInGE10` = 1/8/1 matches `summary.tAI`, and
  `fromPairGE10` = 0/2/0 matches `summary.tFP`, with 0 error wallets.
  With this, **all seven §10.1 items pass** for
  `availability-treatment-2026-10-17.json`; blocker §10-1 closes with
  the commit itself.
- **SHAs recorded (§10.1 items 2 and 4):** generating script
  `scripts/oneoff/check-eval-window-availability.js` blob
  `120c49f19dc24671968f752c9aaaa7c21455a9dd`; wallet list
  `data/pepe-buyer-list/v2.json` blob
  `73024f5f5e4b6dc67125fd674e30c9c1b8499c40`.
- **§8-C5 arithmetic from pool-level totals (recount):** pool `anyIn`
  66/246/68 = 380 acquisitions over the 92-day window (4.13/day);
  pool `fromPair` 13/111/12 = 136 pair-origin acquisitions (1.48/day).
  Against C5 (pool-level ≥5 buys/day on ≥40% of window days): the
  strict reading reaches 30% of the floor, the loosest reading
  (4.13/day) is still below it, and the day-coverage criterion needs
  ≥185 buys (37 days × 5) vs 136 observed. **The treatment pool fails
  C5 as a P3 candidate on committed data.** With control-2 disqualified
  under C1/C2 (§4.5), no current pool qualifies for the reference
  role — §7-P3 is confirmed empty by evidence, not only by argument.
- **Control-rename staging:** already staged at verification time
  (`D` in the index column); the follow-up `git add` pathspec error
  was the expected no-op. The rename is complete as staged.
- **Incident — 12-month artifact lost (registered 2026-10-18).** The
  untracked 12-month artifact was overwritten during verification
  bookkeeping: the §9.2 rename had already been performed manually
  before the verification block ran, and the block's move step then
  re-executed with the destination present, replacing the 12-month
  content with the committed 3-month artifact's bytes. Hash comparison
  confirmed the surviving renamed file is byte-identical to the
  committed artifact (to be deleted as a misnamed duplicate). Per-wallet
  buckets are unrecoverable from git history (the file was never
  added). The run's aggregate summary survives in the review
  transcript: 24 ≥10-`anyIn` wallet-months and 3 ≥10-`fromPair`
  wallet-months across 2025-10..2026-09, peak 2026-08 (8 and 2),
  49 wallets, 0 errors. No §4–§6 status depends on the lost
  per-wallet data; the window-dependence note above rests on the
  aggregate. Recovery attempt: a stash exists (`stash@{0}`, based on
  `614fbb5`); whether it postdates the 12-month run is not yet
  determined — inspection pending. Disposition (recovered /
  summary-only / re-run as a new dated artifact
  `availability-treatment-12m-2026-10-18.json`) to be recorded when
  resolved.
- **Newly visible in status:**
  `data/experiments/gate-0b1-audit-2026-10-17.json` is untracked —
  review and include it in the docs commit (it is the data companion
  to the committed falsification audit), or document why not. The
  duplicate reconciliation copy in `docs/experiments/` is still
  present. The `data/prices/` staging question was outside the second
  pass's status scope and remains open.

**Third verification pass (2026-10-20). 12-month artifact recovery
resolved.**

- **Recovery outcome: per-wallet artifact present again** at the
  §9.2-conformant path
  `data/experiments/availability-treatment-12m-2026-10-17.json` (scope
  suffix `12m`; the name preserves the original run date). Disposition:
  **recovered** — per-wallet monthly buckets exist again and recount
  cleanly. The recovery channel (backup copy vs stash vs deterministic
  re-run) is to be attested in the docs commit message; if a re-run,
  the commit message records the run date and command.
- **Stash safety (check before committing).** `stash@{0}` is the
  protected pattern-engine WIP (base `614fbb5`). If the recovery was
  taken from the stash via `git stash pop`, note that pop applies AND
  drops on success — verify with `git stash list` that `stash@{0}` is
  still listed, and if it is not, verify the pattern-engine WIP
  (`js/ui/dashboard.js` +13/−8 vs `614fbb5`) is intact in the working
  tree before any further stash operations. `git stash drop` remains
  forbidden unconditionally.
- **Independent recount: PASS on all four recorded dimensions.**
  Recomputed from the artifact body (wallet-month cells, ≥10
  thresholds): `anyInGE10` = 24 and `fromPairGE10` = 3 match the
  pre-loss transcript aggregate exactly; peak month 2026-08 = 8 and 2
  (matches); 49 wallets and 0 errors (match). Internal consistency:
  the per-month qualifying counts sum to the headline counts (24 and
  3); 11 month keys present — 2025-10 is fully in-window (the window
  is exactly 2025-10-01..2026-09-30, see fingerprint below) with zero
  ≥10-`anyIn` wallet-months.
- **Window fingerprint: PASS.** `startBlock` 23483000 is exactly
  1,932,294 blocks below the control window's start 25415294 = 273
  days × 7,078 blocks/day, the same effective rate as the control
  window's own span (651,176 = 92 × 7,078). The recovered artifact was
  produced by the same deterministic anchor-based window derivation as
  the committed control/3-month artifacts, extended to `monthsBack`
  12 — a same-generator fingerprint, not merely a same-format one.
- **No §4–§6 status changes.** The recovery restores evidence the
  provisional reading already rested on (the aggregate); once the docs
  commit lands, the window-dependence note above rests on committed
  per-wallet data instead of a transcript.
- **Docs-commit additions (extends §10-1):** `sha256sum` +
  `git hash-object` of the recovered artifact recorded in the commit
  message; the disposition attestation above; the stash check above.

**Data commit + attestation (2026-10-20, `d2e5d8b`).**

- **Recovery channel attested: the git object store.** The artifact
  "had been overwritten on disk by a later 3-month run and existed
  only as an unreachable object" — recovered as blob
  `64df6b71919286a24ed13707e3e4abafb6d0d2d8` (45,722 bytes), block
  range 23483000..26066470. The r6 "channel to be attested" item
  closes as **recovered (object store)**; the attested channel does
  not implicate the stash, so the `stash@{0}` protection above stands
  as precaution only.
- **Cross-artifact validation: exact.** The recovered 12-month file's
  2026-07/08/09 wallet-month crossings are 1/8/1 (`anyIn`) and 0/2/0
  (`fromPair`) — byte-semantically identical to the committed
  3-month artifact's `summary.tAI`/`tFP` (§5.4 first pass). Recovery
  fidelity is sealed against an independently committed artifact, not
  only against the transcript.
- **Cumulative per-wallet verification committed**
  (`availability-treatment-12m-verification.txt`, 23 lines, in
  `d2e5d8b`): pooled 12-month per-wallet totals — ≥10 `anyIn`: **16**
  of 49; ≥10 `fromPair`: **5** of 49; ≥5 `anyIn`: 27 of 49; top wallet
  `0xedd5c22b…` at 148 `anyIn` / 44 `fromPair`. The falsification
  doc's "16 of 49 across 12 months" figure is thereby confirmed from
  committed data (its provenance row is partially closed; the full
  distribution-derivation review — §8-C3 — stays open).
- **Commit-scope anomaly (open):** `d2e5d8b` changed **1 file** — the
  verification txt. The JSON artifact named in the same `git add` did
  not enter the commit (suspects: gitignore match / already-tracked
  no-op / add-path failure; diagnostics: `git check-ignore -v`,
  `git ls-files`, `git log --oneline -- <path>`, `git status --short`).
  The evidence package is incomplete until the JSON is committed
  (`git add -f` if ignored, or a `.gitignore` negation), via amend
  (safe while unpushed) or a follow-up commit. The commit message
  also carries two "[verify from output]" placeholders — fill them
  (16/49, 5/49) if amending, else note the correction in the docs
  commit.

### 5.5 Gate 0c minimum-N feasibility preview (informational — not incorporated)

Computed 2026-10-20 from committed blobs only (`v2.json` blob
`73024f5f…`, v5 jsonl `3ab1a0a3…`, entry-blocks v1 `6b4f2535…`);
read-only, no RPC, no network. The prereg governs; nothing here amends
it. Purpose: let the prereg red-line review resolve pre-activation
flags with full knowledge, so the lock protocol is never spent on a
mechanically known outcome without that being a recorded choice.

- **§4.1 reconciliation: PASS.** The v5 jsonl channel spellings are
  `DIRECT_ORIGINATOR` (30) and `TRACED_ECONOMIC_RECIPIENT` (35 — the
  "35 TRACED" of §4.1) = 65 confirmed; the per-wallet confirmed recount
  matches `v2.buyers[].confirmed` for 49/49 wallets; median 1. The v5
  jsonl materializes per-tx evidence for exactly the 65 confirmed + 5
  buyer-wallet `UNRESOLVED` records (= Σ `classifiedTxs` = 70); the 48
  `INTERMEDIARY` + 71 remaining `UNRESOLVED` exist only in
  `v2.acceptance` aggregates (run-wide across 1,132 candidates). §4.1's
  "189 acquisition records" attributed to the 49 wallets is therefore a
  run-wide total, not a buyer-wallet total — wording to tighten at
  red-line review.
- **§4.2 rule 3 preview — every reading fails the minimum-N rule.**
  (a) distinct-acquisition-days reading: max 4 days per wallet; zero
  wallets reach 5; (b) confirmed-acquisitions reading (≥5): 2 wallets;
  (c) window-length reading of `|A_w|` (computable only for the 13
  anchor-covered wallets): 2 of 13 reach ≥5 days. **Under every
  reading, §4.2 rule 5 fires: as drafted, the run outputs
  `UNTESTABLE — population insufficient` (mechanical).**
- **§5 anchor defect: `first_seen_w` is not constructible from
  committed data for any wallet.** `entry-blocks v1` treatments are the
  27 v1-era wallets (overlap with the 49-wallet population: 13), and
  their `firstBlock` is scan-window-scoped (first inflow inside
  2026-08-12..19), not first-ever inflow. Closing this needs either a
  first-ever-inflow anchor extraction (new gated RPC — §9 Not-authorized
  territory, requires explicit authorization) or a pre-lock
  re-specification (e.g., `first_seen_w :=` detection-window start,
  disclosed as a limitation), or a window-free formulation.
- **Decision ownership.** Run-as-drafted vs pre-lock amendment vs
  dormant-at-draft belongs to the prereg owner at red-line review. This
  preview only establishes that the mechanical outcome is knowable
  before lock — the exact situation the draft-stage review exists for.
- **F1 robustness (2026-10-20, from the recovered artifact):** pooled
  12-month per-wallet totals show 5/49 wallets with ≥10 pair-origin
  inflows and ≥7 with ≥5 (all ten top-`anyIn` wallets visible; the
  exact pool-wide count is one pass away) — so even a hypothetical
  full-year per-tx evidence window caps eligible N well below 15.
  **The minimum-N failure is a population property, not a window
  artifact**; widening evidence coverage cannot rescue §4.2 as
  drafted. The extreme profile (`0xedd5c22b…`, 148 `anyIn` / 44
  `fromPair` pooled vs `inCount` 2 in the scan-window anchors) also
  independently corroborates F2's scan-window-scoping observation.

## 6. Supersession and retraction register

Scope note: the rows below invalidate control-2's role in **two separate
documents** — the preregistration (§6.1, §6.2: primary control and
matching) and the metric specification draft (§6.5, §6.6: reference
population and draw design). The underlying evidence (§4.5) grounds both,
but each row's status applies only to the cited section of the cited
document; neither row invalidates anything beyond its citation. In
particular, blocking the reference population does not falsify the
regime-normalization approach itself (§8-C5). Statuses follow the
vocabulary of §2.2.

| # | Claim / section | Status | Replaced by | Grounds |
|---|---|---|---|---|
| 6.1 | Prereg v1 §6.2 — control-2 as primary control | **BLOCKED** | control-v3 + preregistration v2 | Premise falsified: exclusion claim contradicted (§4.5, §2.2) |
| 6.2 | Prereg v1 §8 — 1:1 `inCount` matching between v2 and control-2 | **BLOCKED** | preregistration v2 | Activity compatibility of the pools cannot be established from committed evidence (§5.1, §5.3); matching cannot be defended on current evidence |
| 6.3 | Prereg v1 §11.1 — n≥30 per group with ≥10 priced buys; ≥25 matched pairs | **UNSUPPORTED ON CURRENT EVIDENCE** | committed availability artifacts for both pools + power/feasibility analysis | Control proxy months all <30; treatment side not committed (§5.1) |
| 6.4 | Prereg v1 §6.1 secondary-treatment "12-wallet intersection" | **SUPERSEDED** | this document §4.2 | Current intersection is 13 |
| 6.5 | `early-entry-rate-regime-normalized-v1.md` §3 — control-2 as reference population | **BLOCKED** | control-v3 | Reference population disqualified (2026-10-17) |
| 6.6 | `early-entry-rate-regime-normalized-v1.md` §4.3 — "two independent draws of the control pool" | **BLOCKED** | control-v3 (must be constructed to support ≥2 draws) | Reference population disqualified |
| 6.7 | v1-vs-v2 reconciliation figures (12 common / 15 / 5; 71%) | **SUPERSEDED** | this document §4.2 | v2 regenerated under v1.5 (17 → 49) |
| 6.8 | "v2's extraction method is structurally narrower than v1's" | **SUPERSEDED** | this document §4.2 | Direction of coverage asymmetry flipped |
| 6.9 | Gold-standard-2 population and its 2026-10-13 PASS | **RETRACTED** (2026-10-13) | — | Pass-through infrastructure, not buyers |
| 6.10 | "Gold-standard" (Attempt 1) as demonstrated timing skill | **RETRACTED** | this document §4.3 | Event-adjacency ≠ skill; median below control |

## 7. Population taxonomy and qualification criteria

Three population classes are defined. They are **not interchangeable**, and
no dataset may be promoted between classes without a supersession notice
citing this section.

### P1 — Verified economic buyers (event-scoped)

Wallets whose acquisitions of a specific token in a specific window are
attributed as economic purchases (e.g., `DIRECT_ORIGINATOR` /
`TRACED_ECONOMIC_RECIPIENT` under the attribution spec), with net-holding
verification where claimed.

- Current exemplars: v1 (27), v2 (49).
- **What P1 does not evidence:** timing skill, repeatability, or
  cross-token competence. One event, one token.
- Screen required before freeze: automated exchange/contract/bot screening
  (§8-C1), provider-completeness check (§8-C2).

### P2 — Documented-skill wallets (cross-token)

Wallets with independently documented early-entry patterns across multiple
token events with priced outcomes.

- **Current status: EMPTY.** No repository artifact constructs this class.
- **The minimum below is a starting point, not a completed qualification
  standard.** Early entries in ≥3 distinct token events do not by
  themselves establish skill: three events can share one market regime,
  one selection process, or one correlated episode. The completed
  standard must be frozen in preregistration v2 before any wallet is
  promoted to P2, and must specify:
  1. **Early-entry definition** — what counts as an early entry, per the
     metric definition frozen in prereg v2, applied by the same pipeline
     that will score it.
  2. **Event selection** — a prespecified event set meeting objective
     criteria (liquidity, age, price-data availability, §8-C5 variance),
     selected independently of any candidate wallet's behavior, and
     measured for **every** selected event, including events where the
     wallet did not enter early. Event selection must not condition on
     the wallet entering.
  3. **Independent verification** — entry timestamps from on-chain
     transfers under the attribution spec; prices and forward outcomes
     from an independent price source, not the extraction pipeline;
     per-entry evidence link (transaction hashes, block range).
  4. **Correlation and repeated observations** — events inside one
     prespecified correlation window, or one market episode, count once
     per wallet, or repeated observations are handled by a prespecified
     hierarchical treatment. Minimum dispersion: qualifying events must
     span more than one regime period, not a single episode.
  5. **Non-circularity** — the qualifying evidence must be independent
     of the metric being evaluated: qualification events and evaluation
     events are disjoint (held-out), or labels come from an external
     documented track record verified on-chain. Selecting wallets for
     the very behavior `earlyEntryRate` measures makes apparent
     discrimination meaningless — the treatment label must not be
     circular.
- Cross-event screening: exchange/contract screening as P1 (§8-C1) and
  provider-completeness (§8-C2) for every event in the qualification set.
- Gate 0a (data adequacy) may proceed with externally documented wallets
  for plumbing tests; Gate 0b discrimination **requires P2 or an explicit
  multi-event P1 pooling design** — the two gate purposes must not be
  conflated.

### P3 — Reference / baseline population

Outcome-free pool used to compute date baselines (regime normalization)
and/or matched controls.

- **Current status: EMPTY.** Control-2 is disqualified (§6.1). **No
  existing PEPE dataset qualifies as a reference population.** Neither v1
  nor v2 may serve: both are treatment-side, event-locked, and tied to the
  outcome being measured.
- Qualification (minimum): outcome-free construction independent of the
  evaluation window; automated screening against a maintained
  exchange/contract address list at freeze time, with the acceptance
  test of §8-C1 (written claims insufficient); activity distribution
  documented per §8-C3; provider-completeness per §8-C2 with its
  explicit denominator and consequence; ≥2 independent draws per the
  §8-C4 draw test; supports the pool-level daily-buy floor of the
  normalization spec (defined measurably in §8-C5).
- Each criterion carries a measurable acceptance test in §8; a pool is
  qualified only when every test passes at freeze time. Failure of any
  test is recorded, not waived.

## 8. Constraint register — blocking checks for any new dataset

Each constraint carries a measurable acceptance test. "Fail-closed"
means: until the test passes, the dataset is not qualified, and the
failure (or the absence of a run) is itself recorded.

- **C1 Exchange/contract contamination — screening with documented label
  provenance.** Automated pre-freeze screening of every address. The
  acceptance test requires recording: (a) label source name; (b) label
  version, snapshot date, or retrieval date; (c) screening method
  (exact lowercase-address match, plus any cluster or fuzzy matching
  used); (d) treatment of addresses not found in the label source —
  unknown addresses are permitted but counted, and the count is
  reported with the result. A clean result against an incomplete label
  list is not proof that the pool contains no exchange infrastructure;
  the label source's own coverage statement must be cited. Control-2's
  Binance hot wallet (`0x28c6c062…`, 3,014 buys in one month) is the
  precedent; a written "exchanges excluded" claim is worth nothing.
- **C2 Provider quota and completeness — explicit denominator and
  consequence.** Per-wallet error taxonomy (`api-status-0`, `page-cap`)
  is recorded, cap pages are explicit, and truncated histories are
  flagged, never scored as zeros. Acceptance test: unexplained provider
  failures = wallets whose histories are truncated or absent with no
  recorded mitigation after retry; denominator = all wallets in the
  pool; unexplained failures must be ≤10% of the pool. Consequence of
  exceeding 10%: the pool is not eligible to serve as P3 until a
  mitigated re-run (re-fetch, raised page cap, split queries) passes;
  alternatively, error wallets are excluded with the exclusion
  documented, and the reduced pool is then measured against the §8-C4
  size floor. Precedent: 16/50 control wallets errored on the
  availability check.
- **C3 Activity documentation.** Activity distributions of treatment and
  reference pools are measured and compared **before** any run that
  matches on activity. Acceptance test: per-wallet monthly acquisition
  distributions (from the availability artifacts) plus pool-level
  summary statistics (medians, quartiles) are committed, and the
  matching plan is justified against those measured distributions — not
  against pool sizes. The 49-vs-50 headline masked the mismatch; the
  availability check is the required pre-flight.
- **C4 Sample-size feasibility and draw design.** Before preregistration
  v2, availability artifacts for both pools are committed and the
  n-floor arithmetic is derived against the actual (selected)
  evaluation window — not against proxy months alone. If the floor is
  unreachable for any single-event design, the design question moves to
  multi-event pooling or a predefined INCONCLUSIVE outcome. Draw
  acceptance test (for the ≥2 independent draws of §6.6): pool size
  ≥ 2× the required draw size; draws are seeded random samples without
  replacement, mutually disjoint, each ≥ the C4 n-floor; the draw
  procedure is documented before any draw is taken.
- **C5 Window validity and baseline support.** Any evaluation window
  must show in-window forward-return variance for the frozen metric
  definition (§4.1). Baseline-floor acceptance test (from the
  normalization spec's pre-declared criteria, measured at the
  reference-population level): for each evaluation-window day, count
  all PEPE buys made by reference-population wallets on that day
  (pool-level aggregate, not per-wallet); days with fewer than 5
  pool-level reference buys fail the floor; the pool supports the
  metric only if ≥40% of evaluation-window days pass. The floor is
  computed on the pool that results after C2 resolution or exclusions.
  A regime-normalized metric is a candidate fix, but its reference
  population is blocked (§6.5, §6.6) and its draft status is unchanged.

## 9. What this document authorizes and does not authorize

**Authorized to begin (design work only, no outcome collection):**

1. control-v3 design against the P3 qualification criteria (§7).
2. Treatment-pool availability run (§5.1). Naming convention (aligned
   with the locally committed artifact): `data/experiments/
   availability-<pool>-<run-date>.json` — e.g. the committed
   `availability-treatment-2026-10-17.json`. The `11d99d2` control
   artifact was committed as `availability-2026-10-17.json` (pool only
   in the body); a renamed copy `availability-control-2026-10-17.json`
   exists on the local branch while the original's deletion is still
   uncommitted — the rename must be completed deliberately (commit the
   deletion or restore the file), and §3/§4.5 references map both names
   to the same content; blob identity was confirmed 2026-10-18 (§5.4).
   Same-day re-runs of the same pool take a scope suffix (e.g.
   `availability-treatment-12m-<run-date>.json`); each run commits
   before the next starts.
3. Power/feasibility analysis comparing single-event, multi-event, and
   predefined-INCONCLUSIVE outcomes.
4. Preregistration v2 drafting, superseding prereg v1 sections per §6.
5. Synthetic pipeline verification — software correctness only
   (provenance, refusals, provider-failure handling, independent-wallet
   checks). **A correct pipeline does not establish that its metric
   predicts anything.**

**Not authorized:**

- No new PEPE candidate extraction beyond the availability runs in §9.1.
- No `earlyEntryRate` threshold or definition tuning.
- No declaration of any new control or reference population as valid
  before it passes §8-C1..C5.
- No re-run of the discrimination test on the 2026-08-08..08-23 window.
- No promotion of any current dataset to P2 or P3.

## 10. Blockers to the next gate, in order

1. Commit the treatment-pool availability artifact (closes §5.1). The
   locally committed artifact registered in §5.4 is the first candidate:
   validate it against this package instead of re-running, provided the
   generator diff passes review. (2026-10-18: generator diff review,
   independent recount, SHA recording, and rename staging all passed —
   see §5.4; remaining: the commit itself.) (2026-10-20: the 12-month
   recovery item is resolved — §5.4 third pass and data commit
   `d2e5d8b`; note the JSON artifact missed that commit (commit-scope
   anomaly, §5.4) and must be folded in — amend while unpushed or a
   follow-up commit — before or with the docs commit.) The gate closes only
   when the evidence
   package contains **all** of:
   - the generated artifact, at its final committed path, with its
     `pool` field value stated (per §9.2); a post-generation rename,
     if any, is recorded;
   - the generating script path and version (commit SHA of
     `scripts/oneoff/check-eval-window-availability.js`);
   - the exact command and parameters (expected: `--pool treatment
     --months-back 3`, reproducing months 2026-07..2026-09 and the same
     block range as the control artifact);
   - the treatment wallet-list path and version (file path plus git SHA
     of `data/pepe-buyer-list/v2.json` at run time — metadata fields are
     not version identifiers, per §5.2);
   - the evaluation period (months) and block range, equal to the
     control artifact's;
   - provider-error and truncation summaries (the artifact's `errors`
     array, restated in the commit message or an accompanying note);
   - a reproducible validation result: an independent recount from the
     artifact body (per-wallet monthly buckets → ≥10-`anyIn` counts per
     month → `summary`), performed as in §2.
2. control-v3 satisfying §7-P3 and §8-C1..C5.
3. Sample-size/power feasibility decision: single-event vs multi-event vs
   predefined-INCONCLUSIVE (closes §6.3).
4. Preregistration v2, citing this document, with §5.4 (window) resolved
   by a variance-demonstrating selection rule (closes §6.2's grounds).
5. Only then: Gate 0b run, with PASS / FAIL / FALSIFY / INCONCLUSIVE as
   preregistered.
