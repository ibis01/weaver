# Stage 1 — PEPE gold-standard verification

**Date:** 2026-10-12
**Script:** scripts/pattern-check-v2.js (commit 19922f3)
**Window:** 2026-08-12 to 2026-08-19 UTC
**Method:** evidence-graded DEX-buy classification (CONFIRMED / LIKELY / TRANSFER_ONLY / UNCLASSIFIED)

## Result

`0 of 5 wallets have at least one CONFIRMED_DEX_BUY.`

The five wallets originally selected as gold-standard (bought ≥1B PEPE
in the 7 days before the 2026-08-22 peak) fail v2 verification.

## What the graded transfers show

Wallet 0x648b8882... received 5,837,670,090,000,000,000,000,000,000
PEPE on 2026-08-13 13:24:11 UTC, but the transaction was not
originated by the wallet. The classification is UNCLASSIFIED with
evidence "wallet was not transaction originator". This is a transfer
in, not a DEX buy.

Wallet 0x3f9a8345... has more than 50 pages of token transfers;
the script fails closed with DATA_INCOMPLETE rather than grade
partial data.

Other wallets in the list produced no confirmed DEX buys on PEPE
in the window.

## Interpretation

The original gold-standard list was constructed by selecting wallets
that **received** ≥1B PEPE in the pre-peak window. That heuristic
cannot distinguish DEX buys from transfers, internal moves, OTC
settlements, or contract-mediated distributions. Under v2's stricter
classification, none of the five qualify as confirmed buyers.

This is direct evidence for H2 from
docs/audits/gate-0b-attempt-1-result.md: the population was
mis-selected, not the metric. The earlyEntryRate metric was not
tested here because no wallet reached the sample gate.

## What this invalidates

- The specific list at data/wallet-pool-gold-standard-v1.json
- Any conclusion drawn from the attempt-1 comparison that assumed
  those wallets had "real" early entries

## What this does not invalidate

- The earlyEntryRate metric itself (untested at scale)
- The design at docs/designs/candidate-discovery-v1.md (which
  recommended confirmed-buy selection from the start)

## Next

Rebuild the gold-standard list from a source that already verifies
DEX buys, per the pattern criterion in the roadmap §Gate 0b v2 step 1.
Candidate sources: published on-chain research that cites specific
transaction hashes (not just wallet addresses), or a new reverse-
engineering pass that filters at the transaction level before
selecting wallets.

## Limitations

- One token (PEPE), one window (August 2026)
- Script max pages is 50; wallets with deeper history are DATA_INCOMPLETE
- DISTRIBUTORS set is empty; airdrop classification is not active
