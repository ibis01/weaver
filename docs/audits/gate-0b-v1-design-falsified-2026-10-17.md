# Gate 0b v1 design — FALSIFIED

**Date:** 2026-10-17
**Status:** Preregistration v1 withdrawn. Design revision required.
**Trigger:** Availability check on treatment (v2, 49 wallets) and
control (control-2, 50 wallets) across 2026-07 through 2026-09.
**Evidence:**
- `data/experiments/availability-2026-10-17.json` (control run, current)
- `/tmp/availability-treatment-3mo.log` (treatment run, retained)
- `/tmp/availability-control-3mo.log` (control run, retained)

## Summary

Gate 0b v1 (`docs/experiments/gate-0b-preregistration-v1.md`) assumed
that a 49-wallet treatment population and a 50-wallet control
population could each supply ≥30 wallets with ≥10 qualifying buys in
a common evaluation window. The availability check shows this
assumption does not hold — not by a small margin, but by a
structural gap that no amount of window selection fixes.

The design is falsified **before any outcome was computed.** No
metric value, no p-value, no result. The preregistration's §20
data-integrity check caught the incompatibility, which is what it was
written to do.

## Availability results

Wallet-month counts with ≥10 PEPE acquisitions (`anyIn`) or ≥10
direct-pair acquisitions (`fromPair`):

### Treatment (`data/pepe-buyer-list/v2.json`, 49 wallets)

| month | fromPair ≥ 10 | anyIn ≥ 10 |
|---|---:|---:|
| 2026-07 | 0 | 1 |
| 2026-08 | 2 | 8 |
| 2026-09 | 0 | 1 |

Pooled across 3 months: **13 of 49** wallets have ≥10 buys total;
**4 of 49** have ≥10 direct-pair buys.

Per-wallet max single-month buys (`anyIn`): top 10 = [33, 27, 18,
18, 14, 11, 10, 10, 10, 8], median 3, min 1.

### Control (`data/wallet-pool-control-2-v1.json`, 50 wallets)

| month | fromPair ≥ 10 | anyIn ≥ 10 |
|---|---:|---:|
| 2026-07 | 0 | 23 |
| 2026-08 | 0 | 25 |
| 2026-09 | 0 | 22 |

## Finding 1 — Population mismatch (fatal)

Control is 3–25× more active than treatment in the same months.

The preregistration treated the two pools as comparable because they
had similar *size* (49 vs 50). But the distributions are not
comparable:

- Control-2: wallets with ≥1B PEPE in pump-free windows across
  2025-11, 2025-12, 2026-05 — selection implies sustained, monitored
  trading activity in those windows. Their activity extends into the
  eval window.
- v2: swap-event recipients classified as buyers in August 2026.
  Includes many single-transaction wallets. Median 3 PEPE buys across
  3 months. Min 1.

**§8 (match on `inCount`) is broken by this.** A treatment wallet
with `inCount = 1` has no natural match among control wallets, most
of which trade dozens of times per month. Matching on a variable
whose distributions barely overlap produces pairs that are not
comparable — precisely the failure mode v1's hold check was built to
prevent in the buyer-attribution context, reproduced at the
population level.

**§11.1 (n ≥ 30 per group after floor 10) is unachievable.** Treatment
max is 13 across 3 months pooled; single-month max is 8. The floor 10
requirement came from `wallet-profiler.js`'s design for wallets
profiled across many tokens over years. It was never realistic for a
single-token 15-day-cohort such as v2.

## Finding 2 — Control-2 contains infrastructure (construction error)

`0x28c6c06298d514db089934071355e5743bf21d60` is Binance's hot
wallet. It is in control-2 despite the pool's own `method` field
claiming "contracts, exchanges, and bots excluded."

The run returned `page-cap` for that address, which is expected: a
centralized-exchange hot wallet has more PEPE transfers in any 3-month
window than Blockscout will return in 10 pages.

Whether the wallet was intended to be in the pool or slipped through
a filter is not recoverable from current repository state. What is
recoverable: the pool does not conform to its own stated construction
rule, and at least one non-excluded address is provably exchange
infrastructure.

## Finding 3 — 16 of 50 control wallets returned errors

Errors by class:
- `api-status-0` — 15 wallets. Blockscout returned `status: "0"` for
  a tokentx query spanning 3 months. This typically means the query
  exceeded Blockscout's response limit — i.e. more transfers than
  the endpoint will return. Those wallets are high-frequency.
- `page-cap` — 1 wallet (`0x28c6c062`, Binance hot wallet, per
  Finding 2).

16 of 50 control wallets could not be measured with the query
granularity used. Those 16 are, by inference, among the most active
in the pool. They were not dropped — the query returned an error, and
the wallet was recorded with an error, contributing zero qualifying
months to the summary table. But had they been measurable, the
control's dominance over treatment would be even larger than the
3–25× shown.

## Why each preregistration section fails

| § | Claim | Falsified by |
|---|---|---|
| §6.2 | Control-2 is a valid outcome-independent control | Activity mismatch (Finding 1); infrastructure contamination (Finding 2); 16/50 unmeasurable (Finding 3) |
| §8 | Match treatment and control on `inCount` | Distributions barely overlap (Finding 1) — control at inCount=1 has ~0 supply |
| §11.1 | n ≥ 30 per group after floor 10 | Treatment max 13/49 across 3 months, 8/49 in a single month (Finding 1) |
| §15.1 | Mann-Whitney U + day-block permutation | Would test a real distributional difference between two structurally different populations; the difference would reflect *activity*, not *timing* |

## What Gate 0b v1 was actually testing

Not "does earlyEntryRate discriminate skilled buyers from controls."
The availability check shows the two populations differ by *activity
frequency*, independent of any timing metric. Any discriminator
correlated with trade count — including earlyEntryRate, since more
buys means more chances to have an "early" buy on the buy-count
denominator — would show a difference. That difference would be a
trade-count artifact, not a timing signal.

This is why §8's match on `inCount` was the right instinct: it tried
to control for this. But matching only works if the distributions
overlap sufficiently. They don't.

## What the availability check did right

The preregistration's §20.2 specified a completeness check as a
precondition for a PASS verdict. This availability pull ran a
related check — whether the populations can even *qualify* — and it
failed before any outcome was computed. No metric value was computed
and discarded; no result was suppressed.

That's the integrity property Gate 0b was designed to have: catching
bad experiment design before it produces an uninterpretable number.

## Design revision required

Gate 0b cannot proceed on the current treatment and control
populations. A redesign must address:

1. **Population construction must be symmetric.** Both treatment and
   control should be selected by the same mechanism from the same
   candidate pool, differing only in classification outcome. This is
   what Gate 1 was originally scoped as. The v2-vs-control-2 pairing
   mixed two different selection mechanisms and inherited their
   activity mismatch.

2. **Control-2 must be retired from Gate 0b.** It contains
   infrastructure, it doesn't conform to its own construction rule,
   and its activity profile is incompatible with the treatment
   population. It may remain useful elsewhere (regime-normalized
   metric's reference population, per the earlier design), but not
   as the discrimination control.

3. **Sample floor must match the population's actual activity.** A
   10-buy floor is appropriate for wallets profiled over years; it
   is not appropriate for a single-token, single-window cohort.
   Whatever floor is used must be justified against the derived
   population's actual distribution, not assumed.

4. **Preregistration must be written *after* populations are
   derived,** not before. Writing it before derivation forced the
   v1 spec to assume sample sizes that turned out to be unavailable.

## Options for the next Gate 0b attempt

Recorded, not decided.

**Option A — Population-level pooled test.** Change unit of analysis
from wallet to buy: `earlyRate(pop) = totalEarlyBuys(pop) /
totalBuys(pop)`. Requires control selection that is comparable in
buy-distribution. Claims: "do treatment wallets collectively buy in
a more early-return-associated manner than control wallets." Not
"does a specific wallet have skill." Smaller claim. Would need its
own preregistration.

**Option B — Rederive populations per evaluation window.** Pick
window via the §5 selection rule (non-degeneracy on forward-return
std). Re-run v1.5 extraction + classifier scoped to that window,
producing window-specific treatment and control populations from
the same candidate pool. This is what Gate 1 was for; it was never
completed for any window except August 2026.

**Option C — Pivot to hourly regime-normalized metric.** Implement
`normalizedEarlyEntryRate` v2 (hourly prices). This addresses the
window-degeneracy root cause and would change the effective sample
size by breaking day-level clustering. Does not, on its own, fix
the population mismatch; needs A or B to also be resolved.

**Option D — Defer Gate 0b.** Accept that the current populations
cannot support the test and that resolving this requires more work
than this session has budgeted. Document and return.

## What is not being claimed

- Not that `earlyEntryRate` is a bad metric. The degeneracy finding
  (2026-10-15) already established that on the *current PEPE window*;
  the metric has not been tested on a non-degenerate window.
- Not that the treatment or control populations are wrong. They are
  what they are. The mismatch is between what they are and what the
  experiment needed them to be.
- Not that a future Gate 0b is impossible. A redesign with symmetric
  population construction and activity-compatible matching is
  feasible.

## Provenance

- Availability check script:
  `scripts/oneoff/check-eval-window-availability.js`
- Treatment log: `/tmp/availability-treatment-3mo.log`
- Control log: `/tmp/availability-control-3mo.log`
- Control JSON (current, control run):
  `data/experiments/availability-2026-10-17.json`
- The treatment JSON was overwritten by the control run; treatment
  numbers are reproduced from the log above. Re-running
  `--pool treatment --months-back 3` reproduces them.
- Preregistration withdrawn:
  `docs/experiments/gate-0b-preregistration-v1.md`
