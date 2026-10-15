# Weaver — PEPE Buyer Attribution Specification v1.2

**Date:** 2026-10-15 (v1.2)
**Status:** Draft for review. Not implemented.
**Supersedes:** `docs/designs/pepe-buyer-attribution-v1.md` (v1, 2026-10-13);
`docs/designs/pepe-buyer-attribution-v1.1.md` (v1.1, 2026-10-15)
**Predecessor review:** `docs/audits/pepe-buyer-attribution-spec-review-2026-10-15.md`
**Related:** `docs/audits/gate-0b-window-degeneracy-2026-10-15.md`

## Changelog

### v1.2 (2026-10-15)

Two amendments found by implementing v1.1 against real data. All
three sample cases still classify identically; the changes only
close paths that were either dead or missing.

1. **§2.6** — Native ETH now counts as a quote asset when the outer
   transaction's `value > 0` and `tx.from == candidate`. v1.1's
   QUOTES list contained only ERC-20 tokens. On Universal Router
   swaps funded with ETH, the WETH that reaches the pair is minted
   from the zero address and no ERC-20 leaves the candidate. Before
   this amendment, ETH-funded purchases fell to UNRESOLVED.

2. **§3.1** — `0x3593564c` (Universal Router
   `execute(bytes,bytes[],uint256)`) added to the direct-swap
   selector set. v1.1's list stopped at Uniswap V2 router selectors.

### v1.1 (2026-10-15)


Three checklist items in v1 §11 failed review. This revision
addresses all three:

1. **§1.3** — added an "economic signer" definition covering
   EIP-7702 delegated accounts. v1 did not address 7702 at all.

2. **§3.2 and §3.3** — amended the EOA test so EIP-7702 delegated
   accounts classify as economic buyers (TRACED_ECONOMIC_RECIPIENT)
   rather than as INTERMEDIARY. v1's `is_contract == false` test
   misrouted modern smart-account wallets.

3. **§7** — replaced entirely. v1's revalidation plan specified a
   run on a window that has since been shown to lack in-period
   outcome variance (window-degeneracy finding, 2026-10-15). §7 now
   documents the precondition rather than a runnable plan.

All other sections are carried forward from v1 verbatim. Where a
section is unchanged, that is noted.

---

## 1. Scope and definitions

*(§1.1 and §1.2 unchanged from v1. §1.3 amended.)*

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

Note (2026-10-15): EIP-7702 is explicitly NOT in this deferral list.
See §1.3.

### 1.3 Definitions

*(unchanged)*

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

*(added 2026-10-15)*

**Economic signer:** the EOA that signed the outermost transaction
whose value was exchanged for the PEPE. This includes:

- Plain EOAs — the transaction originator, no code at the address
- EIP-7702 delegated accounts — the EOA retains control of the
  private key; the delegate supplies code that the EOA's signature
  executes. At query time the account reports `is_contract == true`
  and `proxy_type == "eip7702"` with a populated `implementations`
  list. The EOA is still the economic actor.
- ERC-4337 smart accounts — where the UserOperation's signer is
  recoverable from the bundler transaction's calldata. This case is
  still deferred to v2 (§1.2), because signer recovery from
  bundler calldata is not implemented in the v1 pipeline.

For the purposes of this spec, an EIP-7702 delegated account is
treated as an EOA. It is not an intermediary, and the fact that
`is_contract` returns true does not disqualify it as an economic
buyer. The relevant question is whether the account is controlled
by a single signer, not whether it currently carries code.

### 1.4 The critical rule

*(unchanged)*

No candidate is classified as a confirmed economic buyer solely
because it received PEPE from the pair's `Swap` event. The `Swap`
event identifies a recipient, not an economic actor. Attribution
requires value-flow reconstruction.

---

## 2. Evidence hierarchy

*(unchanged from v1 §2)*

Sources, ordered by reliability. When two sources disagree, the
higher-reliability source wins; when they cannot be reconciled, the
classification is UNRESOLVED.

### 2.1 Transaction receipt
- Source: `eth_getTransactionReceipt`, or Blockscout
  `/api/v2/transactions/{hash}`
- Evidence: `status` field. `status == 1` required for any purchase.
- Reliability: highest.

### 2.2 Token transfer logs (ERC-20 `Transfer`)
- Source: `eth_getLogs`, or Blockscout
  `/api/v2/transactions/{hash}/token-transfers`
- Evidence: `{token, from, to, value}` tuples.
- Reliability: authoritative for token movement. Not authoritative
  for economic intent.

### 2.3 Internal transaction trace
- Source: `debug_traceTransaction`, or Blockscout
  `/api/v2/transactions/{hash}/internal-transactions`
- Reliability: high for reconstructing value flow through contracts.
- Limitation: not universally available. Absent trace → UNRESOLVED.

### 2.4 Call input data
- Source: `tx.input` from the receipt
- Evidence: bytes 0–3 method selector.

### 2.5 Contract metadata
- Source: Blockscout `/api/v2/addresses/{addr}`
- Evidence: `is_contract`, `name`, `metadata.tags`,
  `proxy_type`, `implementations`.
- Note (2026-10-15): `proxy_type == "eip7702"` and a populated
  `implementations` list are the signals that distinguish a
  delegated EOA from a protocol contract. This supersedes the v1
  reliance on `is_contract` alone.

### 2.6 Quote-asset outflow

- Source: token transfer logs, restricted to QUOTES set:
  WETH, USDC, USDT, DAI, WBTC, BUSD
- Evidence: ERC-20 `Transfer` where `from == candidate` and
  `token ∈ QUOTES`.
- Additionally (2026-10-15, v1.2): native ETH counts as a quote
  asset when the outer transaction's `value > 0` and
  `tx.from == candidate`. On Universal Router swaps funded with
  ETH, the WETH that reaches the pair is minted from the zero
  address and no ERC-20 transfer has the candidate as `from`. The
  virtual quote asset for this case is `native-eth`, and it
  satisfies both §3.1 and §3.2 identically to an ERC-20 outflow.

---

## 3. The four classifications

*(§3.0 and §3.1 unchanged. §3.2 and §3.3 amended. §3.4 unchanged.)*

### 3.0 Preconditions (all classifications)

if receipt.status != 1: → REJECTED (not a purchase)
if candidate not in token_transfers.to: → not a candidate for this tx
if candidate in token_transfers.to
AND candidate in token_transfers.from
AND candidate net position ≈ 0: → INTERMEDIARY (round-trip)

### 3.1 DIRECT_ORIGINATOR

*(unchanged)*

Requires all of:

- `tx.from == candidate`
- `candidate` appears as `to` in at least one target-token transfer
- `candidate` appears as `from` in at least one quote-asset transfer,
  with a positive amount
- `tx.input` method selector is in the direct-swap set:
  `0x7ff36ab5`, `0x18cbafe5`, `0x38ed1739`, `0x8803dbee`,
  `0xfb3bdb41`, `0x4a25d94a`, `0x022c0d9f`, `0x3593564c`
  (Universal Router `execute`, added v1.2, 2026-10-15).
- The method selector is read from `tx.raw_input[0:10]`, not from
  the provider's human-readable `method` field (`"execute"`,
  `"swapExactTokensForTokens"`, etc.), which is not a selector.
- No aggregator selector detected in the trace

### 3.2 TRACED_ECONOMIC_RECIPIENT

*(amended 2026-10-15: the EOA test is replaced with a
controlled-by-single-signer test)*

Requires all of:

- `candidate` appears as `to` in at least one target-token transfer
- `candidate` appears as `from` in at least one quote-asset transfer
  with a positive amount, in the same transaction
- The transaction's value flow reconciles within a pre-declared
  tolerance. "Reconciles" is defined as follows.

  For the pair that emitted the target-token transfer, fetch the
  reserves at the transfer's block:

  - Uniswap V2 pair: `getReserves()` via `eth_call` at the block
    immediately before the transaction. Reserves are `(reserve0,
    reserve1)` in the pair's token order.
  - Uniswap V3 pool: `slot0()` at the block immediately before the
    transaction yields `sqrtPriceX96`. Derive price as
    `(sqrtPriceX96 / 2^96)^2`, adjusted for the two tokens' decimal
    difference.

  Compute the expected quote-asset amount:

      expected_quote = target_inflow * (quote_reserve / target_reserve)

  Reconcile if:

      |actual_quote_outflow - expected_quote| / expected_quote <= 0.10

  The 10% tolerance absorbs slippage, LP fee (0.30% V2, tiered V3),
  and rounding. It is intentionally loose: the reconciliation's
  purpose is to distinguish "paid for the tokens" from "received
  tokens for free," not to compute cost basis.

  If the reserve call fails, the block is pruned, or the reserves
  are zero, the acquisition is UNRESOLVED with
  reason_code = "reserve-unavailable".

  The `eth_call` target uses the same Blockscout PRO endpoint
  already used for `/api/v2/transactions/{hash}`. It is an
  additional provider call: one per (pair, block) pair, cached
  within a run. Estimated additional calls for the current 1,132
  candidates: under 500.
- The call trace shows the target-token and quote-asset transfers
  occurring within the same internal call subtree
- `candidate` is controlled by a single economic signer. This is
  satisfied when ANY of:
  - `candidate.is_contract == false` (plain EOA), or
  - `candidate.proxy_type == "eip7702"` (delegated EOA; the
    `implementations` list identifies the delegate, and the delegate
    is a standard smart-account implementation — Simple7702Account,
    or another implementation listed as transparent), or
  - the internal trace shows the candidate as the terminal
    beneficiary of the PEPE with no forwarding within the same
    transaction, and the candidate is not a protocol contract

This is the aggregator-routed case. The candidate paid for the tokens
even though a router signed and executed on their behalf.

### 3.3 INTERMEDIARY

*(amended 2026-10-15: EIP-7702 accounts are excluded from this
classification)*

Any of:

- `candidate.is_contract == true` AND
  `candidate.proxy_type != "eip7702"` AND
  the candidate is not classified as an EIP-7702 delegated account
  per §3.2 above
- `candidate` received target token but has no quote-asset outflow in
  the same transaction, AND the trace shows the candidate forwarding
  the target token onward within the same transaction
- `candidate` received target token from the pair, then sent a
  matching amount to another address within the same block

### 3.4 UNRESOLVED

*(unchanged)*

Any of:

- Internal trace unavailable from the provider
- Internal trace truncated
- ERC-4337 pattern detected (EntryPoint address
  `0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789` in the call path)
- Gas-sponsored pattern detected
- Quote outflows and target inflows cannot be reconciled by the
  observed pool price at that block
- Any source returned a provider error that prevented evaluation

UNRESOLVED candidates are counted and reported. They are not
retained in the gold-standard population. They are not excluded
silently.

---

## 4. Failure handling

*(unchanged from v1 §4)*

### 4.1 Provider errors
Classification = UNRESOLVED, reason_code = "provider-error-{source}".
No fallback to less-reliable sources.

### 4.2 Truncated traces
Classification = UNRESOLVED, reason_code = "trace-truncated".

### 4.3 Conflicting evidence
Classification = UNRESOLVED, reason_code = "value-flow-conflict".

### 4.4 Rate limiting
Bounded exponential backoff, capped at 60 seconds. After 5 consecutive
failures on the same URL: UNRESOLVED with "provider-unreachable". The
run continues.

### 4.5 What never happens
- Never classified as buyer because trace fetch failed.
- Never classified as buyer because swap event showed receipt and no
  contradicting evidence was found.
- Run never reported complete when UNRESOLVED exceeds the pre-declared
  ceiling (§6.6).

---

## 5. Audit record schema

*(unchanged from v1 §5)*

Every processed candidate produces one audit record. The record is
the artifact of record.

```json
{
  "schema_version": "buyer-attribution-v1.1",
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
    "internal_call_path": ["0x... -> 0x...: CALL"],
    "trace_available": true,
    "trace_truncated": false
  },
  "contract_status": {
    "is_contract": false,
    "proxy_type": null,
    "implementations": [],
    "observed_at": "2026-10-15T...",
    "source": "blockscout-v2"
  },
  "provider": {
    "name": "blockscout-v2",
    "api_base": "https://eth.blockscout.com/api/v2",
    "version": "2026-10"
  },
  "reviewed_by": null,
  "review_notes": null,
  "created_at": "2026-10-15T..."
}
6. Population acceptance criteria

(unchanged from v1 §6, with one note on §6.6)
6.1 Completeness

Every candidate has exactly one audit record. Sum of classification
counts equals total candidate count.
6.2 Reconciliation

DIRECT_ORIGINATOR + TRACED_ECONOMIC_RECIPIENT + INTERMEDIARY +
UNRESOLVED + REJECTED = total input count.
6.3 Reproducibility

Re-running with same block range and provider version produces the
same records, modulo timestamps.
6.4 Manual review

10% sample of retained buyers reviewed manually. Disagreement rate
must be below 5%.
6.5 Excluded-candidate sample

10% sample of INTERMEDIARY and UNRESOLVED reviewed manually.
Disagreement below 10%.
6.6 Threshold for completion

UNRESOLVED as a fraction of total must be below 40%.

Note (2026-10-15): v1 review flagged this ceiling as potentially
unreachable. With §3.2 amended so EIP-7702 accounts classify as
buyers, the INTERMEDIARY count no longer absorbs modern smart-account
wallets. The 40% figure is retained pending an actual run.
7. Gate 0b revalidation plan (rewritten 2026-10-15)

The v1 plan specified a run on the PEPE window
[25735200, 25785424], matched on PEPE trade count, scored with
Mann-Whitney U. That plan cannot run. See §7.0.
7.0 Precondition — window validity

Gate 0b cannot be run on the current PEPE window (2026-08-08 through
2026-08-23). Within that window, every entry date 08-08 through 08-18
had a 14-day forward return above +33%; every date from 08-19 onward
was below the 20% threshold used by earlyEntryRate. The metric on
this window is a date classifier, not a wallet classifier.
See docs/audits/gate-0b-window-degeneracy-2026-10-15.md.

Before revalidation can run, one of:

    (a) a new window is selected whose 14-day forward returns vary
    within the window (some dates above 20%, some below), or

    (b) earlyEntryRate is replaced with a regime-normalized variant:
    for each wallet, the excess of its rate over the mean rate of the
    dates it traded on.

Neither is implemented. No window is selected. This section
documents the precondition; it does not execute the test.
7.1 Population construction

Once a valid window is selected:

    Treatment — candidates from data/pepe-buyer-list/v1.json whose
    entry dates fall in the new window. Filter through the v1.1
    classifier (§3 as amended). Retain DIRECT_ORIGINATOR and
    TRACED_ECONOMIC_RECIPIENT. Report counts.

    Control — candidates from data/control-candidates/v2.json
    matched 1:1 on exact inCount. See
    docs/designs/gate-0b-control-1-design-v2.md. The v1
    ±30%-of-median matching rule is superseded.

7.2 Metric

earlyEntryRate as defined in
js/intelligence/smart-money/wallet-profiler.js:

    Per wallet, over the wallet's full PEPE buy history

    Numerator: buys followed within 14 days by a PEPE price rise of

        =20%

    Denominator: priced buys (both buy-day and buy+14d price available)

    Sample floor: 10 priced buys. Wallets below the floor are dropped
    and reported.

Regime normalization, if selected per §7.0(b), is applied at this
step.
7.3 Statistical test

Mann-Whitney U on the two populations. Report n_gold, n_control,
medians, effect size, 95% bootstrap CIs, p-value.

Pre-declared thresholds (unchanged from v1): p < 0.05 AND
gold median >= 2 * control median. Thresholds are not adjusted
after seeing the result.
7.4 Hold-out

The re-run is a test, not a tuning round. If it fails, the metric is
not validated. No threshold adjustment is permitted in the same run.
7.5 What §7 does not authorize

It does not authorize running Gate 0b against the current window.
The current window has no in-period variance. Running against it
would produce a number that reflects entry-date distribution, not
wallet behavior, and would repeat the error class that invalidated
Attempt 1.
8. Known limitations and deferred cases

(unchanged from v1 §8, with one note)

Deferred to v2:

    ERC-4337 user operations

    Gas-sponsored acquisitions

    Batched multicall purchases spanning multiple tokens

    Cross-transaction attribution

    Time-aware historical contract status

    Multi-hop routing across multiple DEXes in a single transaction

Accepted limitations in v1.1:

    Provider coverage for internal traces is not complete.

    Contract metadata is a snapshot, not historical.

    The QUOTES set is a fixed list.

Note (2026-10-15): v1 review flagged that "ERC-4337 unless the trace
reconciles" is the wrong cut — the right cut is signer recoverability.
That change is not made here; it is deferred to v2 to keep v1.1's
diff minimal. EIP-7702 handling (§1.3, §3.2) is the v1.1 resolution
of the immediate misrouting issue.
9. Implementation notes for find-pepe-buyers-v5

(unchanged from v1 §9, with an added step for 7702 detection)

Order of implementation:

    Swap-event extraction (unchanged from v4): produces the raw
    candidate list and the transactions they appeared in.

    EOA classification: one Blockscout call per unique address.
    Cached. If is_contract == true AND proxy_type != "eip7702",
    classify INTERMEDIARY and skip the trace work. If
    proxy_type == "eip7702", proceed to step 3 as if EOA.

    Transaction receipt fetch: one call per unique (candidate,
    transaction) pair. If status != 1, classify REJECTED.

    Token-transfer fetch: one call per transaction.

    Internal-trace fetch: one call per transaction, only if steps 3
    and 4 left the classification ambiguous.

    Decision tree: applies §3 rules to the gathered evidence.

    Audit record: writes the §5 schema.

    Report: prints classification counts and passes them through §6.

Estimated API calls for the current 1,132 candidates with ~8,000
transactions: roughly 10,000–15,000 calls if every candidate needs
trace. Bounded by caching; a 30-minute run against Blockscout PRO is
realistic.
10. What this specification does not do

(unchanged)

    It does not define the discrimination threshold, the metric, or the
    earlyEntryRate computation. Those are unchanged.

    It does not add signals, scoring, or UI.

    It does not unblock Gate 0b. Gate 0b remains on hold until §6 and
    §7 are executed and a clean result is reported.

11. Review checklist

Before this specification is implemented, confirm:

    □

    The economic-buyer definition matches the research intent
    (EIP-7702 clause per §1.3)
    □

    The four classifications cover every realistic case
    (§3.2 amended for 7702; verify no new gaps)
    □

    The decision tree is implementable with available provider data
    (reserve-fetch mechanism for §3.2 price reconciliation still
    unspecified — see review, item 3)
    □

    The acceptance criteria in §6 are sufficient
    □

    The Gate 0b revalidation plan (§7) is defensible given the
    window-degeneracy precondition
    □

    The known limitations in §8 are acceptable for v1.1

Only after this checklist is signed off does find-pepe-buyers-v5.js
become the correct next artifact.
