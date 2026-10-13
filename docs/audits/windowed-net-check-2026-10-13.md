# Windowed Net Position Check — 2026-10-13

**Purpose:** Validate the 20-wallet gold-standard population by
computing each candidate's net PEPE position over an 8-hour block
window (25710000 to 25820000).

**Method:** For each candidate, fetch all PEPE `tokentx` rows where
the candidate appears as `from` or `to`. Sum inflows and outflows.
Classify:

- NET_HOLDER: net > +1% of total inflow
- PASS_THROUGH: |net| ≤ 1% of total inflow
- NET_SELLER: net < −1% of total inflow

## Result

| Classification | Count |
|---|---|
| PASS_THROUGH | 16 |
| NET_HOLDER | 3 |
| NET_SELLER | 1 |

The three NET_HOLDER entries have net positions of 1.5 billion wei,
20.6 million wei, and 346 wei respectively — all dust fractions of a
single PEPE. None represents a material holding.

## Interpretation

**The population is invalidated.** Every candidate is a trader or
routing intermediate, not a buyer. The extraction rule — "received
PEPE from the Uniswap V2 pair" — captures anyone who trades PEPE, not
anyone who bought and held it. Over a long enough window, the net
position of a trader is zero.

This is confirmed by the earlier probe on `0x128d2900`: 18.1 billion
PEPE received at 16:14:47, 18.1 billion PEPE sent at 16:15:47. One
second. The wallet was a hop in a multi-transaction route, not the
economic buyer.

## What the Swap event actually identifies

The Uniswap V2 `Swap` event's `to` field is the address the pair sends
tokens to. In a direct swap that's the user. In an aggregated swap
(1inch, CoW, Crossmint, MEV, smart wallets) it's whatever contract the
aggregator specifies as the intermediate recipient. The event captures
the *immediate* recipient, not the economic buyer.

## Consequence for Gate 0b

The discrimination test result of 2026-10-13 (gold median 1.000,
control median 0.000) is **invalidated**. The gold-standard wallets
scored high because they systematically receive PEPE before pumps —
they are trading infrastructure, not skilled traders. The metric was
not tested. The PASS is retracted.

## Next

Population attribution requires an external source that decodes
aggregator routing and identifies the economic buyer. Bitquery's
DEXTrades cube and Moralis's Swaps API both provide `buyer` /
`beneficiary` fields derived from swap-level decoding rather than
transaction-level.

See docs/designs/pepe-buyer-attribution-v1.md for the specification
of economic-buyer attribution, currently being revised to reflect
this finding.
