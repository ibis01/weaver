
    SUPERSEDED 2026-10-15. This revision is not implementation-ready.
    Three items in the §11 review checklist fail:
    (a) the economic-buyer definition does not resolve EIP-7702,
    (b) the four classifications misroute 7702-delegated accounts to
    INTERMEDIARY,
    (c) the §7 revalidation plan is superseded by the window-degeneracy
    finding (docs/audits/gate-0b-window-degeneracy-2026-10-15.md).
    See docs/audits/pepe-buyer-attribution-spec-review-2026-10-15.md.
    The successor is pepe-buyer-attribution-v1.1.md.

# Weaver — PEPE Buyer Attribution Specification v1

**Date:** 2026-10-13
**Status:** Draft for review. Not implemented.
**Predecessor:** docs/audits/gate-0b-discrimination-result-2026-10-13.md
**Supersedes:** the implicit "recipient == buyer" assumption in every prior
buyer extraction script

## Why this document exists

The Gate 0b discrimination test PASS is on hold. It ran on a
population derived from Uniswap V2 `Swap` events, on the assumption
that the `to` field of a swap is a buyer. The verification suite
showed that most of those addresses are not the transaction
originators. They may be routers, aggregators, MEV bots, or
intermediate contracts that forwarded PEPE in a separate step.

The test may still be correct — gold-standard may still score high
against control on a clean population. But the current result does
not establish that, because the population it was measured on is
contaminated. Gate 0b reopens only after this specification is
implemented and the population is rebuilt.

## 1. Scope and definitions

### 1.1 In scope

- Ethereum mainnet PEPE purchases
- Via Uniswap V2 pair 0xa43fe16908251ee70ef74718545e4fe6c5ccec9f
- In a defined block range
- Where the acquisition transaction succeeded (receipt status = 1)

### 1.2 Out of scope (v1)

- Cross-chain bridged or wrapped PEPE
- Off-chain OTC transfers
- Airdrops, vesting distributions, and incentive claims (not purchases)
- ERC-4337 user operations, unless the trace reconciles to a single
  identifiable economic actor (deferred to v2)
- Gas-sponsored acquisitions where the signer ≠ beneficiary

### 1.3 Definitions

**PEPE purchase:** a transaction in which PEPE is acquired by an
address in exchange for another asset, where the exchange is
observable in the transaction's value flow: some quote asset left the
acquirer's economic control, and PEPE entered it, within the same
transaction, with the receipt status = 1.

**Economic buyer:** the address (EOA or unambiguous smart-account
owner) whose value was exchanged for the PEPE, as reconstructed from
the transaction's value flow. Not the address that received PEPE
first if that address is not also the source of the value that paid
for it.

**Intermediary:** a contract address that appears in the swap path
but has no economic stake in the resulting PEPE — routers,
aggregators, MEV bot contracts, settlement contracts. Their PEPE
inflow is followed by a matching outflow; their net position is zero
or vanishes within the same block.

**UNRESOLVED attribution:** a transaction where the trace is
unavailable, the value flow is ambiguous, or the mechanism (ERC-4337,
relayer, sponsored gas, batched call) cannot be reconciled to a single
economic actor given the evidence available.

### 1.4 The critical rule

No candidate is classified as a confirmed economic buyer solely
because it received PEPE from the pair's `Swap` event. The `Swap`
event identifies a recipient, not an economic actor. Attribution
requires value-flow reconstruction.

## 2. Evidence hierarchy

Sources, ordered by reliability for this specific question. When two
sources disagree, the higher-reliability source wins; when they cannot
be reconciled, the classification is UNRESOLVED.

### 2.1 Transaction receipt

- Source: `eth_getTransactionReceipt`, or Blockscout
  `/api/v2/transactions/{hash}`
- Evidence: `status` field. `status == 1` required for any purchase.
  A reverted transaction is not a purchase regardless of logs.
- Reliability: highest. This is the canonical post-state record.

### 2.2 Token transfer logs (ERC-20 `Transfer`)

- Source: `eth_getLogs`, or Blockscout
  `/api/v2/transactions/{hash}/token-transfers`
- Evidence: `{token, from, to, value}` tuples.
- Reliability: authoritative for token movement. Not authoritative for
  economic intent — a transfer without a corresponding value outflow
  is not a purchase.
- Limitation: does not distinguish between same-transaction transfers
  (a hop in a swap path) and unrelated transfers that happen to be
  emitted in the same tx.

### 2.3 Internal transaction trace

- Source: `debug_traceTransaction`, or Blockscout
  `/api/v2/transactions/{hash}/internal-transactions`
- Evidence: the sequence of internal `CALL`, `DELEGATECALL`,
  `STATICCALL` invocations with their value and calldata.
- Reliability: high for reconstructing value flow through contracts.
- Limitation: not universally available. Blockscout returns traces
  for most post-Byzantium transactions but the coverage is not
  complete. Absent trace → UNRESOLVED, not INTERMEDIARY.
- Limitation: large traces may be truncated by the provider. A
  truncated trace cannot confirm attribution.

### 2.4 Call input data

- Source: `tx.input` from the receipt
- Evidence: bytes 0–3 are the method selector. Match against a
  maintained aggregator method selector table.
- Reliability: high for *identifying* an aggregator entry point,
  lower for *attributing* the resulting trade to a specific address.

### 2.5 Contract metadata

- Source: Blockscout `/api/v2/addresses/{addr}`
- Evidence: `is_contract` (boolean), `name` (nullable), `metadata`
  (tags). The tag set includes exchange, hot-wallet, and protocol
  categories.
- Reliability: authoritative for contract status; unreliable for
  purpose classification (a contract can be mislabeled or unlabeled).
- Limitation: contract status is a snapshot. A wallet may have been an
  EOA at the time of the transaction and a contract later, or vice
  versa. For v1, we accept the current classification and record the
  observed-at timestamp; timestamp-aware historical contract status
  is deferred to v2.

### 2.6 Quote-asset outflow

- Source: token transfer logs, restricted to the QUOTES set:
  WETH, USDC, USDT, DAI, WBTC, BUSD
- Evidence: ERC-20 `Transfer` where `from == candidate` and
  `token ∈ QUOTES`.
- Reliability: high when visible. The presence of a quote outflow
  from the candidate, in the same transaction as the target-token
  inflow, is the primary evidence that the candidate paid for the
  purchase.
- Limitation: gas-sponsored acquisitions have no candidate quote
  outflow. Those cases are UNRESOLVED in v1.

## 3. The four classifications

Each candidate transaction is classified by the following decision
tree. Run top to bottom; the first matching branch is the
classification.

### 3.0 Preconditions (all classifications)

if receipt.status != 1: → REJECTED (not a purchase)
if candidate not in token_transfers.to: → not a candidate for this tx
if candidate in token_transfers.to
AND candidate in token_transfers.from
AND candidate net position ≈ 0: → INTERMEDIARY (round-trip)

### 3.1 DIRECT_ORIGINATOR

Requires all of:

- `tx.from == candidate`
- `candidate` appears as `to` in at least one target-token transfer
- `candidate` appears as `from` in at least one quote-asset transfer,
  with a positive amount
- `tx.input` method selector is in the direct-swap set:
  `0x7ff36ab5` (swapExactETHForTokens),
  `0x18cbafe5` (swapExactTokensForETH),
  `0x38ed1739` (swapExactTokensForTokens),
  `0x8803dbee` (swapTokensForExactTokens),
  `0xfb3bdb41` (swapETHForExactTokens),
  `0x4a25d94a` (swapTokensForExactETH),
  `0x022c0d9f` (pair.swap, when called directly)
- No aggregator selector detected in the trace

### 3.2 TRACED_ECONOMIC_RECIPIENT

Requires all of:

- `candidate` appears as `to` in at least one target-token transfer
- `candidate` appears as `from` in at least one quote-asset transfer
  with a positive amount, in the same transaction
- The transaction's value flow reconciles: the quote-asset outflow
  from `candidate` is proportional to the target-token inflow to
  `candidate` given the pool's observed price at that block
- The call trace shows the target-token and quote-asset transfers
  occurring within the same internal call subtree (not across
  independent subcalls that happen to be batched)
- `candidate` is an EOA (`is_contract == false` at the time of the
  lookup, recorded with the observed-at timestamp)

This is the aggregator-routed case. The candidate paid for the tokens
even though a router signed and executed on their behalf.

### 3.3 INTERMEDIARY

Any of:

- `candidate.is_contract == true`
- `candidate` received target token but has no quote-asset outflow in
  the same transaction, AND the trace shows the candidate forwarding
  the target token onward within the same transaction
- `candidate` received target token from the pair, then sent a
  matching amount to another address within the same block

### 3.4 UNRESOLVED

Any of:

- Internal trace unavailable from the provider
- Internal trace truncated (provider signaled incomplete)
- ERC-4337 pattern detected (EntryPoint address
  `0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789` in the call path)
- Gas-sponsored pattern detected (candidate has no native balance
  change, has no quote outflow, but received the target token)
- Quote outflows and target inflows cannot be reconciled by the
  observed pool price at that block
- Any source returned a provider error that prevented evaluation

UNRESOLVED candidates are counted and reported. They are not retained
in the gold-standard population. They are not excluded silently.

## 4. Failure handling

### 4.1 Provider errors

Any fetch error (timeout, 429, 5xx, malformed response) that prevents
the classification decision tree from completing:

classification = UNRESOLVED
reason_code = "provider-error-{source}"

Do not fall back to any less-reliable source. Do not infer from
partial data. Do not treat the swap-event recipient as the buyer
because the trace was unavailable.

### 4.2 Truncated traces

If Blockscout signals that a trace response is truncated (via
`next_page_params` present at the last available page, or via a
provider warning), the classification is UNRESOLVED with
`reason_code = "trace-truncated"`. Do not attempt to reconstruct the
trace from partial data.

### 4.3 Conflicting evidence

If the token transfer logs show the candidate received the target
token but the trace shows a different address as the ultimate
recipient of the value outflow, the classification is UNRESOLVED with
`reason_code = "value-flow-conflict"`. Report both candidates in the
audit record.

### 4.4 Rate limiting

Bounded exponential backoff, capped at 60 seconds between retries.
After 5 consecutive failures on the same URL, the classification is
UNRESOLVED with `reason_code = "provider-unreachable"`. The overall
run continues with the next candidate — do not abort the whole scan
for one provider error.

### 4.5 What never happens

- A candidate is never classified as a confirmed buyer because the
  trace fetch failed.
- A candidate is never classified as a confirmed buyer because the
  swap event shows it received tokens and no contradicting evidence
  was found.
- A run is never reported as complete when the number of UNRESOLVED
  candidates exceeds a pre-declared threshold (see section 6).

## 5. Audit record schema

Every processed candidate produces one audit record. The record is
the artifact of record — the population list is derived from it, not
the other way around.

```json
{
  "schema_version": "buyer-attribution-v1",
  "candidate_address": "0x...",
  "classification": "DIRECT_ORIGINATOR",
  "confidence": "high",
  "reason_code": "direct-originator-swap",
  "evidence": {
    "tx_status": 1,
    "tx_from": "0x...",
    "tx_to": "0x...",
    "method_selector": "0x7ff36ab5",
    "aggregator_selector_detected": false,
    "target_token_inflow": {
      "token": "0x6982508145454ce325ddbe47a25d4ec3d2311933",
      "from": "0xa43fe16908251ee70ef74718545e4fe6c5ccec9f",
      "to": "0x...",
      "amount_raw": "1234500000000000000000"
    },
    "quote_asset_outflow": {
      "token": "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
      "from": "0x...",
      "to": "0x...",
      "amount_raw": "12345000000000000"
    },
    "internal_call_path": [
      "0x... -> 0x...: CALL"
    ],
    "trace_available": true,
    "trace_truncated": false
  },
  "contract_status": {
    "is_contract": false,
    "observed_at": "2026-10-13T...",
    "source": "blockscout-v2"
  },
  "provider": {
    "name": "blockscout-v2",
    "api_base": "https://eth.blockscout.com/api/v2",
    "version": "2026-10"
  },
  "reviewed_by": null,
  "review_notes": null,
  "created_at": "2026-10-13T..."
}
The schema is verbose because the classification must be
reproducible from the record alone. Anyone with the record can:

    Re-fetch the transaction by hash

    Re-run the decision tree against the same evidence

    Arrive at the same classification

    Contest the classification if the evidence has changed

6. Population acceptance criteria

A rebuilt buyer population is not accepted until all of the following
hold:
6.1 Completeness

    Every candidate from the source extraction has exactly one audit
    record

    The sum of classification counts equals the total candidate count

    No candidate is missing a record due to a script failure

6.2 Reconciliation

Reported counts by classification:

    DIRECT_ORIGINATOR: N

    TRACED_ECONOMIC_RECIPIENT: N

    INTERMEDIARY: N

    UNRESOLVED: N

    REJECTED: N

Sum must equal the total input candidate count.
6.3 Reproducibility

    Re-running the extraction with the same block range and provider
    version produces the same audit records, modulo timestamps

    Provider version changes are recorded per-run; a re-run against a
    different provider version is a new population, not a re-run of the
    same one

6.4 Manual review

    A random 10% sample of retained DIRECT_ORIGINATOR and
    TRACED_ECONOMIC_RECIPIENT candidates is manually reviewed against
    Etherscan

    Disagreement rate with the manual review must be below 5%

    If the disagreement rate is ≥ 5%, the classifier is considered
    incorrect and the population is rejected until the classifier is
    fixed

6.5 Excluded-candidate sample

    A random 10% sample of INTERMEDIARY and UNRESOLVED candidates
    is manually reviewed

    Disagreement rate with the manual review must be below 10%

    This catches false negatives — real buyers incorrectly excluded

6.6 Threshold for completion

    UNRESOLVED as a fraction of total candidates must be below a
    pre-declared ceiling, default 40%

    If UNRESOLVED exceeds 40%, the run is considered incomplete and
    the extraction is re-run with corrected provider settings or
    narrower block ranges

7. Gate 0b revalidation plan

The discrimination test is re-run only after sections 6.1 through 6.6
are satisfied.
7.1 Rebuild the gold-standard population

    Source: the same Swap event extraction as before, over blocks
    [25735200, 25785424]

    Filter through the v5 classifier

    Retain only DIRECT_ORIGINATOR and TRACED_ECONOMIC_RECIPIENT

    Report the count of each

7.2 Rebuild the control population

    Source: PEPE holders as before

    Filter through the same classifier (though control wallets by
    construction should be INTERMEDIARY or non-participants in the
    window)

    Match on PEPE trade count within ±30% of the gold-standard median,
    as before

7.3 Compute earlyEntryRate

    Per wallet, using the existing profiler

    Report per-wallet sample size and rate

    Report the fraction of wallets whose sample was below the 10-buy
    floor

7.4 Statistical test

    Mann-Whitney U on gold-standard vs control rates

    Report: n_gold, n_control, medians, effect size (median difference),
    95% bootstrap confidence intervals, p-value

    Pre-declared thresholds: p < 0.05 AND gold median ≥ 2 × control median

    Do not adjust thresholds after seeing the result

7.5 Hold-out validation

    The re-run is considered a test, not a tuning round. If it fails,
    the metric is not validated. No threshold adjustment is permitted
    in the same run.

8. Known limitations and deferred cases

Deferred to v2 of this specification:

    ERC-4337 user operations

    Gas-sponsored acquisitions

    Batched multicall purchases spanning multiple tokens

    Cross-transaction attribution (buyer paid in one tx, received in
    another)

    Time-aware historical contract status

    Multi-hop routing across multiple DEXes in a single transaction

Known limitations accepted in v1:

    Provider coverage for internal traces is not complete. Transactions
    without a trace are UNRESOLVED.

    Contract metadata is a snapshot, not historical. The observed-at
    timestamp is recorded, but the classification may be wrong if the
    address changed type after the transaction.

    The QUOTES set is a fixed list. A candidate paying in an unlisted
    quote asset is UNRESOLVED.

9. Implementation notes for find-pepe-buyers-v5

Order of implementation:

    Swap-event extraction (unchanged from v4): produces the raw
    candidate list and the transactions they appeared in.

    EOA classification: one Blockscout call per unique address.
    Cached. If is_contract == true, classify INTERMEDIARY and skip
    the trace work.

    Transaction receipt fetch: one call per unique (candidate,
    transaction) pair. If status != 1, classify REJECTED.

    Token-transfer fetch: one call per transaction. Determines quote
    outflow and target inflow presence.

    Internal-trace fetch: one call per transaction, only if steps 3 and
    4 left the classification ambiguous.

    Decision tree: applies section 3 rules to the gathered evidence.

    Audit record: writes the schema in section 5.

    Report: prints the classification counts and passes them through
    section 6 acceptance criteria.

Estimated API calls for the current 1,132 candidates with ~8,000
transactions: roughly 10,000–15,000 calls if every candidate needs
trace. Bounded by caching; a 30-minute run against Blockscout PRO is
realistic.
10. What this specification does not do

    It does not define the discrimination threshold, the metric, or the
    earlyEntryRate computation. Those are unchanged.

    It does not add signals, scoring, or UI. Those are downstream of a
    validated population.

    It does not unblock Gate 0b. Gate 0b remains on hold until sections
    6 and 7 are executed and a clean result is reported.

11. Review checklist

Before this specification is implemented, confirm:

    □

    The economic-buyer definition matches the research intent
    □

    The four classifications cover every realistic case
    □

    The decision tree is implementable with available provider data
    □

    The acceptance criteria in section 6 are sufficient to prevent
    the same class of error
    □

    The Gate 0b revalidation plan is defensible against reviewer
    scrutiny
    □

    The known limitations in section 8 are acceptable for v1

Only after this checklist is signed off does find-pepe-buyers-v5.js
become the correct next artifact.
