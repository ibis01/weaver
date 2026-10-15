# Population reconciliation — v1 vs v2 (2026-10-15)

**Status:** Analysis recorded. No canonical population selected.
**v1:** `data/pepe-buyer-list/v1.json` — 27 buyers, net-holder pipeline
**v2:** `data/pepe-buyer-list/v2.json` — 17 buyers, spec-compliant classifier

## Method

v1 and v2 derive buyer populations by independent methods:

- **v1 (net-holder pipeline):** extract all PEPE transfer recipients
  over window [25710000, 25820000], filter to net-positive holders
  (net >= 1M PEPE, out/in <= 0.5). Population: 27 of 500 candidates.

- **v2 (spec-compliant classifier):** extract swap-event recipients
  from PEPE/WETH pair over window [25735200, 25785424], pre-filter by
  windowed net position, classify each acquisition by
  `pepe-buyer-attribution-v1.3.md` §3. Population: 17 of 500
  candidates.

The two pipelines differ in:
- Window length (15 days vs 7 days)
- Candidate source (all transfer recipients vs swap-event recipients
  from one pair)
- Classification method (net position vs per-tx decision tree)

## Overlap

| set | count |
|---|---|
| v1 buyers | 27 |
| v2 buyers | 17 |
| **in both** | **12** |
| v1-only | 15 |
| v2-only | 5 |

**71% of v2's population is confirmed by v1.** Independent methods
agree on 12 wallets.

## v1-only (15 wallets)

All 15 are small-to-mid net accumulators:

| address | net PEPE | in | out |
|---|---|---|---|
| 0x1b1d8b13 | 814M | 5 | 0 |
| 0x60e1b2e2 | 574M | 1 | 0 |
| 0x4ddb4c36 | 38M | 1 | 0 |
| 0x69aa23fe | 38M | 1 | 0 |
| 0x42d2b5ba | 38M | 2 | 0 |
| 0xa4a82592 | 38M | 1 | 0 |
| 0xd853b308 | 36M | 1 | 0 |
| 0x8f0aeb8a | 36M | 1 | 0 |
| 0x8e869492 | 35M | 2 | 0 |
| 0xef5a7d21 | 20M | 2 | 1 |
| 0x9e56638b | 19M | 3 | 0 |
| 0x699340d6 | 19M | 1 | 0 |
| 0x364f4a91 | 19M | 1 | 0 |
| 0x43ab1bb4 | 19M | 1 | 0 |
| 0x072391ef | 12M | 2 | 1 |

**Why not in v2:** v2's candidate source is the top 500 by aggregate
inflow through PEPE/WETH pair 0xa43fe16908. A wallet that acquired
PEPE via a different route — Uniswap V3 pool, aggregator that doesn't
route through the V2 pair, or a direct transfer — does not appear in
v2's candidate pool regardless of its net position.

**Interpretation:** these are real holders. v2's extraction method is
structurally narrower than v1's.

## v2-only (5 wallets)

| address | confirmed/classified |
|---|---|
| 0xee0ca621 | 3/3 |
| 0xc5e9f816 | 2/2 |
| 0x6364b188 | 1/2 |
| 0x77d15996 | 1/1 |
| 0xe4c19e73 | 1/1 |

Notes:
- `0x6364b188` is the WXRP payer sampled earlier — real economic
  buyer, paid in an unlisted quote asset. v1's net-check window may
  have excluded it on net-position grounds.
- `0xc5e9f816` failed v1's hold check over the wider window
  (7 in / 11 out) but passed v2's pre-filter over the narrower
  window. **Window-sensitivity in the pre-filter:** the same rule
  over different windows yields different results.

**Why not in v1:** unclear for each case. Two possible explanations:
v1's wider window produced a net/ratio shape that failed its hold
check, or the wallet's activity pattern didn't fit v1's net-holder
profile.

## Implications

1. **Neither pipeline supersedes the other.** v1 finds small
   accumulators that v2's extraction misses. v2 finds swap-event
   participants with clean per-tx evidence that v1's net-check may
   reject on window-relative grounds.

2. **The intersection is the strongest population.** 12 wallets are
   confirmed by two independent methods. For any downstream use
   requiring high confidence, the intersection is the right set.

3. **v2's extraction is structurally narrower than v1's.** It only
   sees swaps through one pair. Broadening it (add V3 pool,
   aggregator routes) would close some of the gap, at the cost of
   more extraction calls.

4. **The pre-filter is window-sensitive.** `0xc5e9f816` demonstrates
   this. Any future comparison must use the same window for both
   v1 and v2 pipelines, or the pre-filter's output will differ.

## Recommendation

No canonical population is selected by this document.

For Gate 0b revalidation — when it eventually runs, which is currently
blocked on window degeneracy (see
`docs/audits/gate-0b-window-degeneracy-2026-10-15.md`) — the treatment
set should be the **intersection of v1 and v2** (12 wallets), not the
union. The intersection carries independent confirmation.

For broader coverage (e.g., downstream scoring, research), the union
(32 wallets) is appropriate, with the caveat that 15 of them are only
confirmed by net-position evidence and 5 only by transaction evidence.

## Data

- v1: `data/pepe-buyer-list/v1.json`
- v2: `data/pepe-buyer-list/v2.json`
- Window (v1): 25710000 – 25820000
- Window (v2): 25735200 – 25785424
- Spec: `docs/designs/pepe-buyer-attribution-v1.3.md`
