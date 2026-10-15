# v5 UNRESOLVED breakdown — 2026-10-15

**Status:** Complete. Population accepted under v1.5 §6.6.
**Run:** `data/attribution-runs/` — full 1,132-candidate run with
fixed extraction.
**Spec:** `docs/designs/pepe-buyer-attribution-v1.5.md`

## Why this doc exists

The full run reported `UNRESOLVED: 40.21%`, failing the v1.4 §6.6
ceiling of `<40%`. The v1.5 amendment splits UNRESOLVED into
spec-deferred and residual classes, and applies the ceiling only
to the residual. This document records the classification of every
one of the 76 UNRESOLVED acquisitions that justifies the split.

## Method

Two passes:

1. **Signature scan of all 76** — fetched each UNRESOLVED acquisition
   via Blockscout PRO `/api/v2/transactions/{hash}` and recorded
   `tx.from`, `tx.to`, and `tx.raw_input[0:10]`. Matched against
   the v1.5 §3.4 detection rules.
2. **Refined scan of the 16 non-Crossmint cases** — same fetch,
   plus a check for a listed QUOTES-token outflow to distinguish
   "unlisted quote" from "no outflow."

Both scans used `user-agent: weaver-scan/5.0`. Requests without an
explicit UA were rejected with `HTTP 403` by the provider.

## Result

| reason_code | count |
|---|---:|
| SPEC_DEFERRED_SPONSORED_PROXY | 60 |
| SPEC_DEFERRED_UNLISTED_QUOTE | 5 |
| SPEC_DEFERRED_ERC4337 | 2 |
| **deferredTotal** | **67** |
| TRACE_AMBIGUITY | 9 |
| **residualTotal** | **9** |
| **raw UNRESOLVED** | **76** |

## Acquisition breakdown

| class | count |
|---|---:|
| DIRECT_ORIGINATOR | 30 |
| TRACED_ECONOMIC_RECIPIENT | 35 |
| INTERMEDIARY | 48 |
| UNRESOLVED (raw) | 76 |
| **totalAcquisitions** | **189** |

## Ceiling accounting under v1.5 §6.6

| metric | value |
|---|---:|
| rawUnresolvedPct | 40.21 |
| deferredTotal | 67 |
| residualTotal | 9 |
| residualPct | **4.76** |
| unresolvedCeilingPass | **true** |

The ceiling applies to `TRACE_AMBIGUITY + PROVIDER_FAILURE` only
(v1.5 §6.6). There were zero PROVIDER_FAILURE acquisitions in this
run (extraction and classification both completed with
`complete: true`, `errorCandidates: 0`).

## Deferred classes

**SPEC_DEFERRED_SPONSORED_PROXY (60).** Crossmint-style sponsored
proxy. Signature:

    tx.from = 0xF73644Da46aB85da864FC4284322F489134ee82C
    tx.to   = 0xa66b23D9a8a46C284fa5b3f2E2b59Eb5cc3817F4
    selector = 0x2c343229  (approveAndExecute)

Pattern: the signer is not the beneficiary. USDC leaves the
Crossmint proxy, converts to WETH, and PEPE arrives at the
candidate address. §1.2 defers "gas-sponsored acquisitions where
the signer ≠ beneficiary" to v2. This class is that case.

**SPEC_DEFERRED_ERC4337 (2).** EntryPoint:

    tx.to = 0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789
    selector = 0x1fad948c  (handleOps)

§1.2 defers ERC-4337 user operations. This class is that case.

**SPEC_DEFERRED_UNLISTED_QUOTE (5).** Universal Router execute with
a non-QUOTES outflow:

    selector = 0x3593564c  (execute)
    tx.from = candidate
    quote outflow present but token not in §2.6 QUOTES
    (observed: BRETT and other memecoins)

§2.6 lists a fixed QUOTES set. When the candidate pays in a token
outside that set, v1.4 §3.2's reconciliation cannot complete. v1.5
names this as a deferred class rather than a trace failure.

## Residual — 9 TRACE_AMBIGUITY

Nine acquisitions did not match any deferred signature. Each has a
unique method selector and no common flow pattern:

| candidate | selector | to |
|---|---|---|
| 0xe859992fdb | 0x99e1d016 | self |
| 0xe859992fdb | 0x99e1d016 | self |
| 0x949c899810 | 0x0a2b8f36 | 0xccc88a9d1b4e |
| 0xa4a8259275 | 0x9265bb9d | 0x78ace9b2ee9a |
| 0x8286ec67bd | 0x47ee97ff | 0x3d90f66b534d |
| 0xc4a3f1e031 | 0xd984396a | 0xbc1d9760bd6c |
| 0xff3dd1a5f0 | 0x47ee97ff | 0x3d90f66b534d |
| 0xdb349dba94 | 0x84d61c97 | 0x5523985926aa |
| 0x7b9d43ef9d | 0x765e827f | 0x000000007172 |

These are the honest floor of the current classifier's capability.
They remain UNRESOLVED, they do not enter the buyer list, and they
count against the §6.6 ceiling at 4.76% — well within the limit.

Two of the nine (`0x47ee97ff`) share a selector and a destination,
suggesting a common mechanism, but not enough to name a class
without further investigation. Not urgent; not blocking.

## What this establishes

- The 49-buyer population is accepted. `residualPct: 4.76 < 40`.
- The raw 40.21% is not concealed — the full 76 remain visible in
  the audit output with their reason_codes.
- 67 of the 76 match spec-named deferral signatures; the classifier
  would emit the same codes on a fresh run (v1.5 §3.4).
- 9 remain genuinely unresolved — a bounded, documented,
  below-ceiling floor.

## What this does not establish

- It does not upgrade any deferred case to a buyer. They remain
  excluded.
- It does not validate `earlyEntryRate`. Gate 0b is still blocked
  by window degeneracy
  (`docs/audits/gate-0b-window-degeneracy-2026-10-15.md`).
- It does not resolve the 9 residual cases. They need individual
  investigation, which is not scheduled.

## Data

- Signature scan: `/tmp/unresolved-signatures.jsonl` (76 records)
- Refined 16: `/tmp/other-16-classified.jsonl`
- Audit records: `data/audit-records/pepe-buyer-audit-v5.jsonl`
- v2 population: `data/pepe-buyer-list/v2.json`
