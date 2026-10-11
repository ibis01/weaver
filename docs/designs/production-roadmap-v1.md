# Weaver — Production Roadmap v1

**Date:** 2026-10-11
**Status:** Proposal. Gate-based. Four-outcome.
**Governing document:** WEAVER_CONSTITUTION.md v2.0

## Framing

Production is not a date. It is a set of gates, each with a decision
being tested, an exit criterion, and four possible outcomes:

- **PASS** — the criterion is met. Advance.
- **FAIL** — a fixable defect. Iterate in place.
- **FALSIFY** — the underlying assumption is wrong. Revise the roadmap.
- **INCONCLUSIVE** — insufficient evidence. Extend the window or
  increase the population.

Inconclusive is not fail. A gate that returns inconclusive twice, on the
same criterion, for the same reason, becomes falsify by exhaustion.

Gates are ordered by dependency. A UI cannot be proven if the signal does
not fire. Retention cannot be measured if the UI does not exist.

## Current state (2026-10-11)

| | |
|---|---|
| Pipeline | Runs end to end, refusing honestly |
| Signals emitted | **Zero, ever** |
| Wallet-history cache | 118 wallets, 129 pairs |
| Calibration audit | Closed |
| Compliance audit | Closed |
| S1-S3 remediation | All closed |
| Test suite | Green |
| CI | Green |
| Next unscheduled work | Gate 0 |

---

## Gate 0 — Metric validation

**Decision being tested.** Does `earlyEntryRate` measure a property that
distinguishes wallets with real timing skill from wallets without it, on a
defined population, with adequate data?

Gate 0 is three sub-gates, run in order. Each has its own outcome.

### Gate 0a — Preflight data adequacy

**Purpose.** Before any metric claim, establish whether the data can
support one.

**Work.**

1. Freeze a 30-wallet curated list. For each: address, source, rationale,
   date of selection. Commit as `data/wallet-pool-seed-v1.json` with a git
   hash.
2. Freeze a 30-wallet control list. Random sample of non-infrastructure
   EOAs that appear in the top-1000 holders of at least one watchlist
   token but have no claimed timing skill.
3. Freeze a 5-wallet gold-standard list. Wallets with **documented** early
   entries on a specific historical token and period, sourced from
   published on-chain research (Dune dashboards, Arkham labels, or
   peer-reviewed analyses) with the source cited and the entry date fixed.
4. Commit all three lists before any measurement begins.
5. Run a data-quality report:
   - For each wallet, how many priced buys does it have on each watchlist
     token?
   - What fraction of its trades have a same-day and next-day price in the
     map?
   - Which wallets are dropped by `sampleBelowMin`, `notPriced`,
     `noEarlyRate`?
   - What is the coverage of Blockscout history vs CoinGecko price window?

**Exit criterion.** ≥80% of the gold-standard list has ≥10 priced buys on
the documented token within the documented period, and the price map
covers ≥90% of their documented trades.

**FAIL.** If gold-standard wallets can't be scored because their history
is missing or unpriced, the pipeline's data layer is inadequate. Fix
before Gate 0b.

**FALSIFY.** If the data sources cannot recover gold-standard history at
all — e.g. Blockscout doesn't serve that far back, or CoinGecko's 365-day
window can't reach the historical period — then no metric using this data
can be validated. Roadmap needs a data-source revision.

**INCONCLUSIVE.** Insufficient gold-standard wallets available. Expand the
source list, or acknowledge that the historical period is not
reconstructable.

**Duration.** 3-5 days.

### Gate 0b — Metric discrimination

**Purpose.** Does the metric distinguish skilled wallets from random ones?

**Work.**

1. Run the pipeline for 30 days on all three frozen populations. No
   threshold changes during the window. Metric and thresholds are frozen
   at their current values.
2. Record, per wallet per day: `buyCount`, `earlyEntrySampleCount`,
   `earlyEntryRate`.
3. At the window close, compute the distribution of `earlyEntryRate` for
   each population.

**Exit criterion.** The metric discriminates. One of:

- Curated and gold-standard qualification rates are ≥3× the control
  qualification rate, with non-overlapping confidence intervals, OR
- Gold-standard wallets have median `earlyEntryRate` ≥0.3 and control
  wallets have median ≤0.1.

**FAIL.** The curated or gold-standard list qualifies but the control does
too, at similar rates. The metric cannot discriminate. Either the
threshold is wrong or the metric is too coarse.

**FALSIFY.** Gold-standard wallets score at or below control, after Gate
0a confirmed their data was adequate. Then `earlyEntryRate` does not
measure the property its name claims. Return to the calibration audit §4
and rewrite the metric definition, not the threshold.

**INCONCLUSIVE.** Distributions overlap but the sample is too small to
distinguish. Extend the window, or increase the population size. Do not
loosen the criterion to force a result.

**Duration.** 30 days.

**Note.** Zero qualifiers on the curated list, with gold-standard also at
zero, is an **inconclusive** result if control is also at zero. It becomes
**falsify** only if gold-standard wallets — whose early entries are
documented facts — score low. Without gold-standard, zero qualifiers is
not evidence about the metric; it is evidence about the population.

### Gate 0c — Integration and signal emission

**Purpose.** Given a qualifying wallet, can the pipeline produce a
traceable signal?

**Work.**

1. In a staging environment (not production), inject a synthetic candidate
   with a documented profile and a fresh buy in the convergence window.
2. Verify that `convergenceDetector.detect` returns `convergence: true`
   with `independentWalletCount >= 3`.
3. Verify that `smartEntryEngine.compose` emits a `SMART_MONEY_ENTRY`
   signal.
4. Verify the signal has a provenance path to `sm.provenance.v1:*`.
5. Verify the signal renders on the Evidence Card with reasoning visible.

**Exit criterion.** The full path works end-to-end on a synthetic input. A
real qualifying wallet would produce a real signal.

**FAIL.** Any stage in the path drops the signal without an explicit,
logged reason. Fix the stage.

**FALSIFY.** The path cannot be completed at all with the current
architecture. Revisit `smart-radar.js` → `convergence-detector.js` →
`smart-entry-engine.js` integration.

**INCONCLUSIVE.** Not applicable — this gate is a synthetic test with a
definitive answer.

**Duration.** 1 week.

### Gate 0 close

Gate 0 passes when 0a passes **and** 0b passes **and** 0c passes.

If Gate 0b returns INCONCLUSIVE, extend the window to 60 days and re-run.
If the second run is also INCONCLUSIVE, treat as FALSIFY — the population
is too small or too noisy for the metric to be validated at this scope,
and the roadmap revises the population strategy.

**Constitutional relevance.** §2.7 (evidence over fabrication). If the
metric cannot discriminate, no claim about it is honest.

---

## Gate 1 — Candidate pool depth

**Decision being tested.** Can automated discovery reproduce the
discriminating property of the curated pool, at scale?

**Work.**

1. Implement historical pump reverse-engineering (candidate-discovery
   design §4.D).
2. For each watchlist token, find historical pumps (≥20% in 14 days).
3. Query transfer feed for buyers during the 14-42 days before each pump.
4. Add to `sm.wallet-pool.v1` with per-entry provenance.
5. Run the Gate 0b measurement on the automated pool.

**Exit criterion.** Automated pool size ≥500 wallet-token pairs, and its
qualification rate is ≥50% of the curated pool's rate (not equal — the
automated pool includes noise the curated one excludes).

**FAIL.** Automated pool qualifies at <50% of curated rate. Curation was
the mechanism. Redesign the discovery method.

**FALSIFY.** Automated pool is populated but produces zero qualifiers, and
Gate 0b's gold-standard still qualifies. The automated pool is missing the
property the curated pool has.

**INCONCLUSIVE.** Pool size <500 but growing. Extend the window.

**Duration if passing.** 2-3 weeks.

---

## Gate 2 — Cross-token metric

**Decision being tested.** Does `earlyEntryRate` computed across all tokens
a wallet has traded measure transferable skill, or is it an artifact of
one or two tokens?

**Work.**

1. Implement cross-token aggregation in `computeEarlyEntry`. Preserve
   per-token breakdown.
2. Freeze a comparison population: all wallets from Gate 1's pool that
   have ≥5 distinct tokens and ≥20 priced buys.
3. Compute both single-token-dominant rate and cross-token rate for each.
4. Compare using a paired test (Wilcoxon signed-rank for medians, or
   paired t-test if distributions are approximately normal after
   transformation). Report confidence intervals.

**Exit criterion.** Cross-token rate and single-token rate are **not**
statistically indistinguishable: the paired test yields p < 0.05 with a
sample of ≥50 wallets, AND the direction of the difference is consistent
across at least two independent 15-day windows.

**FAIL.** The test shows no difference on adequate sample. Cross-token and
single-token measure the same thing. No change warranted.

**FALSIFY.** Cross-token rate is systematically **lower** than
single-token rate. Aggregation dilutes signal. The current metric was
already as good as it gets.

**INCONCLUSIVE.** Sample <50 wallets, or the confidence interval crosses
zero and the second window hasn't yet been observed. Extend.

**Duration if passing.** 2-3 weeks.

**Constitutional relevance.** §2.9 (no false precision). The current
single-token rate measures something narrower than its name suggests. This
gate either confirms or refutes that the broader measurement is different.

---

## Gate 3 — Evidence surfaces and signal emission

**Decision being tested.** Can a user (not the developer) trace any emitted
signal or refusal end to end?

**Work.**

1. Wire `SMART_MONEY_ENTRY` signals into `intelligence-events`.
2. Extend the Evidence Card with the "Early-entry candidate" layout: why
   flagged, what could invalidate, what is missing.
3. Add a wallet-detail route: address, tokens, trades, early-entry rate,
   sample size, methodology version.
4. Confirm provenance links from every signal to `sm.provenance.v1:*`.
5. Add an equally informative "no signal" state for refusals.
6. Write a walkthrough test: from a signal in the UI, follow links to raw
   provenance, and back.

**Exit criterion.** A user unfamiliar with the codebase can complete the
walkthrough for one signal and one refusal in <10 minutes, without
developer assistance.

**FAIL.** Any trace path breaks. Fix the specific break.

**FALSIFY.** A signal exists that has no provenance path to a raw
observation. That is a §2.7 violation regardless of where in the pipeline
it originates. Freeze feature work.

**INCONCLUSIVE.** Not applicable — the walkthrough is either completable
or not.

**Duration if passing.** 3-4 weeks.

---

## Gate 4 — Reliability and observability

**Decision being tested.** Does the system run for 30 consecutive days
without developer intervention, meeting predefined SLOs?

**SLOs defined before the window opens.** (These are the criteria;
changing them mid-window invalidates the test.)

| SLO | Target | Measurement |
|---|---|---|
| Cycle completion | ≥99% | cycles logged vs cycles expected |
| Data freshness | Last successful cycle ≤15 min ago, 99% of the time | health endpoint, sampled every minute |
| Provider success rate | ≥95% per provider over 24h | logged HTTP status per provider per day |
| Cache growth | `sm.wallet-history.v1` monotonic non-decreasing across the window | daily snapshot |
| Alert latency | ≤60s from cycle completion to alert dispatch | logged timestamps |
| Silent failure rate | 0 unexplained gap in cycle log | every cycle has a logged completion or a logged failure with reason |

A cycle that produces `insufficient-independent-wallets` is a **valid
refusal**, not a failure. The SLOs measure whether the pipeline *ran*, not
whether it emitted. Signal emission is not an SLO.

**Work.**

1. Structured logs with correlation IDs per cycle.
2. Health endpoint: last cycle time, provider status, cache size.
3. Alerting on the six SLOs above.
4. Test fault injection: quota exhaustion, provider outage, malformed
   response, duplicate scheduler invocation, recovery.
5. Document a rollback path for code, config, and scoring versions.
6. Run 30 days.

**Exit criterion.** All six SLOs met for 30 consecutive days, no manual
intervention.

**FAIL.** Any SLO falls below target on >1% of samples. Fix, restart the
30-day window.

**FALSIFY.** A silent failure occurred — a cycle with no log entry, or an
alert that should have fired and didn't. This is a fundamental
observability gap; the whole window's data is untrustworthy until fixed.

**INCONCLUSIVE.** Window interrupted by an external cause (network, infra)
not attributable to the pipeline. Restart.

**Duration if passing.** 3 weeks.

**Constitutional relevance.** §3.4 (graceful degradation), §6.4
(auditable).

---

## Gate 5 — Beta

**Decision being tested.** Do independent users obtain repeatable,
measurable value from the tool?

**Definitions frozen before recruitment.**

- **Weekly active user:** ≥3 distinct sessions in a 7-day window.
- **Session:** ≥1 query or wallet lookup, spaced ≥10 min from the
  previous.
- **Useful alert:** a delivered alert that the tester reports as informing
  a subsequent research action, verified by interview within 7 days.
- **Retention rate:** weekly active testers in week N+4 divided by total
  recruited testers, N = date of first session.
- **Time-to-value:** median minutes from first login to first
  user-reported useful finding.

**Work.**

1. Recruit 10-20 testers from the target audience.
2. Onboard with the Evidence Card and Investigate flow only. No new
   features during beta.
3. Measure the five metrics above.
4. Interview active and churned testers within 7 days of churn or at
   window close, whichever is first.

**Exit criterion.** All three:

- Weekly active rate ≥40% across the 4-week window.
- Retention rate ≥30% at week 4.
- ≥3 testers independently describe the tool as saving time or improving a
  research decision, in their own words, verifiable in the interview
  transcript.

**FAIL.** Any of the three criteria missed on adequate sample. Fix the
specific deficiency, extend the window, re-measure.

**FALSIFY.** Zero testers return in week 2. That is a product problem, not
a data problem. Revisions cascade to Gate 3 and the strategy.

**INCONCLUSIVE.** <8 testers completed the window. Increase recruitment.

**Duration.** 30-45 days.

**Constitutional relevance.** §2.10 (safety before engagement), §9 (does
this make the user better informed?).

---

## Gate 6 — Multi-chain

**Decision being tested.** Does each additional chain independently satisfy
the applicable gates?

**Which gates apply per chain.**

| Gate | Ethereum | Base | Solana |
|---|---|---|---|
| 0a data adequacy | required | required | required |
| 0b metric discrimination | required | required | required |
| 0c integration | required | required | required |
| 1 pool depth | required | required | required |
| 2 cross-token | required | required | required |
| 3 evidence surfaces | required | required | required |
| 4 reliability SLOs | required | required | required |
| 5 beta | optional | optional | optional |

**Chain-specific invariants.** Not all chains share the same data model:

- Solana has no `/token-transfers` endpoint equivalent to Blockscout's;
  the discovery adapter differs.
- Solana's decimals handling, transaction fees, and account model are
  different.
- Base shares EVM semantics and can reuse Ethereum's decoding paths.

**Invariant enforced across chains:** the *interface* is uniform
(`fetchTrades(chain, wallet, token)` → `{trades, reason}`), the *decoding*
is chain-specific, and every chain has a Shield verification adapter
(§3.3).

**Work.**

1. Base adapter. Confirm it satisfies Gates 0a-0c and Gate 4's SLOs on a
   test population before enabling in production.
2. Solana adapter. Same.
3. `test/unit/chain-parity.test.js` extended to cover every discoverable
   chain.

**Exit criterion.** Each additional chain independently passes Gates 0a-4
before appearing as supported discovery.

**FAIL.** Any chain misses any applicable gate. Chain stays unsupported.

**FALSIFY.** The chain's data cannot support the metric at all. Document
and exclude.

**INCONCLUSIVE.** Not applicable.

**Duration.** 2-3 weeks per chain.

---

## Gate 7 — Production release

**Decision being tested.** Are all upstream gates passed, and are security,
compliance, operations, and release controls verified?

**Work.**

1. **Verify** branch protection is actually enforced in repository
   settings — do not rely on a roadmap statement. Confirm via
   `gh api repos/ibis01/weaver/branches/main/protection` and paste the
   JSON into the release PR.
2. Deployment runbook, rollback procedure, on-call rotation.
3. Privacy review, security review, Constitution Check on the release PR.
4. Public documentation of methodology versions and limitations.
5. The disclaimer remains on every meme-coin-facing view.

**Exit criterion.** All upstream gates passed; branch protection confirmed;
all release gates documented and exercised; the release PR contains a
completed §7.4 Constitution Check.

**FAIL.** Any upstream gate not passed. Release does not ship.

**FALSIFY.** Not applicable at this stage.

**INCONCLUSIVE.** Not applicable.

**Duration.** 2 weeks.

---

## What this roadmap does not include

- **Monetization.** Not until Gate 5 produces retention evidence.
- **Additional signals** (`OPPORTUNITY`, `UNLOCK`, etc.). Only after
  `SMART_MONEY_ENTRY` works.
- **A chatbot.** §2.8 constrains AI; a chat surface adds risk without
  evidence it improves decisions.
- **Any paid data provider.** §3.5 requires the free path first.
- **Multi-chain before ETH works.** §3.3.
- **A token, subscriptions, or tiered pricing.** §2.5.

---

## Sign-off criteria — what "production" means

Weaver is in production when:

- A user who is not the developer can use it without intervention.
- Every signal has a provenance path traceable to a raw observation.
- Every refusal has a documented reason.
- No claim of predictive power is made that hasn't survived a holdout
  period.
- The Constitution Check appears on every release PR.
- Scores are versioned, historical results are immutable, losses are
  equally visible.
- The system has run for 30 consecutive days with all SLOs met.

None of these are dates. All of them are measurable.

---

## The one-sentence version

**Weaver reaches production when the metric distinguishes skilled wallets
from unskilled ones on adequate data, the pipeline emits signals from real
qualifiers, the user can trace every signal and refusal to raw
observation, and the system runs unattended — in that order, with a gate
at every step.**

---

## Revision history

This document replaces an earlier draft that collapsed five failure modes
into one and had no control population. The earlier draft would have
wrongly falsified the metric on population failure, data failure, or
integration failure — all of which are distinguishable from metric
failure with the three-list preflight in Gate 0a.

Revised 2026-10-11:

| Issue | Revision |
|---|---|
| Gate 0 collapsed five failure modes | Split into 0a (data), 0b (metric), 0c (integration) |
| Three outcomes | Four: PASS, FAIL, FALSIFY, INCONCLUSIVE |
| No baseline population | Control group + gold-standard group |
| No frozen populations | All three lists committed and hashed before measurement |
| No look-ahead guard | Gold-standard wallets use documented entry dates; the metric is tested against facts, not predictions |
| Gate 2 comparison unspecified | Paired test, n≥50, confidence intervals, two independent windows |
| Gate 4 SLOs vague | Six numerical SLOs defined before the window opens |
| Gate 5 retention undefined | Weekly active, session, useful alert, retention rate, time-to-value all defined |
| Gate 6 chain parity over-broad | Split into required vs optional per chain, chain-specific invariants explicit |
| Gate 7 branch protection assumed | Requires verification via `gh api`, paste into release PR |
