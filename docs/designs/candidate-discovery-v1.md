# Candidate Discovery — Design v1

**Date:** 2026-10-11
**Status:** Proposal. Not scheduled. Implementation requires its own PR.
**Predecessor:** docs/audits/smart-money-early-entry-2026-10-11.md §5

This document is a specification, not a commitment. It answers "what would
fix the bottleneck" without answering "when." Its purpose is to prevent
drift: if candidate discovery is built, it is built to this design or the
design is revised first.

---

## 1. Problem

The calibration audit closed with a specific finding: the Smart Money
pipeline selects candidates by **current holding size**, and holding size
does not correlate with **historical timing skill**.

Evidence (from §5 of the audit):

- 88 candidates across 11 tokens evaluated after the calibration change.
- 31 of 32 wallets with ≥10 priced buys had `earlyEntryRate < 0.5`.
- Zero wallets qualified for convergence.
- Median sample size: 20 priced buys. Depth is fine. Selection is not.

The pipeline's candidate set is:


That selects for wallets that **hold a lot of a token right now**. The
metric being tested is "did this wallet buy early relative to a pump."
These are different properties, and the population of the first is not
enriched for the second.

No threshold change fixes this. Lowering `MIN_HISTORICAL_EARLY_RATE`
qualifies wallets whose behavior is indistinguishable from random.

---

## 2. Current selection path

Entry: `js/features/smart-radar.js`


Note the shape at step 5: `profile()` receives a **one-token list**. So
`earlyEntryRate` is computed from this wallet's trades on this token only.
The metric as currently applied is not "is this wallet a historically
early entrant," it is "did this wallet buy this specific token early."

Even if the selection were perfect, the metric would be narrower than the
name suggests.

---

## 3. Requirements for a better selection

A candidate selection mechanism must satisfy:

**R1 — Enriched for the metric.** Whatever set it produces should contain
wallets whose *aggregate historical behavior* is above the population base
rate for early entry, not merely wallets that hold a lot of the token.

**R2 — Reproducible.** The same inputs must produce the same set. No
random sampling, no unstable external ranking that changes minute to
minute.

**R3 — Cheap to maintain.** Adding a candidate must not require a new
external provider, a paid API, or a manual update per cycle.

**R4 — Observable.** The system must record, per candidate, why it entered
the pool. If a candidate later qualifies, the audit trail from "why we
picked them" through "why they qualified" must exist.

**R5 — Bounded.** The pool must have a size ceiling. Unbounded growth is
incompatible with the current pipeline's cycle time and Redis key shape.

**R6 — Falsifiable.** If the selection method is wrong, it must produce
measurably zero qualifiers over a defined window, not merely "fewer than
expected." Absence of evidence must be visible.

---

## 4. Alternative selection paths

Four candidates. Each is assessed against R1–R6.

### A. Recent buyer extraction

For each watchlist token, query the transfer feed over the last N days
(N ∈ {7, 14, 30}). Extract every unique `to` address (buyer). Add to the
candidate pool.

**Strengths.**
- Uses public data already available via Blockscout (`/tokens/{addr}/transfers`).
- Every candidate is definitionally someone who *bought this token*
  recently, so the pool contains active participants, not just passive holders.
- Bounded by N: as N shrinks, the pool shrinks.

**Weaknesses.**
- Still token-centric. Wallet X might buy 100 tokens; the pool stores X
  once per token, not once as a profile.
- Recent ≠ early. A wallet buying today is not evidence of early entry
  skill; it is evidence of recent activity.
- Susceptible to wash trading, MEV bots, and airdrop hunters.

**R1 assessment:** Weak. Recent buyers include bots and airdrop farmers
who have no timing skill. Possibly no better than the current path.

**R2:** Yes. Deterministic given block range.

**R3:** Yes. One Blockscout endpoint, already in use.

**R4:** Yes. "Entered pool via recent buy on {token} at {block}."

**R5:** Yes. Cap by `N × tokens × avg_buyers_per_block`.

**R6:** Yes. Qualification rate measurable over a fixed window.

**Verdict:** Insufficient alone. Useful as an input signal.

### B. Cross-token wallet profiles

Reuse the existing `sm.wallet-history.v1` cache, but compute
`earlyEntryRate` across **all tokens the wallet has traded**, not just
the token currently being evaluated.

**Strengths.**
- Zero new data sources. Everything is already cached.
- Correctly measures "is this wallet a historically early entrant"
  rather than "did this wallet time this one token."
- R1 directly addressed: cross-token rate is a much better proxy for
  skill than single-token rate.

**Weaknesses.**
- Blocked by data: 114 of 118 wallets in the cache appear on exactly one
  token. There is nothing to aggregate yet.
- Fixing the data requires either A (recent buyers, still token-centric)
  or C (curated seed, small).

**R1 assessment:** Strong if the pool is broad enough. Currently blocked.

**R2:** Yes.

**R3:** Yes once data exists.

**R4:** Yes.

**R5:** Yes.

**R6:** Yes.

**Verdict:** The correct metric, but needs a broader candidate source
before it can be evaluated.

### C. Curated seed list

Manually curate 20–50 known smart-money wallet addresses from public
research (Arkham labels, Dune dashboards, published on-chain analysis).
Add them to a persistent watchlist. Profile them weekly.

**Strengths.**
- Bypasses the selection problem entirely. The list is either right or
  wrong and can be evaluated directly.
- Small, bounded, cheap.
- Immediate test of whether the metric produces signal at all when
  applied to a hand-picked population.

**Weaknesses.**
- Doesn't scale. A 50-wallet list is not a discovery system.
- Curation is a manual, subjective act. It can be wrong.
- Introduces a form of survivorship bias if the curator only picks
  wallets known to have won.

**R1 assessment:** Strong by construction.

**R2:** Yes, if the list is versioned.

**R3:** Cheap, but the curation is not automatable.

**R4:** Yes.

**R5:** Yes, trivially.

**R6:** Yes. If 50 carefully-curated smart wallets produce zero qualifiers
under the calibration's thresholds, the metric is wrong, not the selection.

**Verdict:** The cleanest way to falsify the metric. Smallest first step.

### D. Historical pump reverse-engineering

For each token in the watchlist, find historical pumps (≥20% in 14 days,
already detectable from CoinGecko). For each pump window, query the
transfer feed for buyers during the 14–42 days before the pump. Those
buyers are, by definition, historically-early entrants on that token.
Add them to the candidate pool.

**Strengths.**
- Directly constructs the population the metric is testing for.
- Uses the same data sources as A, but filtered by an outcome.
- Pool composition is defensible: "these wallets bought before a pump."

**Weaknesses.**
- Requires historical transfer queries per token, per pump window. More
  expensive than A or C.
- Backward-looking. A wallet that was early on one token may not be
  early on another.
- Susceptible to one-hit wallets. A wallet with 50 total buys that
  happened to be early once would qualify for the pool but have a low
  aggregate rate.

**R1 assessment:** Strong. The pool is definitionally enriched.

**R2:** Yes, given fixed pump criteria.

**R3:** Medium cost. One additional endpoint per token, per pump window.

**R4:** Yes. "Entered pool via early buy on {token} during {pump_window}."

**R5:** Yes, capped by pump count × window buyers.

**R6:** Yes.

**Verdict:** The most direct fix. Highest build cost but lowest
falsification risk.

---

## 5. Proposed sequence

None of these is a full solution on its own. In order:

**Step 1 — C (curated seed).** Smallest, cleanest test of whether the
metric produces any qualifying wallet when the population is hand-picked.
If 50 curated smart wallets yield zero qualifiers over 30 days, the metric
is falsified and no candidate-selection change fixes it.

**Step 2 — D (historical pumps).** If Step 1 yields qualifiers, this is
the smallest automated expansion of the same population. It preserves the
"buyers before a pump" property that made C work.

**Step 3 — B (cross-token profiles).** Once the pool from steps 1–2 is
large enough (say 500+ wallet-token pairs), re-evaluate the metric across
all tokens per wallet. This is the correct long-term measurement.

**Step 4 — A (recent buyers).** Only as a live signal input, not as a
pool-building method. Recent buyers who are *also* in the pool (from C or
D) form the accumulation-window candidates. Recent buyers alone are too
noisy.

This sequence:
- Tests the metric before investing in the selection machinery (Step 1).
- Automates the population only after the metric is shown to produce signal.
- Defers the broad data-pipeline work (Step 3) until the population exists.

---

## 6. Smallest testable version of Step 1

Curate 30 wallet addresses from public sources.
Document each: address, source, why it is expected to have timing skill.

Add a new persistent key sm.wallet-pool.v1 with the list.

Modify smart-radar.js to also profile pool wallets against the current
token on each cycle (in addition to the top-8 holders).

Keep convergence-detector.js unchanged.

Run for 30 days.

Measure: distinct qualifying wallets, by source (curated vs holder).

Success: at least one qualifying wallet per week from the curated set,
observed across ≥4 weeks, with at least one signal emission.

Falsification: zero qualifiers from the curated set over 30 days.

Either outcome is a valid result. The falsification outcome is more
informative: it would tell us the metric itself is wrong.

---

## 7. Out of scope

- Chain expansion. This design is ETH-only, matching the current pipeline.
- Provider expansion. Blockscout + CoinGecko cover everything described.
- Changes to `wallet-profiler.js`, `convergence-detector.js`, or
  `wallet-history.js`. The design assumes the calibration from the
  audit is fixed.
- UI surfaces. This is a backend discovery problem; the Evidence Card
  and Investigate flow already exist.
- ML or embedding-based wallet similarity. Deferred until the pool is
  broad enough to make it meaningful.

---

## 8. What would make this design wrong

- If the curated set (Step 1) yields qualifiers but the automated set
  (Step 2) does not, then curation is the mechanism, not enrichment.
  That would be a form of survivorship bias and would require
  re-deriving the metric without the outcome in the loop.
- If qualification depends on pump count (a token that pumps often has
  more qualified wallets by construction), the metric is confounded by
  asset volatility.
- If curated wallets qualify on 1–2 trades but not on 10+, the
  minimum-sample gate is doing the work and the selection is irrelevant.

These are reasons the design might need revision before implementation.
They are not reasons to skip Step 1. Step 1 is the falsification test.

---

## 9. Related

- docs/audits/smart-money-early-entry-2026-10-11.md — the finding
- docs/audits/constitution-compliance-2026-10-11.md — governs any
  implementation of this design
- js/features/smart-radar.js — where selection happens today
- js/intelligence/smart-money/wallet-profiler.js — the metric
- js/intelligence/smart-money/convergence-detector.js — the gate
