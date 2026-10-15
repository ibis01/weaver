# Weaver — Regime-Normalized earlyEntryRate (v1)

**Date:** 2026-10-15
**Status:** Draft for review. Not implemented.
**Predecessor:** docs/audits/gate-0b-window-degeneracy-2026-10-15.md

## 1. Problem

`earlyEntryRate(w) = earlyCount(w) / buyCount(w)` where a buy is
"early" if the asset rose >=20% in the next 14 days. On the PEPE
window [2026-08-08, 2026-08-23], every entry date through 08-18
preceded a >=20% rise and every date after did not. The metric is
a date classifier on this data.

## 2. Definition

    baseline(d) = fraction of reference-population buys on day d
                  that were followed by a >=20% 14-day rise
    baseline(w) = mean of baseline(d) over the days w traded
    normalizedEarlyEntryRate(w) = earlyEntryRate(w) - baseline(w)

Range [-1, 1]. A wallet whose buys land on days everyone profited
scores near zero; a wallet whose buys land on days the market did
not reward scores its own excess.

## 3. Reference population

Control-2 pool, `data/wallet-pool-control-2-v1.json` (50 wallets).
Independent of both treatment populations. Days with fewer than 5
reference buys are excluded from the baseline mean.

## 4. Acceptance criteria (pre-declared)

1. Mann-Whitney U on treatment vs matched control, p < 0.05
2. Treatment median exceeds control median by >= 0.05 normalized units
3. Result holds on two independent draws of the control pool
4. At least 40% of evaluation-window days pass the 5-buy floor

Failure of any leaves the metric unvalidated. No threshold changes
after the result.

## 5. Test fixtures

Six synthetic wallets with known properties: high-baseline only
(expect ~0), low-baseline + all early (expect > 0.5), low-baseline +
none early (expect ~0), single-day (warning), below sample floor
(null), forward-window crosses asOf (dropped).

## 6. Failure modes

Sparse reference days excluded and reported. Missing prices drop the
buy. Wallet sample floor stays at 10 priced buys. Reference/treatment
overlap removed at load time. Single-day baseline flagged.

## 7. What this does not do

Does not select a window. Does not change wallet-profiler.js. Does
not run Gate 2. Emits both raw and normalized values side by side;
neither replaces the other.

## 8. Review checklist

- [ ] Section 2 definition implementable
- [ ] Control-2 defensible as reference
- [ ] Acceptance criteria pre-declared, not result-conditioned
- [ ] Fixtures exercise actual behavior
