# Gate 0b — Window degeneracy (2026-10-15)

**Status:** Gate 0b unrunnable on the current window. Not a population
problem, not a classifier problem. A test-period problem.

## Finding

PEPE window [25710000, 25820000] = 2026-08-08 through 2026-08-23.
14-day forward return from each entry date (CoinGecko daily closes):

| entry date | 14d fwd | qualifies early (>=20%)? |
|---|---|---|
| 2026-08-08 | +42.7% | yes |
| 2026-08-09 | +42.6% | yes |
| 2026-08-10 | +39.8% | yes |
| 2026-08-11 | +35.6% | yes |
| 2026-08-12 | +42.8% | yes |
| 2026-08-13 | +45.5% | yes |
| 2026-08-14 | +39.5% | yes |
| 2026-08-15 | +38.5% | yes |
| 2026-08-16 | +40.3% | yes |
| 2026-08-17 | +38.0% | yes |
| 2026-08-18 | +33.9% | yes |
| 2026-08-19 | +17.6% | no |
| 2026-08-20 | +14.4% | no |
| 2026-08-21 | -14.3% | no |
| 2026-08-22 | -11.0% | no |
| 2026-08-23 | -12.5% | no |

## Consequence

All 27 buyers in data/pepe-buyer-list/v1.json entered 08-08 through
08-18 — entirely within the qualifying band. Their earlyEntryRate
under the real metric would be 1.0 regardless of any wallet property.

Controls entered 08-09 through 08-23; 57 of 80 in the qualifying band,
23 outside. The 100% vs 71% difference is entry-date distribution, not
wallet behavior.

## Why Gate 0b cannot run on this data

The real metric (earlyEntryRate in wallet-profiler.js) classifies a
buy as early if PEPE rose >=20% over 14 days. On this window that
classifier reduces to "was the entry date before 08-19?" There is no
in-window variance for wallet-level discrimination to act on.

## Relation to Attempt 1

Attempt 1 measured gold-standard wallets with hundreds of buys over a
year, producing rates 0.084-0.133 — not 1.0 — because their buys
spanned many regimes. Our treatment wallets have 1-5 in-window buys,
all in a single pre-pump regime. The metric's behavior differs by
population time-scale, not by wallet skill.

## What this does not establish

- Not that the buyer population is wrong.
- Not that the metric is wrong for its intended use.
- Not that PEPE buyers have or lack skill.

## Prerequisites for future Gate 0b

Either a window with in-period outcome variance, or a regime-normalized
metric (per-wallet excess over date-baseline rate). Neither implemented.
No decision recorded.

## Data

- Prices: /tmp/pepe-prices-range.json (CoinGecko range, 1801 hourly pts)
- Entry blocks: data/entry-blocks/v1.json
- Treatments: data/pepe-buyer-list/v1.json
- Controls: data/control-candidates/v2.json
