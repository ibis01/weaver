Gate 0b — Research State Reconciliation

Date: 2026-10-18
Reconciles the record as of: commit 11d99d2 (2026-10-17, "falsify v1 design — populations are incompatible")
Status: Active record. Supersedes the specific claims listed in §6. Selects no population, authorizes no run, and changes no metric.
Predecessors: v1-vs-v2-population-reconciliation-2026-10-15.md, gate-0b-window-degeneracy-2026-10-15.md, gate-0b-attempt-1-result.md, gate-0b-discrimination-result-2026-10-13.md (retracted), windowed-net-check-2026-10-13.md, data/experiments/availability-2026-10-17.json, docs/experiments/gate-0b-preregistration-v1.md, docs/designs/early-entry-rate-regime-normalized-v1.md
1. Purpose and scope

This document reconciles the Gate 0b research record after the 2026-10-17
falsification. It establishes, in one place: which findings remain valid,
which claims are retracted or superseded, what qualifies a wallet for each
population class, which constraints block the next gate, and what evidence
is required to advance.

Historical documents are preserved unmodified. Corrections are made by the
supersession notices in §6, not by rewriting predecessors.

This document does not: select a new control population, revise the
earlyEntryRate definition, choose an evaluation window, or authorize any
experimental run. Those actions belong to the design revision and
preregistration v2, which must cite this document.
2. Verification method

Every quantitative claim in this document was re-derived from committed
artifacts at HEAD 11d99d2 on 2026-10-18 — not copied from prose. Where a
prose claim could not be reproduced from a committed artifact, it is
recorded in §5 as a provenance gap rather than silently repeated.
3. Evidence base inspected
Artifact
	
What it is
	
Status after this doc
data/experiments/availability-2026-10-17.json	Activity pre-flight, --pool control run	Valid for control side; treatment side absent (§5)
docs/audits/gate-0b-window-degeneracy-2026-10-15.md	Forward-return analysis of the PEPE window	Valid
docs/audits/v1-vs-v2-population-reconciliation-2026-10-15.md	Overlap of v1 and the 2026-10-15 v2 snapshot	Valid method; figures superseded (§6.6)
docs/audits/gate-0b-attempt-1-result.md	First discrimination measurement	Valid; inconclusive
docs/audits/gate-0b-discrimination-result-2026-10-13.md	Retracted PASS	Retracted 2026-10-13; retained for audit trail
docs/audits/windowed-net-check-2026-10-13.md	Basis for the retraction	Valid
docs/audits/v5-unresolved-breakdown-2026-10-15.md	UNRESOLVED 76-split classification	Valid
docs/experiments/gate-0b-preregistration-v1.md	Preregistration, status DRAFT	§6.2, §8, §11.1 blocked/superseded (§6)
docs/designs/early-entry-rate-regime-normalized-v1.md	Normalized-metric draft	§3, §4.3 blocked (§6)
data/pepe-buyer-list/v1.json	27 buyers, net-holder pipeline	Valid as event-scoped buyer population
data/pepe-buyer-list/v2.json	49 buyers, v1.5 attribution run	Valid as event-scoped buyer population; metadata stale (§8)
data/wallet-pool-control-2-v1.json	50-wallet control pool	Disqualified as reference/control (2026-10-17)
scripts/oneoff/check-eval-window-availability.js	Generator of the availability artifact	Valid; see §5 on run scope
 
 
4. Findings that remain valid
4.1 Window degeneracy

PEPE window [2026-08-08, 2026-08-23]: every entry date 08-08 through 08-18
was followed by a ≥20% 14-day rise (range +33.9% to +45.5%); every date
from 08-19 onward was not (+17.6% down to −14.3%). All 27 v1 buyers entered
inside the qualifying band; under the real metric their earlyEntryRate
would be 1.0 regardless of any wallet property. On this window the metric
is a date classifier. Any evaluation window must demonstrate in-window
forward-return variance before a discrimination result is interpretable.

Consequence that compounds: v2's extraction window (2026-08-12 .. 2026-08-19)
sits inside the degenerate band. No population extracted from it can be
scored on the unmodified metric within that window.
4.2 The two buyer populations disagree — and the disagreement changed

v1 (27 buyers; net-holder pipeline, window blocks [25710000, 25820000])
and v2 (49 buyers; v1.5 attribution pipeline, 1,132 candidates, window
2026-08-12..2026-08-19) are independent extractions by different methods.
Against the current v2.json:
set
	
count
v1 buyers	27
v2 buyers (current file)	49
in both	13
v1-only	14
v2-only	36
 
 

48% of v1 is confirmed by the current v2; only 27% of the current v2
appears in v1. The 2026-10-15 reconciliation reported a 12-wallet
intersection and "71% of v2 confirmed by v1" — those figures refer to the
2026-10-15 v2 snapshot (17 buyers) and no longer describe the
committed file. The earlier conclusion that v2 is "structurally narrower"
than v1 is also stale: the v1.5 v2 is broader in candidate source
(1,132 swap-event candidates) and now contains 36 wallets v1 lacks.

The valid core survives: independent methods agree on only 13 wallets, so
neither list alone captures the population, and population definition —
not extraction mechanics — is the open problem.
4.3 Attempt 1 stands as measured, and as inconclusive

Five wallets selected by event-adjacency (bought ≥1B PEPE in the 7 days
before the 2026-08-22 +28.63% pump) scored earlyEntryRate 0.084–0.133
(median 0.095) against a control median of 0.22; all five dropped at
rateBelowMin. Inconclusive between "the wallets lack skill" and "the
measurement design is wrong." What it does establish: event-adjacent
buying is not, by itself, documented timing skill. The gold-standard
label as used in Attempt 1 is retired.
4.4 The 2026-10-13 PASS remains retracted

The discrimination PASS (gold median 1.000 vs control 0.000) was retracted
the same week: windowed-net-check-2026-10-13.md showed 16/20 candidates
are pass-through, 3 are dust net-holders, 1 a net-seller. That test
measured trading infrastructure against random holders. The metric remains
untested. Document retained for audit-trail continuity.
4.5 Availability check result (control side) — verified

From data/experiments/availability-2026-10-17.json
(version: availability-v1, generated 2026-10-17T18:14:48Z, months
2026-07..2026-09, blocks 25415294..26066470):

     Control wallets with ≥10 PEPE acquisitions (anyIn) per month:
    23 / 25 / 22 (July/August/September).
     16 of 50 control wallets errored: 15 api-status-0, 1 page-cap —
    their histories are truncated or absent, not zero.
     0x28c6c06298d514db089934071355e5743bf21d60 (identified in the
    falsification commit as a Binance hot wallet) is present in control-2
    with monthly anyIn 3,014 / 532 / 0 — it is the page-cap wallet.
    Control-2's construction metadata claims "Contracts, exchanges, and
    bots excluded." The claim is contradicted by observation.
     control-2 ∩ v1 = 0 and control-2 ∩ v2 = 0: the prereg §6.2 exclusion
    ("any control-2 wallet appearing in v1 or v2 is excluded") is satisfied,
    vacuously.

5. Provenance gaps found during verification

5.1 The treatment-side availability figures are not reproducible from
committed artifacts. The falsification commit message reports treatment
(v2, 49): "1, 8, 1 wallets with ≥10 buys" across the three months, and
"max 13/49" for the §11.1 infeasibility claim. The committed artifact is a
--pool control run: pool: "control", treatment: {}, and summary
tFP/tAI = 0 by construction. No committed file contains the
treatment-side counts.

Consequence: the §6.2 falsification stands on verified grounds (§4.5:
exchange contamination plus activity regime), but the §11.1
"never achievable" claim currently rests on an uncommitted run. A
treatment-pool availability run must be committed before preregistration
v2 cites treatment-side numbers. Note that the control side alone already
cannot meet a ≥30-wallet floor in any proxy month (22–25 < 30) — but proxy
months are not the evaluation window (§5.4 of the preregistration is
BLOCKED), so evaluation-window feasibility must be re-derived, not assumed
in either direction.

5.2 Population-file metadata drift. data/pepe-buyer-list/v2.json
was regenerated between 2026-10-15 and 2026-10-17 (17 → 49 buyers) under
the v1.5 attribution spec, but (a) its spec field still points to
pepe-buyer-attribution-v1.3.md, and (b) no supersession note was added
to the 2026-10-15 reconciliation document that cites the old figure.
Future population regenerations must update the spec pointer and append a
supersession notice in the same commit.
6. Supersession and retraction register
#
	
Claim / section
	
Status
	
Replaced by
	
Grounds
6.1	Prereg v1 §6.2 — control-2 as primary control	BLOCKED	control-v3 + preregistration v2	Exchange-contamination verified (§4.5); construction metadata claim contradicted
6.2	Prereg v1 §8 — 1:1 inCount matching between v2 and control-2	BLOCKED	preregistration v2	Pools drawn from incompatible activity regimes (§4.5); matching cannot be defended from current evidence
6.3	Prereg v1 §11.1 — n≥30 per group with ≥10 priced buys; ≥25 matched pairs	UNSUPPORTED ON CURRENT EVIDENCE	committed availability artifacts for both pools + power/feasibility analysis	Control proxy months all <30; treatment side not committed (§5.1)
6.4	Prereg v1 §6.1 secondary-treatment "12-wallet intersection"	SUPERSEDED	this document §4.2	Current intersection is 13
6.5	early-entry-rate-regime-normalized-v1.md §3 — control-2 as reference population	BLOCKED	control-v3	Reference population disqualified (2026-10-17)
6.6	early-entry-rate-regime-normalized-v1.md §4.3 — "two independent draws of the control pool"	BLOCKED	control-v3 (must be constructed to support ≥2 draws)	Reference population disqualified
6.7	v1-vs-v2 reconciliation figures (12 common / 15 / 5; 71%)	SUPERSEDED	this document §4.2	v2 regenerated under v1.5 (17 → 49)
6.8	"v2's extraction method is structurally narrower than v1's"	SUPERSEDED	this document §4.2	Direction of coverage asymmetry flipped
6.9	Gold-standard-2 population and its 2026-10-13 PASS	RETRACTED (2026-10-13)	—	Pass-through infrastructure, not buyers
6.10	"Gold-standard" (Attempt 1) as demonstrated timing skill	RETRACTED	this document §4.3	Event-adjacency ≠ skill; median below control
 
 
7. Population taxonomy and qualification criteria

Three population classes are defined. They are not interchangeable, and
no dataset may be promoted between classes without a supersession notice
citing this section.
P1 — Verified economic buyers (event-scoped)

Wallets whose acquisitions of a specific token in a specific window are
attributed as economic purchases (e.g., DIRECT_ORIGINATOR /
TRACED_ECONOMIC_RECIPIENT under the attribution spec), with net-holding
verification where claimed.

     Current exemplars: v1 (27), v2 (49).
     What P1 does not evidence: timing skill, repeatability, or
    cross-token competence. One event, one token.
     Screen required before freeze: automated exchange/contract/bot screening
    (§8-C1), provider-completeness check (§8-C2).

P2 — Documented-skill wallets (cross-token)

Wallets with independently documented early-entry patterns across multiple
token events with priced outcomes.

     Current status: EMPTY. No repository artifact constructs this class.
     Qualification (minimum): early entries in ≥3 distinct token events;
    priced outcome per entry; per-entry evidence link; selection by pattern,
    not by event adjacency; exchange/contract screening as P1.
     Gate 0a (data adequacy) may proceed with externally documented wallets
    for plumbing tests; Gate 0b discrimination requires P2 or an explicit
    multi-event P1 pooling design — the two gate purposes must not be
    conflated.

P3 — Reference / baseline population

Outcome-free pool used to compute date baselines (regime normalization)
and/or matched controls.

     Current status: EMPTY. Control-2 is disqualified (§6.1). No
    existing PEPE dataset qualifies as a reference population. Neither v1
    nor v2 may serve: both are treatment-side, event-locked, and tied to the
    outcome being measured.
     Qualification (minimum): outcome-free construction independent of the
    evaluation window; automated screening against a maintained
    exchange/contract address list at freeze time (written claims
    insufficient); activity distribution documented; provider-budget
    feasibility demonstrated (no unexplained api-status-0/page-cap on

         

        10% of wallets without a recorded mitigation); supports ≥2 independent
        draws; supports the ≥5-buys/day baseline floor of the normalization
        spec.

8. Constraint register — blocking checks for any new dataset

     C1 Exchange/contract contamination. Automated pre-freeze screening of
    every address against a maintained, source-cited label list. Fail-closed:
    a dataset that has not been screened, or that fails screening, is not
    qualified. Control-2's Binance hot wallet (0x28c6c062…, 3,014 buys in
    one month) is the precedent; a written "exchanges excluded" claim is
    worth nothing.
     C2 Provider quota and completeness. Record per-wallet error
    taxonomy (api-status-0, page-cap), cap pages explicitly, and flag
    truncated histories instead of scoring them as zeros. Precedent: 16/50
    control wallets errored on the availability check.
     C3 Activity documentation. Activity distributions of treatment and
    reference pools must be measured and compared before any run that
    matches on activity. The 49-vs-50 headline masked the mismatch; the
    availability check is the required pre-flight.
     C4 Sample-size feasibility. Before preregistration v2, commit
    availability artifacts for both pools and derive the n-floor arithmetic
    against the actual (selected) evaluation window — not against proxy
    months alone. If the floor is unreachable for any single-event design,
    the design question moves to multi-event pooling or a predefined
    INCONCLUSIVE outcome.
     C5 Window validity. Any evaluation window must show in-window
    forward-return variance for the frozen metric definition (§4.1). A
    regime-normalized metric is a candidate fix, but its reference
    population is blocked (§6.5, §6.6) and its draft status is unchanged.

9. What this document authorizes and does not authorize

Authorized to begin (design work only, no outcome collection):

    control-v3 design against the P3 qualification criteria (§7).
    Treatment-pool availability run, committed as
    data/experiments/availability-<date>-treatment.json (§5.1).
    Power/feasibility analysis comparing single-event, multi-event, and
    predefined-INCONCLUSIVE outcomes.
    Preregistration v2 drafting, superseding prereg v1 sections per §6.
    Synthetic pipeline verification — software correctness only
    (provenance, refusals, provider-failure handling, independent-wallet
    checks). A correct pipeline does not establish that its metric
    predicts anything.

Not authorized:

     No new PEPE candidate extraction beyond the availability runs in §9.1.
     No earlyEntryRate threshold or definition tuning.
     No declaration of any new control or reference population as valid
    before it passes §8-C1..C5.
     No re-run of the discrimination test on the 2026-08-08..08-23 window.
     No promotion of any current dataset to P2 or P3.

10. Blockers to the next gate, in order

    Commit the treatment-pool availability artifact (closes §5.1).
    control-v3 satisfying §7-P3 and §8-C1..C5.
    Sample-size/power feasibility decision: single-event vs multi-event vs
    predefined-INCONCLUSIVE (closes §6.3).
    Preregistration v2, citing this document, with §5.4 (window) resolved
    by a variance-demonstrating selection rule (closes §6.2's grounds).
    Only then: Gate 0b run, with PASS / FAIL / FALSIFY / INCONCLUSIVE as
    preregistered.