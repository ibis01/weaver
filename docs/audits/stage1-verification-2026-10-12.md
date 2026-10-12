# Stage 1 — PEPE gold-standard verification

**Date:** 2026-10-12
**Script:** scripts/pattern-check-v2.js (commit 19922f3)
**Window:** 2026-08-12 to 2026-08-19 UTC
**Method:** evidence-graded DEX-buy classification

## Result

0 of 5 wallets have at least one CONFIRMED_DEX_BUY.

The five wallets originally selected as gold-standard (bought >=1B
PEPE in the 7 days before the 2026-08-22 peak) fail v2 verification.

## What the graded transfers show

Wallet 0x648b8882 received 5.8 sextillion PEPE on 2026-08-13, but
the transaction was not originated by the wallet. Classification:
UNCLASSIFIED, evidence "wallet was not transaction originator". This
is a transfer in, not a DEX buy.

Wallet 0x3f9a8345 exceeded the 50-page transfer cap; the script
failed closed with DATA_INCOMPLETE rather than grade partial data.

Other wallets produced no confirmed DEX buys on PEPE in the window.

## Interpretation

The original gold-standard list was constructed by selecting wallets
that received >=1B PEPE in the pre-peak window. That heuristic cannot
distinguish DEX buys from transfers, internal moves, OTC settlements,
or contract-mediated distributions. Under v2, none of the five
qualify as confirmed buyers.

This is direct evidence for H2 from
docs/audits/gate-0b-attempt-1-result.md: the population was
mis-selected, not the metric. The earlyEntryRate metric was not
tested here because no wallet reached the sample gate.

## Invalidates

- The specific list at data/wallet-pool-gold-standard-v1.json
- Any conclusion from attempt-1 that assumed those wallets had real
  early entries

## Does not invalidate

- The earlyEntryRate metric itself (untested at scale)
- The confirmed-buy selection design in candidate-discovery-v1.md

## Next

Rebuild gold-standard from a source that verifies transactions.
Two paths:

1. Find a published source (Dune, Arkham) that names wallets with
   transaction-level evidence.
2. Reverse-engineer: query PEPE DEX swaps directly, extract buyer
   addresses from swap transactions only, filter to the primary
   window. Every candidate is a DEX buyer by construction.

Path 2 reuses the router and quote infrastructure already built.
