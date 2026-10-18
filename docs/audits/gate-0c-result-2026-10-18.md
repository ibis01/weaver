# Gate 0c — Retrospective skill permutation result

**Date:** 2026-10-18
**Status:** Closed. Narrow positive finding. Prospective validation required.
**Scope:** 49 v2 buyers, direct-pair subset, 2026-01 to 2026-10.

## What was tested

Whether the 49 wallets in `data/pepe-buyer-list/v2.json` bought
PEPE on dates whose 14-day forward return exceeded a permutation
null derived from randomly resampled entry dates.

**Buy definition.** A PEPE inflow where either (a) the inflow came
directly from the Uniswap V2 pair, or (b) the wallet has a QUOTES-token
outflow in the same transaction. This excludes transfers, airdrops,
and other non-purchase receipts.

**Known limitation.** The trade-history pull fetched only PEPE
transfers. The `withQuote` branch of the buy definition could never
fire (0 matches). The test therefore measures the **direct-pair
subset only** — wallets that swap through Uniswap V2 pair
`0xa43fe16908251ee70ef74718545e4fe6c5ccec9f`. Wallets using Universal
Router, 1inch, CoW, or other aggregators are excluded. This is a
narrower population than "the 49 v2 wallets."

**Price scope.** CoinGecko free tier serves only the last 365 days.
The available price file covers 2025-10-19 to 2026-10-18. Buys
before 2025-10-19 were silently dropped. The test spans 9 months,
not PEPE's full 3.5-year history.

## The test

For 203 priced buys (of 1,260 total PEPE inflows across the 49
wallets), compute 14-day forward return. Compare observed mean
against a null distribution built by resampling entry dates.

Pre-declared parameters:
- Seed: 20261018
- Permutations: 10,000
- Horizon: 14 days
- Primary statistic: mean forward return
- One-sided p-value: fraction of null ≥ observed

**Four null models** were tested to isolate confounds:

| check | null construction | p | survived |
|---|---|---:|---|
| base | active days, midday price | 0.0000 | yes |
| B | active days, hour-matched price | 0.0000 | yes |
| C | any priced day | 0.0000 | yes |
| D | month-matched days | 0.0000 | yes |

## Observed vs null

| statistic | observed |
|---|---:|
| mean forward 14d return | +13.69% |
| median | +7.93% |
| fraction positive | 62.6% |
| fraction over +20% | 40.4% |

Base null p95: +6.23%. Check D null p95: +8.62%.

The observed +13.69% exceeds the month-matched null 95th percentile
by 5.07pp.

## Per-month breakdown

| month | n buys | observed | baseline | delta |
|---|---:|---:|---:|---:|
| 2026-01 | 6 | +8.12% | -16.62% | +24.74% |
| 2026-02 | 7 | -16.42% | -5.17% | -11.25% |
| 2026-03 | 12 | +2.89% | +1.25% | +1.64% |
| 2026-04 | 14 | +5.80% | +7.92% | -2.11% |
| 2026-05 | 10 | -13.74% | -14.16% | +0.42% |
| 2026-06 | 17 | -2.91% | -3.93% | +1.01% |
| 2026-07 | 13 | +4.71% | +3.31% | +1.40% |
| **2026-08** | **110** | **+24.23%** | **+12.59%** | **+11.64%** |
| 2026-09 | 13 | +14.88% | +9.81% | +5.06% |
| 2026-10 | 1 | -4.74% | -8.70% | +3.96% |

## Interpretation

**What is established.** Within August 2026, the 49 wallets bought
on days whose forward 14-day returns exceeded the random-August-day
baseline by 11.6 percentage points (n=110, month-matched permutation
p<0.001).

**What is not established.** Skill outside August. Non-August months
show a weighted-mean delta of approximately +1.8pp (n=93, roughly
1.2 standard errors from zero) — indistinguishable from noise at
this sample size.

**Selection coupling.** August 2026 is the month on which the v2
classifier selected this population. The wallets were identified
because they bought PEPE in August. The result confirms they
*timed* their August buys better than random August days. Whether
this represents genuine skill — a property that would persist if
the same wallets traded PEPE in a different month — is not
established by this test.

**Direction check against earlier findings.** An Oct 15 exploratory
run found treatment wallets entered *later* than controls in the
Aug 8–19 band. That earlier result was measured on a degenerate
window (all entries in a single regime band). The current test uses
a multi-month span with a proper null. The two are not contradictory
— they measured different things on different samples. The current
result is the more statistically defensible of the two.

## Verdict

`POSITIVE_SKILL_NARROW` — real signal within August 2026, weak and
non-significant elsewhere. The retrospective test cannot distinguish
"skill" from "the classifier selects wallets whose August timing is
good." That distinction requires prospective evaluation.

## What this does not claim

- Not that these wallets have general timing skill across tokens.
- Not that these wallets will outperform going forward.
- Not that the v2 classifier identifies skilled wallets — only that
  the specific wallets it identified, in the specific month it
  selected them on, timed their buys better than random days in that
  month.
- Not that the result generalizes to the full v2 population —
  aggregator-using wallets were excluded by the trade-history pull's
  scope.

## What to do next

Three options, none urgent:

1. **Prospective validation.** Freeze `data/pepe-buyer-list/v2.json`.
   Track forward PEPE buys by these 49 wallets over the next 6
   months. Apply the same permutation test on a mixed-period sample.
   Answers whether the August signal persists into new data.

2. **Broaden the retrospective test.** Pull quote-asset transfers for
   the 49 wallets (~6h of Blockscout calls), rebuild the buy
   definition, re-run. Answers whether the aggregator-included
   population shows the same signal.

3. **Extend the price history.** Requires a paid CoinGecko tier or
   an alternative price source. Answers whether the effect exists in
   2023–2025 data, not just 2026.

## Provenance

- Test: `scripts/oneoff/gate-0c-skill-permutation.js`
- Checks B/C: `scripts/oneoff/gate-0c-checks-bc.js`
- Check D: `scripts/oneoff/gate-0c-check-d.js`
- Results:
  - `data/experiments/gate-0c-skill-permutation-2026-10-18.json`
  - `data/experiments/gate-0c-checks-bc-2026-10-18.json`
  - `data/experiments/gate-0c-check-d-2026-10-18.json`
- Prices: `data/prices/pepe-365d.json` (CoinGecko, 2025-10-19 to 2026-10-18)
- Trades: `data/trade-history/*.json` (49 files, 2,090 rows, 1,260 PEPE inflows)
