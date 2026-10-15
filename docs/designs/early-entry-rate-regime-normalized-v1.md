# Weaver — Regime-Normalized earlyEntryRate (v1)

**Date:** 2026-10-15
**Status:** Draft for review. Not implemented.
**Predecessor:** `docs/audits/gate-0b-window-degeneracy-2026-10-15.md`
**Related:** `docs/designs/production-roadmap-v1.md` (Gate 2),
`js/intelligence/smart-money/wallet-profiler.js` (current metric)

## 1. Why this document exists

The current `earlyEntryRate` metric is:

    earlyEntryRate(w) = |{buys of w followed within 14 days by a
                          >=20% price rise}|
                        / |{priced buys of w}|

It measures what fraction of a wallet's buys were followed by a pump.
It does not adjust for the fact that buys made on the same day share
the same forward outcome.

On the PEPE window [2026-08-08, 2026-08-23], every entry date 08-08
through 08-18 preceded a >=20% 14-day return; every date from 08-19
onward did not. Any wallet that bought during the first band scores
`earlyEntryRate ~= 1.0` regardless of skill. Any wallet in the second
band scores `0`. The metric is a date classifier on this data.

Two remedies were named in the degeneracy audit:

- (a) select a different historical window with in-period outcome
  variance, or
- (b) replace the metric with a regime-normalized variant.

This document specifies (b). It does not select a window, does not
change the current metric in production, and does not run Gate 2.

## 2. Scope

**In scope.** A derived metric, `normalizedEarlyEntryRate`, computed
from the same inputs as `earlyEntryRate` plus a reference population.
Its purpose is to isolate wallet-level timing skill from regime-level
price movement.

**Out of scope.** The base `earlyEntryRate` remains as defined. Any
downstream consumer can choose the raw or normalized value. The
normalized metric does not replace the raw one in the audit record —
it is emitted alongside.

## 3. Definition

Let:

- `B(w)` = set of priced buys of wallet `w` in the evaluation window
- `P` = reference population (see section 4)
- `early(b)` = 1 if the price of the asset 14 days after `b` is
  >=20% above the price at `b`, else 0
- `day(b)` = the calendar day (UTC) of buy `b`

Define the **day baseline**:

    baseline(d) = |{buys b in P with day(b) = d and early(b) = 1}|
                  / |{buys b in P with day(b) = d}|

This is the fraction of reference-population buys on day `d` that
qualified as early. It is the same for every wallet, on the same day.

Define the **wallet baseline** as the mean day baseline over the
wallet's buy days:

    baseline(w) = mean over d in {day(b) : b in B(w)} of baseline(d)

Define the **normalized metric**:

    normalizedEarlyEntryRate(w) = earlyEntryRate(w) - baseline(w)

Interpretation. A wallet whose buys land on days the market rewarded
everyone has `baseline(w)` near its `earlyEntryRate(w)`, so
`normalized` is near zero. A wallet whose buys land on days the market
did not reward has `baseline(w)` low, and `normalized` reflects only
the wallet's own timing above the market's.

Range. `normalizedEarlyEntryRate` is in [-1, 1].

## 4. Reference population

The baseline is only as good as the reference population `P`. Three
candidates were considered:

| population | source | property |
|---|---|---|
| All candidates in the run | `data/pepe-buyer-list/v2.json` | Correlated with treatment |
| Control-2 pool | `data/wallet-pool-control-2-v1.json` (50 wallets) | Independent, size sufficient |
| Fixed synthetic index | Not implemented | Requires new infrastructure |

**Selection: Control-2 pool.** It is independent of both v1 and v2
buyer populations, has enough wallets for stable per-day estimates,
and is already committed.

Sample floor. A day `d` must have >=5 reference-population buys for
`baseline(d)` to be used. Days below the floor are excluded from the
wallet-baseline mean, and reported.

## 5. Data requirements

The metric needs, for each wallet in treatment and reference:

- Trade history (buy/sell, timestamp, token, amount)
- Daily price series for the token

Both are already available:

- `js/intelligence/smart-money/wallet-history.js` fetches per-wallet
  transfer history via Blockscout v2.
- `js/api/prices.js` fetches daily price series via CoinGecko (with
  fallback chain).

No new provider is required. The reference population's trade history
may need a one-time pull of the 50 control-2 wallets if not already
cached.

## 6. Failure modes

**Sparse reference days.** Days with fewer than 5 reference buys yield
an unreliable baseline. Excluded, reported in the sample fraction.

**Missing prices.** Buys without a matching day price are dropped from
`B(w)`, same rule as the current metric.

**Sample floor on the wallet.** The wallet-level floor remains 10
priced buys. Wallets below the floor return `normalized: null` with
a reason code.

**Reference contamination.** If any wallet appears in both the
reference and the treatment populations, remove it from reference
before computing baselines. Enforced at load time.

**All buys on one day.** `baseline(w)` collapses to a single day's
rate. Reported with a warning flag `single-day-baseline`.

**Regime extends past window.** The 14-day lookahead for a buy on the
last day of the evaluation window must not read past the data
boundary. Same rule as the current metric: buys whose forward window
crosses `asOf` are dropped.

## 7. Acceptance criteria

Pre-declared (written before any run against the populations):

1. **Discrimination.** On the treatment and matched-control
   populations, the distribution of `normalizedEarlyEntryRate` must
   differ at `p < 0.05` (Mann-Whitney U, two-sided).
2. **Effect size.** Treatment median must exceed control median by at
   least 0.05 in absolute normalized units.
3. **Replication.** The result must hold on two independent draws of
   the control pool (split control-2 into halves; report each).
4. **Non-degeneracy.** At least 40% of evaluation-window days must
   pass the reference-buy floor. If not, the reference population is
   too sparse and the window is not evaluable.

Failure of any of the four leaves the metric unvalidated. No
threshold is adjusted after the result.

## 8. Test fixtures

Synthetic wallets with known properties. Each fixture is a small
set of trades plus a price map.

| fixture | expected |
|---|---|
| Wallet buys only on high-baseline days | `normalized ~= 0` |
| Wallet buys only on low-baseline days, all early | `normalized > 0.5` |
| Wallet buys only on low-baseline days, none early | `normalized ~= 0` |
| Wallet buys all on one day | `single-day-baseline` warning |
| Wallet with <10 priced buys | `normalized: null`, `reason: sample-below-floor` |
| Wallet whose buys cross `asOf` | forward-window buys dropped |

Tests assert the observed value is within +-0.05 of expected.

## 9. Audit record

Every wallet gets a record:

    {
      "wallet": "0x...",
      "earlyEntryRate": 0.42,
      "earlyEntrySampleCount": 24,
      "baseline": 0.31,
      "normalizedEarlyEntryRate": 0.11,
      "referencePopulation": "control-2-v1",
      "daysExcluded": ["2026-08-13"],
      "warnings": [],
      "asOf": "2026-10-15T00:00:00Z"
    }

The full record is emitted per wallet, alongside the raw metric. Any
downstream consumer sees both.

## 10. What this does not do

- It does not select an evaluation window. That remains a separate
  decision.
- It does not change `wallet-profiler.js`. The normalized metric is a
  new computation that reads the same trade and price data.
- It does not run Gate 2. Gate 2 is a test of whichever metric is
  specified; this document specifies the metric, not the run.
- It does not claim the normalized metric is superior to any other
  regime adjustment. It is one specification; the alternatives
  (rank-based, beta-adjusted) are not addressed.

## 11. Review checklist

Before implementation:

- [ ] The definition in section 3 is unambiguous and implementable
- [ ] The reference-population choice in section 4 is defensible
- [ ] The failure modes in section 6 cover realistic cases
- [ ] The acceptance criteria in section 7 are pre-declared and not
      result-conditioned
- [ ] The test fixtures in section 8 exercise the metric's actual behavior
- [ ] The audit record in section 9 emits both raw and normalized values
