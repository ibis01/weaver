# Smart Money — Early-Entry Calibration Audit

**Date:** 2026-10-11
**Status:** Closed — decision recorded, implementation pending
**Scope:** EARLY_ENTRY_PUMP_PCT, EARLY_ENTRY_LOOKAHEAD_DAYS, MIN_HISTORICAL_EARLY_RATE, minimum-buys requirement

## 1. Finding

Across 157 wallet-token samples in `sm.wallet-history.v1`, the profiler
evaluated 2997 priced buys and flagged 44 as "early". Population base rate:
1.47%.

Definition in force at time of measurement: a buy is "early" if the price at
the close of the calendar day following the trade is >=20% higher than the
price on the trade day itself.

- wallet-profiler.js:32  EARLY_ENTRY_PUMP_PCT = 20
- wallet-profiler.js:33  EARLY_ENTRY_LOOKAHEAD_DAYS = 1

Sample: 118 distinct wallets, 16 L1-native tokens, top-8 non-infrastructure
EOA holders per token. Buys priced against CoinGecko daily market_chart
covering 365 days. Wallet-history is fully paginated; the sample includes
wallets with up to 1117 transfers.

Stable across sample sizes:

| Sample  | Wallets | Priced buys | Early | Rate  |
|---------|---------|-------------|-------|-------|
| Early   | 7       | 254         | 15    | 1.10% |
| Current | 118     | 2997        | 44    | 1.47% |

Data-quality caveats:
- 29% of eligible buys could not be priced (predate the 365-day window).
- Each `side: "in"` transfer is counted as a buy; paired swap legs count twice.

Cross-token measurement gap: 114 of 118 wallets appear on exactly one token.
The current earlyEntryRate measures timing on one specific token, not wallet
skill in general. Cross-token profiling requires a broader candidate
universe. Out of scope for this phase.

## 2. Current gate

convergence-detector.js:175

    if (hp.earlyEntryRate < MIN_HISTORICAL_EARLY_RATE) continue;

MIN_HISTORICAL_EARLY_RATE = 0.5.

A wallet qualifies only if at least half its historical buys were followed by
a >=20% next-day rise. That is roughly 34x the observed base rate at 1-day.

Observed: zero qualifying wallets across 118 wallets and 2997 priced buys.
Refusal reason was `insufficient-independent-wallets` on every cycle since
the pipeline went live.

Lookahead diagnostic (no production behavior change):

| horizon | priced buys | early | population rate |
|---------|-------------|-------|-----------------|
| 1d      | 2997        | 44    | 1.47%           |
| 3d      | 2883        | 136   | 4.72%           |
| 7d      | 2760        | 238   | 8.62%           |
| 14d     | 2450        | 376   | 15.35%          |

Per-wallet qualification at each horizon:

| horizon | samples | >= 0.5 | p95   | max   |
|---------|---------|--------|-------|-------|
| 1d      | 99      | 0      | 0.160 | 0.231 |
| 3d      | 98      | 3      | 0.238 | 1.000 |
| 7d      | 96      | 8      | 0.667 | 1.000 |
| 14d     | 90      | 17     | 1.000 | 1.000 |

At 14 days, 17 of 90 wallet-token pairs qualify. At 1 day, zero.

Bimodality problem: at 14 days the 95th percentile is exactly 1.000. About 5%
of pairs score perfectly — inconsistent with skill, consistent with small
samples. Trade-count histogram shows many wallets with fewer than 5 buys.

## 3. Options considered

A. Do nothing.
B. Lower the gate (0.2, 0.1, 0.05) — fit-to-signal risk.
C. Extend the lookahead — admits small-sample noise on its own.
D. Restrict watchlist to volatile assets — memecoin-only Phase 1.
E. Combine — extend lookahead, keep 20% and 0.5, add minimum-buys.
F. Position-level early entry — small benefit, larger refactor.
F'. Cross-token profiling — correct long-term metric; not available now.

## 4. Recommendation

### 4.1 Which option?

E — combine.

- EARLY_ENTRY_LOOKAHEAD_DAYS: 1 -> 14
- EARLY_ENTRY_PUMP_PCT: 20 (unchanged)
- MIN_HISTORICAL_EARLY_RATE: 0.5 (unchanged)
- MIN_EARLY_ENTRY_SAMPLE: 10 (new)

### 4.2 Why?

The 1-day horizon is an artifact of the definition, not a property of the
data. Extending to 14 days raises the population rate tenfold and produces
17 qualifiers. But the 14-day distribution is bimodal; its 95th percentile is
exactly 1.000, driven by wallets with fewer than 10 priced buys. A rate of
0.5 computed from three buys is noise. So: make the horizon honest, and
require a minimum sample before the rate is treated as a measurement. The
0.5 rate gate is not lowered. The 20% bar is not loosened.

### 4.3 What does it cost?

1. Late signals — up to 14 days elapsed before qualification.
2. Survivorship of the patient — wallets with <10 buys are excluded.
3. No proof of predictive value — this adjusts a gate; it does not validate
   that the signal predicts anything. That is Phase 4, not this decision.

## 5. Consequences

To be recorded after the implementation PR has run for a defined window.
Capture: qualifying wallets per cycle, reason-code distribution, any signal
emissions, and whether a fresh lookahead diagnostic reproduces Section 1.

## 6. Related

- js/intelligence/smart-money/wallet-profiler.js
- js/intelligence/smart-money/convergence-detector.js
- js/intelligence/smart-money/wallet-history.js
- js/features/smart-radar.js
- Weaver Handoff — October 9, 2026
