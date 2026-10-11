# Gate 0b — Attempt 1 Result

**Date:** 2026-10-11
**Status:** Inconclusive between two hypotheses. Test re-designed, see §5.
**Predecessor:** docs/designs/production-roadmap-v1.md §Gate 0b
**Measurement token:** PEPE (0x6982508145454ce325ddbe47a25d4ec3d2311933)

## 1. What was measured

Five gold-standard wallets, derived from on-chain data: they bought
≥1B PEPE in the 7 days before the 2026-08-22 +28.63% 1-day pump.

Thirty control wallets, sampled deterministically from PEPE's top
holders, excluding contracts and exchange-tagged addresses.

All 35 were appended to `topHolders` on the PEPE cycle and profiled
through the existing pipeline. The convergence detector logged
per-source drop reasons and per-wallet sample/rate.

## 2. Observed result

Gold-standard (all with sample ≥10 priced buys):

| Wallet            | Priced PEPE buys | earlyEntryRate |
|-------------------|------------------|----------------|
| 0x3f9a8345…       | 1276             | 0.084          |
| 0x648b8882…       | 30               | 0.133          |
| 0xcde5d48f…       | 494              | 0.093          |
| 0x2ac51184…       | 758              | 0.099          |
| 0xe4aa002d…       | 463              | 0.095          |
| **median**        |                  | **0.095**      |

Control, subset with sample ≥10:

| Wallet            | Sample | Rate  |
|-------------------|--------|-------|
| 0xc09aadf8…       | 11     | 0.545 |
| 0x94fbdc39…       | 10     | 0.000 |
| 0x6892ba7f…       | 50     | 0.340 |
| 0x50cb1557…       | 246    | 0.163 |
| 0xe19ed111…       | 50     | 0.280 |
| 0xa5f7f1dc…       | 83     | 0.024 |
| **median**        |        | **0.22** |

All five gold-standard wallets dropped at `rateBelowMin`
(earlyEntryRate < 0.5). One control wallet scored 0.545.

## 3. What was expected

The v1 exit criterion was: gold-standard median ≥ 0.3, control median
≤ 0.1. The observed result is the opposite: gold-standard 0.095,
control 0.22.

## 4. Two hypotheses, neither ruled out

**H1 — The metric is broken.** `earlyEntryRate` does not distinguish
wallets whose entry preceded a pump from random wallets. If true, the
metric is falsified and the calibration audit's Section 4 must be
rewritten.

**H2 — The gold-standard list is broken.** Wallets that bought PEPE
before one specific pump are selected on the dependent variable. They
are not wallets with repeatable early-entry skill; they are active
PEPE traders, one of whose many trades happened to precede a pump.
When scored by the metric, they look average because they are average
— except for one event.

Evidence favours H2:

- The five gold-standard wallets have median 494 PEPE priced buys.
  They are prolific traders, not quiet accumulators. Their one
  documented early entry is a fraction of their PEPE activity.
- Control wallet 0xc09aadf8 scored 0.545 with sample 11 — precisely
  the small-sample spike the calibration audit warned about. The
  spike landed in the control, not the gold-standard.
- Control wallet 0x6892ba7f scored 0.34 with sample 50 — higher than
  any gold-standard wallet, with 10× the sample of the smallest one.

If H2 holds, the metric is doing its job. It reports that these
wallets' overall PEPE behavior is indistinguishable from an active
random trader's. That is a correct measurement of a mis-selected
population.

## 5. Why the test was not valid

The v1 gold-standard list was constructed by:
1. Finding a token that pumped
2. Selecting wallets that bought before the pump

This selects for a single event, not a pattern. Any wallet that traded
PEPE heavily during the window has some probability of appearing in the
"bought before the pump" set. The set is a sample of active PEPE
traders, not of skilled early entrants.

Two additional design gaps:

- **Sample-size mismatch.** Gold-standard medians were 494 trades;
  control medians (among the n≥10 subset) were 50. Not a paired
  comparison.
- **No outcome-free control.** The control was random PEPE holders.
  A proper test requires a control that bought PEPE in a week that
  did *not* precede a pump — same trade size, same window length, no
  outcome.

## 6. Verdict

The measurement is a **valid diagnostic** and an **invalid test**.

It is evidence that the metric does not, on its own, produce a
qualification from a single-event gold-standard sample. It is not
evidence that the metric is broken, because the sample it was tested
against is not a population of skilled wallets.

No threshold or metric change is warranted by this result.

## 7. Next

Gate 0b has been revised. See
docs/designs/production-roadmap-v1.md §Gate 0b v2:

- Gold-standard rebuilt to require a **pattern** (≥3 events), not a
  single outcome.
- **Sample-matched** control (matched on PEPE trade count within
  ±30%).
- **Outcome-free** second control (bought PEPE in a random week, no
  pump followed).
- Statistical test (Mann-Whitney U), p < 0.05, ratio ≥ 2×, replicated
  across two independent draws.

The pipeline itself remains unchanged. The gate is retested once the
populations are rebuilt.
