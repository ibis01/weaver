# Gate 0b Experiment Preregistration (v1)

**Document ID:** gate-0b-preregistration-v1
**Date:** 2026-10-17
**Status:** DRAFT — sections marked BLOCKED or PROPOSED require resolution
before any run
**Repository:** ibis01/weaver @ [commit to be pinned at run time]

---

## Preamble

This document preregisters a Gate 0b experiment testing whether
`earlyEntryRate` discriminates wallet populations selected by different
means on an outcome-independent basis.

It is written **before** the experiment is run. Every quantity, rule,
and threshold declared here is fixed at commit. Changes after observing
outcomes invalidate the preregistration.

Motivating history (not optional context):

1. The initial Gate 0b discrimination PASS (2026-10-13) was retracted
   because the "gold-standard" population was routing infrastructure,
   not buyers.
2. A regime analysis (2026-10-15) showed the PEPE window
   [2026-08-08, 2026-08-23] has no in-period forward-return variance:
   every entry date 08-08 through 08-18 preceded a ≥20% 14-day rise;
   every date from 08-19 onward did not. Any metric measured on that
   window is a date classifier.
3. A naive test on that window would produce a false PASS or false
   FAIL for reasons unrelated to wallet skill.

This document specifies what a defensible test looks like and
pre-commits to the criteria that determine its verdict.

## Status legend

- **FIXED** — declared before the run; changing invalidates prereg.
- **PROPOSED** — chosen here but flagged for review; changeable before
  commit, not after.
- **BLOCKED** — cannot be resolved from repository evidence alone.
- **DEFERRED** — out of scope for v1; noted for completeness.

---

## 1. Experiment ID and objective

**Experiment ID:** GATE-0B-V2-2026-10-17

**Objective:** Determine whether wallets classified as PEPE buyers by
the v1.5 attribution pipeline exhibit a statistically and practically
greater `earlyEntryRate` than a matched, outcome-independent control
population, when both are evaluated under the same price history and
the evaluation window has been verified to have in-period
forward-return variance.

**What this is not:** A test of whether Weaver predicts price moves.
It is a test of whether the metric `earlyEntryRate` separates two
populations that the pipeline labels differently. Predictive skill
is a later question (roadmap Gate 4).

## 2. Falsifiable hypothesis

**H1 (primary):** On the selected evaluation window, the median
`earlyEntryRate` of the treatment population exceeds the median of
the matched control population by at least 0.05 (absolute units),
with day-block permutation p < 0.05 (two-sided) and both replication
control-halves showing the same direction.

**H0 (null):** The median difference is < 0.05, OR permutation
p ≥ 0.05, OR the two control halves disagree in direction.

The hypothesis is falsifiable: a single run on a preselected window
yields a numerical outcome that either meets the threshold or not.
No post-hoc reinterpretation converts a FAIL into a PASS.

## 3. Data cutoff and observation period

**FIXED.**

**Data cutoff:** 2026-10-15T00:00:00Z. All on-chain events must have
a block timestamp strictly earlier than this instant. All price data
must be retrievable from CoinGecko as of this date.

**Eligible observation period:** The evaluation window (section 5)
must end no later than 2026-09-01 (44 days before cutoff) so that
the full 14-day forward lookahead completes with margin inside the
data horizon.

## 4. Token and chain universe

**FIXED.**

- Token: PEPE (`0x6982508145454ce325ddbe47a25d4ec3d2311933`)
- Chain: Ethereum mainnet (chainId 1)
- Primary pair: Uniswap V2
  `0xa43fe16908251ee70ef74718545e4fe6c5ccec9f`

**Rationale:** Every prior artifact — buyer populations v1 and v2,
all control pools, the metric implementation, all audit records — is
PEPE on Ethereum. Extending to other tokens or chains is out of scope
for Gate 0b v1.

## 5. Evaluation-window selection rule

**FIXED (rule); PROPOSED (criterion values); BLOCKED (final window).**

The rule is deterministic, blind to treatment/control labels, and
reproducible from public price data alone.

### 5.1 Rule

1. Enumerate the 12 most recent complete calendar months ending on
   or before 2026-08-31.
2. For each candidate month M:
   a. Fetch PEPE daily close prices for
      [start(M), end(M) + 14 days] via CoinGecko.
   b. For each day d in M, compute
      `fwd14(d) = (close(d + 14d) - close(d)) / close(d) * 100`.
   c. Reject M if fewer than 25 of its days have both prices
      available.
   d. Compute `std(fwd14)` over the qualifying days in M.
   e. Compute `pct_early` = fraction of days with fwd14 ≥ +20.
   f. Compute `pct_late`  = fraction of days with fwd14 < 0.
3. **Non-degeneracy criterion:** a month passes if
   `std(fwd14) >= 15` (percentage points)
   AND `pct_early >= 0.20` AND `pct_late >= 0.20`.
4. In reverse-chronological order (most recent month first), select
   the first M that passes.
5. If no month in the 12-month set passes, mark the experiment
   INCONCLUSIVE and escalate to section 5.2.

### 5.2 Prospective fallback

If 5.1 yields no window:

- Commit to start date `T0 = 2026-10-18` (the day after this
  preregistration is committed).
- Evaluation window is `[T0, T0 + 30 days]`.
- Evaluation runs at `T0 + 44 days` (30-day window + 14-day lookahead).
- All criteria from 5.1 apply, evaluated on the prospective window.
- If the prospective window also fails, Gate 0b is INCONCLUSIVE and
  the regime-normalized metric v2 (hourly) becomes the mandatory path.

### 5.3 What is NOT permitted

- Do not test multiple windows and pick the one where treatment
  outperforms control.
- Do not adjust the criterion values (std ≥ 15, pct_early ≥ 0.20,
  pct_late ≥ 0.20) after seeing outcomes on any candidate window.
- Do not choose a window based on treatment-wallet activity. The
  window is chosen by price behavior alone.
- The window [2026-08-08, 2026-08-23] is disqualified by construction:
  the degeneracy audit examined it with knowledge of outcomes.
- If the selection rule yields a window containing no treatment
  wallet first-inflows, the experiment is INCONCLUSIVE (§18).

### 5.4 BLOCKED — final window not yet selected

Section 5.1 is the rule; the concrete window is not yet determined.
The selection script `scripts/oneoff/select-eval-window.js` has not
been written. Once written and committed, its output (candidate
months considered, std/pct values per month, selected window) becomes
part of this preregistration's evidence base.

## 6. Treatment and control populations

### 6.1 Treatment (PROPOSED)

**Primary treatment:** the 49 wallets in `data/pepe-buyer-list/v2.json`.

**Justification:** v2 is derived through the spec-compliant v1.5
attribution pipeline (pre-classification filter §9.1.5, deferred
sub-reasons §3.4). It is the strongest classification currently
produced.

**Secondary treatment (sensitivity):** the 12-wallet intersection of
v1 and v2. Reported alongside, not substituted.

**Not used as primary:** v1 (27 wallets). v1's hold check is
defensible, but its classifier had known bugs that v2 fixes. Using
v1 alone would reintroduce those bugs. Using the intersection as a
cross-check is fine.

### 6.2 Control (PROPOSED)

**Primary control:** `data/wallet-pool-control-2-v1.json`
(50 wallets).

**Justification:** Control-2 was constructed from a
2025-11-29..2025-12-05 window explicitly chosen to have no ≥20%
1-day move in the following 14 days. Wallets in it were therefore
NON-early by construction in *their own* window. This is independent
of the evaluation window's outcomes. Control-2 also excludes
routers, exchanges, and bots at construction time.

**Fresh-pull alternative (DEFERRED for v1):** Pull 50–100 new
control wallets from the evaluation window using v1.5 pre-filter
criteria. Documented here so that if control-2's size is insufficient
after matching, the fresh pull becomes a mandatory next action.

**Exclusions:** any control-2 wallet appearing in v1 or v2 is
excluded before matching.

**Re-verification:** Each control wallet's contract/tag status is
re-checked at run time; wallets failing are dropped and reported.

## 7. Inclusion, exclusion, attribution, deduplication

### 7.1 Inclusion (treatment)

- Address in `data/pepe-buyer-list/v2.json`.
- At least one PEPE acquisition classified DIRECT_ORIGINATOR or
  TRACED_ECONOMIC_RECIPIENT under v1.5 §3.
- At least one PEPE buy in the evaluation window with both buy-day
  and buy+14-day prices available.

### 7.2 Inclusion (control)

- Address in `data/wallet-pool-control-2-v1.json`.
- Not in v1 or v2.
- Not a contract, tagged exchange, router, or MEV bot (re-verified).
- At least one PEPE buy in the evaluation window with prices
  available.

### 7.3 Exclusion

- **Attribution errors:** treatment wallet fails v1.5
  classification on re-verification → exclude, record reason.
- **Shared addresses:** wallet in both pools → remove from control.
- **Contract upgrade:** control wallet shows on-chain contract
  evidence at any block in window → exclude.
- **Zero-buy wallets:** wallets with no qualifying buys in window
  are excluded (not scored 0).

### 7.4 Attribution

- Uses v1.5 §3 rules, unmodified.
- No new attribution is performed. The v2 buyer list is taken as-is.
- Control wallets are not classified as buyers; only their
  eligibility is re-verified.

### 7.5 Deduplication

- One row per lowercased address.
- Multiple ENS aliases for the same address → single row.

## 8. Matching variables and procedure

### 8.1 Matching variable (PROPOSED)

**Primary match variable:** `inCount` — number of PEPE acquisitions
in the evaluation window, per wallet.

**Rationale:** v1.5 §6 and control-1 v2 design already established
`inCount` as a defensible match variable. It controls for wallet
activity, which is confounded with timing.

**Not matched on:** net position (already filtered in v2); first-
inflow day (matching on timing would be circular — timing is the
thing being measured).

### 8.2 Matching procedure (PROPOSED)

- **1:1 matching.** For each treatment wallet with inCount = k,
  select one control wallet with inCount = k uniformly at random
  (without replacement).
- **1:2 fallback.** If 1:1 fails for some inCount values, allow up
  to 2 controls per treatment. Record which.
- **1:k final fallback.** Allow any k ≥ 1; report per-treatment
  match quality.
- **Unmatched treatment wallets** are reported separately (never
  scored 0; never dropped silently).

### 8.3 Randomization seed (FIXED)

`20261017`. Committed in the run script for reproducibility.

## 9. Entry-time and forward-outcome definitions

### 9.1 Primary metric (FIXED)

`earlyEntryRate` per the current wallet-profiler implementation
(14-day lookahead, 20% threshold, daily granularity):

For wallet `w`:

- `B(w)` = PEPE buys of `w` in the evaluation window with both buy-
  day and buy+14-day prices available.
- `early(b) = 1` iff PEPE close at `day(b) + 14d` ≥ 1.20 × PEPE
  close at `day(b)`.
- `earlyEntryRate(w) = |{b in B(w) : early(b) = 1}| / |B(w)|`.
- Sample floor: `|B(w)| >= 10`. Wallets below the floor are excluded
  from the primary analysis (not scored 0).

### 9.2 Secondary metric (BLOCKED — not implemented)

`normalizedEarlyEntryRate(w)` per the regime-normalized spec. The v1
spec exists (`docs/designs/early-entry-rate-regime-normalized-v1.md`)
but has a documented daily-granularity degeneracy: `early(b)` collapses
to a day-indicator, so `normalized(w)` measures buy-concentration, not
timing skill. v2 (hourly) is not implemented. **This experiment does
not test the normalized metric.**

### 9.3 Definition of "entry" (FIXED)

For the metric, a "buy" is any PEPE inflow to the wallet in the
window, regardless of attribution source. This is broader than v1.5
classification and is deliberate: the metric measures timing of any
PEPE acquisition, not just economically-attributable buys.

**Known limitation:** treatment/control populations are selected
differently, but the metric is measured on all inflows. This conflates
"how we selected the wallet" with "how we measure its timing" — but
that is what Gate 0b was originally designed to test. Documented, not
changed.

## 10. Price sources, timestamps, provenance

### 10.1 Source (FIXED)

CoinGecko `coins/pepe/market_chart` with `vs_currency=usd`. Daily
granularity via `interval=daily`. No fallback to alternate sources.

If CoinGecko is unavailable, the run FAILS; it does not substitute
another price source without preregistration.

### 10.2 Timestamps (FIXED)

- CoinGecko timestamps are Unix milliseconds UTC.
- Daily "close" = last price point with timestamp ≤ 23:59:59.999 UTC.
- `day(b)` = `floor(timestamp_ms(b) / 86400000)`.

### 10.3 Provenance (FIXED)

- Price series fetched at run time, cached to
  `data/prices/pepe-{date}.json`.
- SHA-256 hash of the cache file recorded in the run log and the
  registry entry.

### 10.4 Sanity checks (FIXED)

Before use:

- Every day in the window has a price.
- Every day in `[window_start + 14, window_end + 14]` has a price.
- No price ≤ 0.
- No price > 10× the median price in the series.
- No daily return magnitude > 100%.

Any failure aborts the run.

## 11. Minimum sample size and justification

### 11.1 Minimum groups (FIXED)

- Treatment: ≥ 30 wallets with `|B(w)| >= 10`.
- Control: ≥ 30 wallets with `|B(w)| >= 10`.
- Matched pairs: ≥ 25.

Failure → INCONCLUSIVE (§18).

### 11.2 Power (BLOCKED — cannot be defended from current evidence)

Power analysis for Mann-Whitney U on paired medians requires
assumptions about effect size and variance that cannot be justified
from current repository evidence. The 0.05 effect-size threshold in
§2 is a *decision* (declared before run), not a power-derived
minimum detectable effect.

**Known limitation:** With n_treatment = 49 and n_control = 50,
matched 1:1 to ~40 pairs, power to detect a 0.05 median difference
at α = 0.05 is approximately 60–70% under moderate effect-size
assumptions. This is below the conventional 80%.

**Consequence:** The experiment is acknowledged as *potentially
underpowered for small effects*. §18 defines INCONCLUSIVE criteria
so that "not detected" is not conflated with "no effect."

## 12. Missing data, partial coverage, provider errors

### 12.1 Missing prices (FIXED)

- If ≤ 10% of a wallet's buys lack a price, drop the missing buys;
  include the wallet with `n_effective = |B(w)| - missing`.
- If > 10% lack a price, exclude the wallet from the primary
  analysis; report in a partial-coverage table.
- **Never** treat a missing price as `early(b) = 0`.

### 12.2 Provider errors (FIXED)

- All API calls use the retry/fail-closed patterns in
  `find-pepe-buyers-v5.js` and `js/api/prices.js`.
- On final failure, the wallet is excluded and reported as
  `provider-error`.
- Provider errors count against the completeness check (§20).

### 12.3 Partial coverage (FIXED)

- Wallets with some attributed, some UNRESOLVED buys → included
  (metric over attributed buys).
- Wallets whose entire window activity is unresolved → excluded.
- Count of excluded-for-coverage wallets is reported.

## 13. Fees, slippage, liquidity, exit

**DEFERRED, with explicit statement.**

The primary metric `earlyEntryRate` is a timing measure, not a
profitability measure. Fees, slippage, and exit mechanics do not
enter the metric.

**Explicit:** if a future metric is profitability-based, this section
must be expanded. For Gate 0b v1, the metric represents
"if the wallet had exited at the forward price exactly, would it
have cleared the +20% threshold" — not "did the wallet profit in
practice."

## 14. Primary and secondary metrics

### 14.1 Primary metric (FIXED)

`earlyEntryRate` per §9.1, per wallet. Population statistic: median
across matched pairs. Unit of analysis: matched pair
(treatment median − control median).

### 14.2 Secondary metrics (reported, not gating)

- Raw distributions per population (histogram, quartiles).
- Matched-pair deltas (individual).
- 10% trimmed mean of matched differences.
- Bootstrap 95% CI on median difference.
- Per-wallet earlyEntryRate TSV for external re-analysis.

### 14.3 Metrics NOT used

- `normalizedEarlyEntryRate` (not implemented — §9.2).
- Any threshold other than +20% / 14 days.
- Any profitability, realized PnL, or return-based metric.

## 15. Statistical tests, effect sizes, confidence intervals

### 15.1 Primary test (FIXED)

**Mann-Whitney U + day-block permutation.** Two-sided, α = 0.05.

1. Compute observed median difference (treatment − control).
2. Compute naive Mann-Whitney U p-value.
3. **Permutation test:** 10,000 permutations. Permutation preserves
   day-structure: within each day, permute the treatment/control
   label across wallets that bought on that day, producing a null
   distribution that accounts for shared-outcome correlation.
4. Report both p-values; **the permutation p-value is the gating
   one.**

### 15.2 Effect size (FIXED)

- Median difference: `median(treatment) - median(control)`.
- Cliff's delta (dominance statistic) as secondary.

### 15.3 Confidence intervals (FIXED)

Bootstrap 95% CI on median difference, 5,000 resamples at the
matched-pair level.

### 15.4 Multiple testing (FIXED)

No multiple comparisons in primary analysis. Secondary metrics are
exploratory and not gated.

## 16. Correlated observations

### 16.1 Problem statement

Two treatment wallets that bought on 2026-07-15 share the same
`early(b)` outcome for that day; two control wallets on the same
day also share. The effective sample size for the timing signal is
the number of distinct days with qualifying activity, not the
number of wallets.

### 16.2 Handling (FIXED)

1. **Day-block permutation test** (§15.1 step 3) is the primary
   correction.
2. **Report `n_effective`** = distinct days with ≥1 qualifying buy
   in the treatment population. If `n_effective < 20`, the
   experiment is INCONCLUSIVE regardless of p-value.
3. No cluster bootstrap in primary analysis (permutation is
   simpler and pre-registered).

### 16.3 Repeated buys (FIXED)

A wallet buying the same token multiple times in the window counts
all buys in `B(w)`. This matches the current metric implementation.

## 17. Independent replication

### 17.1 Replication requirement (FIXED)

The primary result must replicate on **two independent control
halves.** Control-2 is split deterministically (sorted by address,
split at median) into halves A and B. Primary test run separately
on full set, half A, half B.

**Replication PASS:** primary result has p < 0.05 with the same
sign on BOTH halves (or full sample PASS with one half underpowered
but directionally consistent).

### 17.2 Cross-window replication (DEFERRED)

A second-window replication is recommended if the primary window
PASSes, but not required by this preregistration.

### 17.3 Cross-population replication (DEFERRED)

If v1 (27) and v2 (49) disagree in direction on the same window,
the result is INCONCLUSIVE pending resolution.

## 18. PASS, FAIL, FALSIFIED, INCONCLUSIVE

Defined before the run.

### 18.1 PASS

All of:

- Permutation p-value < 0.05 (two-sided).
- Median difference ≥ 0.05 (treatment − control).
- Both control halves show treatment > control in the same direction.
- `n_effective` ≥ 20 distinct days.
- Completeness check (§20) passes.

### 18.2 FAIL

Both of:

- Permutation p-value ≥ 0.05 OR median difference < 0.05.
- The 95% bootstrap CI on the median difference excludes 0.05.

FAIL = "not demonstrated at threshold." Distinct from FALSIFIED.

### 18.3 FALSIFIED

Both of:

- Median difference ≤ 0.
- Permutation p-value < 0.05 for direction "control > treatment."

FALSIFIED is a strong claim. The primacy of the null hypothesis
means FAIL is the default negative outcome; FALSIFIED requires
demonstrated inversion.

### 18.4 INCONCLUSIVE

Any of:

- Treatment n < 30 after prefiltering.
- Control n < 30 after prefiltering.
- Matched pairs < 25.
- `n_effective` < 20 distinct days.
- Completeness check fails (§20).
- Provider errors > 10% of attempts.
- Window selection yields no candidate window and prospective
  fallback fails.
- v1 and v2 populations disagree in direction (§17.3).

INCONCLUSIVE ≠ PASS ≠ FAIL. It triggers escalation to the
appropriate fallback (prospective evaluation, or regime-normalized
v2, or population resolution).

## 19. Deterministic experiment registry

### 19.1 Registry entry (FIXED)

Each run produces `data/experiments/registry/{id}.json`:

    {
      "id": "GATE-0B-V2-2026-10-17",
      "preregistration_commit": "<git hash>",
      "run_at": "<ISO timestamp>",
      "git_head": "<full commit hash>",
      "window": {"start": "...", "end": "...",
                 "criterion_values": {"std": 15, "pct_early": 0.20,
                                      "pct_late": 0.20}},
      "treatment_population_hash": "<sha256>",
      "control_population_hash": "<sha256>",
      "price_data_hash": "<sha256>",
      "matching_seed": 20261017,
      "test_result": {
        "permutation_p": ...,
        "median_diff": ...,
        "ci_95": [..., ...],
        "n_effective": ...,
        "verdict": "PASS|FAIL|FALSIFIED|INCONCLUSIVE"
      },
      "replication": {"half_a": {...}, "half_b": {...}},
      "completeness": {
        "treatment_with_prices_pct": ...,
        "control_with_prices_pct": ...,
        "provider_error_pct": ...,
        "passed": true
      }
    }

### 19.2 Report (FIXED)

Each run produces `data/experiments/reports/{id}.md` containing all
preregistration sections plus results. The report is the artifact of
record; not editable after commit.

### 19.3 Reproducibility (FIXED)

Any third party with the committed preregistration, the run script,
and the input hashes must reproduce the result bit-for-bit, modulo
non-deterministic sorting of tied addresses.

## 20. Data-integrity and rollback checks

### 20.1 Pre-run checks (FIXED)

Before any result is computed:

1. `git status` is clean.
2. `git HEAD` matches the committed preregistration's
   `preregistration_commit`.
3. `npm run test:unit` passes (725 expected).
4. SHA-256 of `js/intelligence/smart-money/wallet-profiler.js`
   matches the pinned value.
5. SHA-256 of `scripts/oneoff/find-pepe-buyers-v5.js` matches the
   pinned value.
6. SHA-256 of `data/pepe-buyer-list/v2.json` matches the pinned
   value.

Any failure aborts.

### 20.2 Completeness check (FIXED — pass criterion for PASS)

- Treatment wallets with price data: ≥ 90%.
- Control wallets with price data: ≥ 90%.
- Provider-error rate: ≤ 10%.
- No exclusion category unrelated to data availability exceeds 15%.

Any failure → verdict INCONCLUSIVE.

### 20.3 Rollback plan (PROPOSED)

If interrupted or inconsistent:

1. Delete partial output in `data/experiments/`.
2. Restore from `data/prices/` cache (do not re-fetch).
3. Re-run from clean HEAD with the same seed.

No side effects outside `data/experiments/` and `data/prices/`.

### 20.4 Post-run integrity (FIXED)

- `git diff` shows only expected artifacts.
- Registry hashes verify against actual files.
- Report committed alongside registry entry.

## 21. Compliance with WEAVER_CONSTITUTION.md

**BLOCKED.** The contents of `WEAVER_CONSTITUTION.md` were not
available during the preparation of this preregistration. Compliance
cannot be verified against constitutional articles that are not
visible.

**Required before commit:**
- Read `WEAVER_CONSTITUTION.md` in full.
- Verify each of: evidence-first principles, provenance requirements,
  no-unverified-claims rules, threshold-declaration rules.
- Add specific constitutional article citations here, or add an
  explicit waiver with rationale if a specific requirement does not
  apply to preregistration experiments.

This section must not be resolved by invention. If the constitution
imposes requirements the current document does not satisfy, the
document must be amended before commit — not after observing results.

## Appendix A — Evidence base

### Files inspected for this preregistration

- `docs/designs/production-roadmap-v1.md` — full content
- `docs/audits/gate-0b-window-degeneracy-2026-10-15.md` — full content
- `docs/audits/v1-vs-v2-population-reconciliation-2026-10-15.md` —
  full content
- `data/wallet-pool-control-2-v1.json` — first 40 lines
- `data/pepe-buyer-list/v1.json` — count
- `data/pepe-buyer-list/v2.json` — full schema
- `js/intelligence/smart-money/wallet-profiler.js` — key functions
- `test/unit/smart-money-calibration.test.js` — test names

### Files NOT inspected

- `WEAVER_CONSTITUTION.md` — no content; §21 is BLOCKED.
- Full `data/wallet-pool-control-2-v1.json` — only first 40 lines.
- Full `docs/designs/early-entry-rate-regime-normalized-v1.md` —
  session draft only; on-disk content not verified this session.

## Appendix B — BLOCKED / PROPOSED / DEFERRED summary

### BLOCKED

- WEAVER_CONSTITUTION.md compliance (§21).
- Concrete evaluation window (§5.4).
- Power analysis (§11.2) — cannot state with defensible basis.
- Regime-normalized v2 — not implemented; not tested (§9.2).

### PROPOSED

- Treatment population = v2 (49); secondary = intersection (12).
- Control population = control-2 (50).
- Matching variable = inCount.
- Effect threshold = 0.05.
- α = 0.05.
- Non-degeneracy criterion: std ≥ 15pp, pct_early ≥ 0.20,
  pct_late ≥ 0.20.

### DEFERRED

- Fees / slippage / liquidity (§13).
- Cross-window replication (§17.2).
- Cross-population replication (§17.3).
- Fresh control pull (§6.2).

## Appendix C — Revision log

- v1 (2026-10-17): Initial preregistration.
