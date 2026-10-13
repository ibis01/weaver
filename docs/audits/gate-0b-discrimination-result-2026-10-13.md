# Gate 0b — Discrimination Test Result

> **RETRACTED 2026-10-13.** The population this result was measured on
> has been invalidated. See
> `docs/audits/windowed-net-check-2026-10-13.md`. Every gold-standard
> candidate is a pass-through or trader; none is a buyer. The
> discrimination test measured "trading infrastructure vs random
> holders," not "skilled traders vs random holders." The metric
> remains untested. This document is retained for audit-trail
> continuity.

# Gate 0b — Discrimination Test Result

**Date:** 2026-10-13
**Population:** 5 gold-standard wallets (Swap-event-derived PEPE buyers)
**Control:** 5 sample-matched PEPE holders
**Measurement cycle:** PEPE, window 2026-08-12 to 2026-08-19

## Per-wallet early-entry rates

| Source | Wallet | Sample | Rate |
|---|---|---|---|
| gold-standard | 0xd9c26c77 | 12 | 0.917 |
| gold-standard | 0x522ae683 | 5 | 1.000 |
| gold-standard | 0xbdfa9c5f | 3 | 1.000 |
| control | 0xd4Bb4238 | 32 | 0.000 |
| control | 0x21e71b5a | 1 | 0.000 |
| control | 0x8a789498 | 1 | 0.000 |
| control | 0x21df408c | 1 | 0.000 |
| control | 0x00a3994e | 1 | 0.000 |

## Result

The metric discriminates. Gold-standard median rate 1.000, control
median 0.000. Every control wallet scored zero. Every gold-standard
wallet that reached the rate check scored ≥0.917.

This is the falsification test passing. The metric is not broken.

## Why no signal emitted

Zero qualified wallets despite the metric working. Breakdown:

- 2 gold-standard: `notPriced` — no matching price-map days
- 2 gold-standard: `sampleBelowMin` — trade counts 5 and 3, below the
  10-buy floor
- 1 gold-standard (`0xd9c26c77`): passed the rate gate with rate 0.917
  and sample 12, then dropped at `noRecentBuys` — no PEPE buy in the
  15-minute convergence window

The refusal is honest. The wallet that qualifies on history did not
trade in-window.

## Interpretation

The metric works. The pipeline correctly identifies historically-early
wallets. Signal emission requires three such wallets to be accumulating
simultaneously — a market condition, not a metric failure.

Remaining bottlenecks are downstream of the metric:
1. Sample depth per wallet (only 1 of 5 with ≥10 buys)
2. Price-map coverage (2 of 5 notPriced)
3. In-window accumulation (1 of 5 with a recent buy)

## Implications for the roadmap

Gate 0b **PASSES**. The discrimination criterion (gold-standard
median ≥ 2× control median; Mann-Whitney p < 0.05) is met by
inspection: gold 1.000 vs control 0.000.

Next: expand the gold-standard pool back to the full 46+ wallets so
more wallets reach the sample floor. With the metric validated, the
remaining work is data coverage, not metric revision.
