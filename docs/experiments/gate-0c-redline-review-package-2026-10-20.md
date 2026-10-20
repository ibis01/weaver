# Gate 0c Red-Line Review Package — Pre-Activation Flags F1–F5

> **STATUS: DECISION PACKAGE — no prereg text changed.** Owner verdict required
> before any amendment is applied to
> `docs/experiments/gate-0c-skill-test-preregistration-v1.md`. Written
> 2026-10-20, pre-lock; the prereg governs; nothing here amends it. Uncommitted
> (sandbox governance: commit only after user approval).

## 1. What is being decided, and why now

The prereg as drafted has **two independent, pre-knowable mechanical paths to
`UNTESTABLE`**: F1 (§4.2 minimum-N 15 fires under every reading of rule 3) and
— newly registered below — **F5** (§7 G1 excludes every candidate band at
frac_up = 0.00). Both are established from committed blobs and the frozen
price series only, with zero wallet-outcome computation. The r7 §5.5 principle
applies: the lock protocol is never spent on a mechanically known outcome
without that being a recorded choice.

The owner picks a global direction and per-flag dispositions:

- **A — Re-scope at draft** (recommended): amend the prereg pre-lock so it is
  runnable on the population that actually exists; every amendment disclosed
  in the draft changelog.
- **B — Run as drafted**: record the mechanical `UNTESTABLE` as the outcome of
  record. Costs a lock cycle and a prereg v2 for zero new information.
- **C — Shelve v1 at draft**: park the skill question until a new population
  exists (e.g., pattern-engine subset scoring). Costs: the question stays
  unanswered and the pipeline stalls at Gate 0c.

## 2. Evidence base for this review (all offline; no RPC; no outcome data)

| # | Finding | Source |
|---|---|---|
| E1 | Anchor calibration: 27 `(firstBlock, firstTimestamp)` pairs give **7,173 blk/day** inside the window; blocks `[25710000..25820000]` = 110,000 blocks = **15.3 days ≈ 2026-08-08..23 (16 calendar days)** — exactly matching the committed degeneracy audit's line "PEPE window [25710000, 25820000] = 2026-08-08 through 2026-08-23" | `data/entry-blocks/v1.json` (blob `6b4f2535…`); `docs/audits/gate-0b-window-degeneracy-2026-10-15.md` |
| E2 | All 65 confirmed acquisitions lie inside the window (0 outside). **Day mass: 08-12: 5, 08-13: 10, 08-14: 4, 08-15: 6, 08-16: 15, 08-17: 9, 08-18: 16** (7 days; 08-08..11 and 08-19..23 have zero mass). Distinct-day distribution: 45 wallets ×1, 3 ×2, 1 ×4 (max 4; none ≥5). Tx/wallet: 43×1, 2×2, 1×3, 1×4, 1×5, 1×6 = 65 (matches `v2.confirmed`, median 1, max 6) | v5 jsonl (blob `3ab1a0a3…`) mapped through E1 interpolation; `scripts/aw-window-day-mapping.js` (project-external, persisted) |
| E3 | **G1 preview: all 21 (band, day) pairs fail with frac_up = 0.00.** Daily close-to-close returns in the acquisition era span −5.6%..+1.5% — no day reaches +20%. The era's big moves are 14-day *cumulative* rises (+33.9%..+45.5% through 08-18, then negative — the committed audit's "14d fwd" column). Outcome variance therefore EXISTS at horizon scale; the G1 threshold is mis-scaled, the skill question is not degenerate. Horizon coverage fine: 08-18+30d = 2026-09-17 < price_end 2026-10-19 | `data/prices/pepe-usd-daily-365d.json` (sha256 `ae47b4e7…`); `scripts/aw-nic-g1-preview.js` |
| E4 | Day-assignment boundary risk: **4 of 65** acquisitions have interpolated timestamps within 30 min of a UTC midnight (worst ±28 min: blocks `25742511` (08-13T00:28Z), `25771116` (08-17T00:08Z), `25778314` (08-18T00:12Z), `25742495` (08-13T00:25Z)). v5 jsonl carries block numbers only; exact UTC-day assignment for these 4 requires a 4-block timestamp fetch (gated) or is accepted as interpolated with disclosure | E2 mapping script |

Both preview scripts are read-only, persisted at `/home/z/my-project/scripts/`,
and use only committed blobs plus the frozen price series — same class as the
r7 §5.5 preview (informational, not incorporated, no outcome information).

## 3. Flag register and recommended dispositions

### F1 — §4.2 rule 3 excludes the population it governs (prereg §4.4)

Confirmed by E2: max 4 distinct acquisition days; zero wallets reach 5; the
window-length reading covers 2/13 anchor-covered wallets. Under every reading,
rule 5 (minimum-N 15) fires. The per-wallet family was already descriptive-only
(§10), the hierarchy (§9.4) was designed for median-1 support, and §9.5 already
stratifies k=1 vs k≥2.

**Recommended disposition (Option A):** rewrite rule 3 as a *support-tier
register*, not an exclusion; re-unit rule 5's minimum-N on the population
count (≥15 eligible wallets, eligible = ≥1 priceable confirmed acquisition).
Expected eligible N = 49. Per-wallet p-values stay coarse-but-valid under the
joint null (T* is scored under identical mechanics, so T is calibrated
regardless of per-wallet granularity); BH family reports tiers separately.

**Alternative:** accept mechanical UNTESTABLE (B) or shelve (C).

### F2 — §5 `first_seen_w` anchors do not exist for the population (prereg §4.4)

Unchanged by E1/E2: entry-blocks v1 covers 27 v1-era wallets (overlap 13/49)
and is scan-window-scoped. E2 adds the constructive path: with the corrected
16-day window (F4), a **uniform window re-specification makes `first_seen_w`
unnecessary** — every wallet's `A_w := [d_det, d_det+15]` with
`d_det = 2026-08-08` (UTC day of block 25710000; fixed by definition,
cross-checked at P2 freeze against anchor timestamps and the degeneracy audit).

**Recommended disposition (Option A):** pre-lock re-specification above;
disclosed limitation: pre-window entry is unobservable — the design tests
day-position *conditional on detection-window purchase*. The gated
first-ever-inflow extraction is NOT needed for v1 (it could not rescue rule 3
anyway — r7 §5.5 full-year cap ≈ 7–9 < 15) and remains a v2 upgrade path.

**Decision item D1 (day assignment):** (a) anchor-interpolated assignment with
the 4-tx boundary disclosure (E4) — zero RPC; or (b) a minimal gated timestamp
fetch of exactly those 4 blocks (metadata-only, no outcome data) recorded in
the provenance sidecar. Recommendation: (b) if any RPC authorization is
acceptable at all — it converts the last approximation into exact data for 4
calls; else (a).

### F3 — §4.1 denominator wording (prereg §4.4)

Mechanical tighten per r7 §5.5: 49 buyer wallets carry **65 confirmed
acquisitions** (+5 buyer-wallet UNRESOLVED with per-tx evidence; Σ
classifiedTxs = 70); "189 acquisition records" is the run-wide attribution
total (1,132 candidates) and does not describe the population. No option —
apply whichever direction is chosen.

### F4 — NEW: prereg window day-span is wrong (8 days vs 16 days)

The prereg says "detection-window blocks [25710000..25820000] ≈ 2026-08-12..19"
and calls it "the 8-day detection window" (§2.1, §3 MBB row, §4.1, §7). E1
shows the block span is **15.3 days ≈ 08-08..23 (16 calendar days)**, matching
the committed degeneracy audit verbatim. Root cause: `v2.json`'s `window`
metadata field says `{"start":"2026-08-12","end":"2026-08-19"}`, contradicting
the block range used by the same artifact — same metadata-unreliability class
as reconciliation §5.2 ("metadata fields are not version identifiers"). Actual
acquisition mass (08-12..18) explains where the metadata's start came from.

**Recommended disposition (Option A):** correct the prereg to the 16-day
window everywhere; record the v2.json metadata conflict in the P2 freeze
documentation; do **not** edit v2.json beyond the already-planned P2b spec
pointer — the block range is authoritative and the artifact stays byte-stable
except for P2b. All window-dependent sections (§5 A_w, §7 bands, §8.2/8.3
supports, §9.1 denominator) inherit the corrected span.

### F5 — NEW: §7 G1 is mis-scaled for the asset's volatility (mechanical all-exclude)

E3: every (band, day) pair fails G1 with frac_up = 0.00 because no day in the
era reached a +20% *daily* close-to-close move. As drafted, P4 outputs
`UNTESTABLE — no informative band` regardless of population fixes. The
committed degeneracy audit's "14d fwd" column (+33.9..+45.5% through 08-18)
shows the outcome signal the test targets lives at the horizon scale, not the
daily-print scale.

**Options:**
1. **Volatility-calibrated threshold (recommended):** keep G1's form, replace
   the fixed +20% with a mechanical, price-only, pre-unblinding threshold —
   `up-day(d) := ret(d) ≥ P90(trailing 90 daily returns as of the band start)`,
   computed from the frozen series; frac_up ∈ [0.20, 0.80] unchanged. Fully
   deterministic from frozen inputs; no outcome data; disclosed in the draft
   changelog.
2. **Demote G1 to descriptive; gate on G2 alone** (null-result variance ≥ 0.10
   on the percentile scale) — conservative, but loses the calendar-variance
   sanity check that caught the original degeneracy.
3. **Accept mechanical UNTESTABLE** (B/C only).

E3 does not guarantee bands pass under option 1 (P90 of a ±2% era ≈ +1–2% →
frac_up becomes the fraction of notably-positive days, plausibly mid-range,
but only the P4 run fixes it) — it establishes the check is no longer
mechanically dead on arrival.

## 4. Global options

| | A — re-scope at draft | B — run as drafted | C — shelve at draft |
|---|---|---|---|
| Outcome | Runnable prereg; honest narrower estimand | `UNTESTABLE` via F1 **and** F5 (two independent mechanical paths) | No Gate 0c outcome |
| Lock protocol | Spent on a live question | Spent on a known result | Not spent |
| Prereg versions | v1 amended pre-lock (disclosed) | v1 → v2 needed for any progress | v1 archived dormant |
| Information gained | The skill-test answer (or honest INCONCLUSIVE) | None | None |
| When right | Owner wants the question answered this population can support | Owner wants the mechanical path demonstrated end-to-end (r7 §5.5 already establishes it) | Waiting on pattern-engine subset scoring / per-tx evidence extension decision |

**Recommendation: A**, with per-flag dispositions F1–F5 as above. The
re-scoped test is internally valid (null correct, NIC gated, sham placebo,
deterministic recount) and answers the question this population can support:
*day-position vs leave-self-out crowd-weighted chance, conditional on
detection-window purchase*.

## 5. Option A concrete redline (ready to apply on verdict)

1. **§4.1** — F3/F4: window stated as blocks `[25710000..25820000]` =
   **2026-08-08..23 (16 days)**; denominators 65 confirmed (+5 buyer-wallet
   UNRESOLVED with per-tx evidence); "189 acquisition records" moved to the
   run-wide context sentence; v2.json `window` metadata conflict recorded.
2. **§4.2** — F1: rule 3 → *"Support tiers: wallets with < 5 distinct eligible
   acquisition days are registered `thin-support`; their per-wallet statistics
   are reported in the thin tier of every descriptive table. No wallet is
   excluded by support."* Rule 5 → *"Fewer than 15 eligible wallets (≥1
   priceable confirmed acquisition) → UNTESTABLE — population insufficient."*
3. **§5** — F2/F4: `d_det := 2026-08-08` (UTC day of block 25710000; fixed by
   definition; P2 freeze cross-checks anchor timestamps + degeneracy audit);
   `A_w := [d_det, d_det+15]` for every wallet (uniform); `A_w+ :=
   [d_det, price_end]`; `first_seen_w` deleted; day assignment per D1;
   censoring sensitivity unchanged in form.
4. **§7** — F5: G1 threshold per option 1 (P90 trailing-90d, frozen series,
   pre-unblinding); G2 unchanged; NIC still gates P4 and can still exclude
   bands (honest gate).
5. **§4.4** — dispositions recorded per flag, citing this package + r7 §5.5.
6. **Header changelog** — "Draft amended 2026-10-20 pre-lock per red-line
   review (flags F1–F5; previews informational); no outcome computation has
   occurred."

**Unchanged by design:** §3.2 ascertainment premise; §8 nulls (under the
uniform window the §8.3 receiver constraint is trivially satisfied —
acceptance ≈ 100%, rejection sampling retained for form); §9.1 `e_w`
(well-defined, |A_w| = 16); §9.4 hierarchy (built for median-1); §10
co-primary rule and thresholds; §11 sham-run; §12 determinism; §13 skeleton.

**ESS health under the re-spec (from E2 mass):** leave-self-out `ESS_w` ranges
**5.4–6.3** across all wallet profiles (own-day mass 1..16) — Option B weights
active for the entire population; the `ESS_w < 5` fallback never fires. The
zero-mass early days (08-08..11) carry ε-only weight: a wallet buying there is
the strongest early-tail signal the design can express — which is the question
the tool cares about.

## 6. Estimand honesty (what SKILL-DETECTED would and would not mean)

- **Would mean:** the traced-buyer population's entry days within the 16-day
  detection window depart from a leave-self-out, crowd-weighted chance
  benchmark (two-sided; early tail = buying before the crowd), with the
  hierarchy's π estimated over all 49 wallets.
- **Would not mean:** pre-window entry skill (unobservable at F2's root);
  cross-window persistence; per-wallet skill labels (median 1 buy — the
  population-level and hierarchy quantities are the decision quantities).
- **Residual risks:** R1 — G2 may still exclude all bands at P4 (unknowable
  pre-run; gate working as designed). R2 — the 4-tx boundary (D1). R3 — at 65
  events the posterior is pilot-wide by design; `P(π>0) ≥ 0.90` is a high bar
  and moderate effects land INCONCLUSIVE — that is honesty, not a defect. R4 —
  S1's q_w under `A_w+` is concentrated in-window by construction; the ESS
  guard and direction-comparison rule (§10) handle the reading.

## 7. Decision record template (fills §4.4 dispositions on verdict)

```
GLOBAL:    A | B | C
F1:        re-scope | accept-UNTESTABLE | shelve
F2:        window re-spec | gated first-ever extraction | window-free
F3:        tighten (no alternative)
F4:        correct to 16 days (no alternative)
F5:        P90 threshold | demote G1 | accept-UNTESTABLE
D1:        interpolate+disclose | 4-block gated fetch (authorized?)
D2:        apply redline now | after user docs commit
```

**Downstream sequence (on A):** apply redline + changelog → user docs commit
(r7 reconciliation, prereg v1-final, both banners, `gate-0b1-audit-2026-10-17.json`,
duplicate-copy removal, `data/prices` generator note — plus the d2e5d8b
JSON-inclusion fix) → P2a/b freeze (v2.json spec pointer; blob re-recorded) →
P4 NIC → `LOCK_SHA` commit → sham-run §11 → run → results artifact → §12
recount. On B: run mechanically, expect UNTESTABLE, open prereg v2 from its
wreckage. On C: archive v1 as dormant draft; next substantive work returns to
reconciliation §10-2 (control-v3 design) and the pattern engine.

---

## 8. Addendum (2026-10-20, post-execution): P4 NIC ran — verdict FAIL; two new flags F6/F7

P4 was executed the same day, per prereg §7 as amended by this package
(Option A applied at draft). Scope discipline held: offline, no RPC,
price-only (G1) + assignment-only (G2); no wallet-level outcome computation;
inputs hash-verified before execution (v2 blob `73024f5f…`, v5 jsonl
`3ab1a0a3…`, entry-blocks `6b4f2535…`, price series `ae47b4e7…`). Artifact:
`docs/experiments/gate-0c-nic-2026-10-20.md` + JSON sidecar. Population
preview confirmed exactly: 65 confirmed acquisitions, 49 eligible wallets,
0 per-wallet mismatches vs `v2.json`, 27/27 anchors on `d_det..d_det+15`,
both horizons covered, ESS_w 6.04–6.45 (fallback never fires).

**Result: `P4 FAIL` — no (band, horizon) pair passes as specified.**

| Gate | Result | Detail |
|---|---|---|
| G1 (P90 trailing-90d) | all 3 bands fail | pooled frac_up: 3d 0.00, 7d 0.00, 14d 0.05 (excl) / 0.00, 0.00, 0.04 (incl) vs required [0.20, 0.80] |
| G2 (min per-wallet null IQR ≥ 0.10) | fail under strictest reading | min 0.078 (the k=6 wallet), then 0.093 (k=5); median 0.267; all 43 k=1 wallets ≥ 0.200 |

### F6 — G1 era-degeneracy survives re-specification; kill-switch scope flaw

Two threshold specifications now tested and both mechanically fail: fixed
+20% (E3: 0.00) and P90 trailing-90d (0.00–0.05). Diagnosis from the
artifact's per-day table: trailing-90d P90 ≈ 2.9–3.3%/day (it inherits the
May–July era's fat right tail) while band-day returns run −5.6%..+1.5% —
the detection-window era has **no up-day variance at band-day scale under
any trailing-calibrated standard**. The discriminating signal exists only
at horizon scale (14d forward +33.9..+45.5% — the post-window recovery leg).
Second, independent observation: the §9.1 primary statistic (entry-day
position percentile) consumes **no band**, yet §7 routes a G1 wipe-out to
"primary outcome UNTESTABLE — no informative band" — a band gate killing a
band-free primary. Options:

- **(i) Run as-is** → mechanical `UNTESTABLE — no informative band`, now
  certain on two independent grounds; spends the pipeline to learn nothing.
- **(ii) Re-scope at draft (recommended direction, owner wording required):**
  G1's band table becomes a descriptive era characterization (reported, not
  gating); the kill-switch is removed from the band-free primary; horizons
  for descriptive post-entry returns are fixed without G1. Disclose that
  band-day up-variance is absent in this era.
- **(iii) Shelve v1** (global Option C).

A third threshold re-specification is **not** offered as an option: after
two calibrated failures, further threshold search is threshold-shopping.

### F7 — G2 reading ambiguity (material)

"The per-wallet statistic's null IQR must be ≥ 0.10" is ambiguous and the
readings disagree: min-over-wallets 0.078 (FAIL) vs median 0.267 (PASS).
Structural observation: the min reading fails **exactly the two
highest-support wallets (k=5, k=6)** — averaging k draws contracts the null
spread (∝ 1/√k) on an already-concentrated crowd-weight null, so the
strictest reading penalizes precisely the wallets whose nulls are tightest,
i.e. most discriminative. That inverts G2's stated rationale ("the test
cannot discriminate"). Options: (a) fix the reading (median or pooled,
disclosed); (b) re-derive the gate from the §8.3 population null's IQR (the
quantity the population primary actually relies on; requires one more
offline computation if chosen); (c) keep min and accept FAIL.

### Status and next step

The prereg §1 P4 bullet now records the executed status factually (no spec
change). Nothing was amended in §7 beyond what the F5 disposition already
authorized; F6/F7 are **registered, not applied**. The owner's verdict set
is now: GLOBAL A/B/C (unchanged) + F6 (i/ii/iii) + F7 (a/b/c). On (ii)+(a)
or (ii)+(b): apply the focused redline v2 at draft, re-run P4 (offline,
minutes), then the docs commit → freeze → LOCK_SHA sequence proceeds. The
user-machine items are unchanged: d2e5d8b JSON-inclusion fix, then the docs
commit (which should now also carry the NIC artifacts and this addendum).
