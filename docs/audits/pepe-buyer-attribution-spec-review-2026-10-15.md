# PEPE buyer attribution spec v1 — review

**Date:** 2026-10-15
**Reviewer:** session review against the roadmap's execution order
**Spec reviewed:** `docs/designs/pepe-buyer-attribution-v1.md`
**Roadmap requirement:** production-roadmap-v1.md, Priority 2 —
"Rules and classifications reviewed before new extraction code."

## Summary

**Verdict: NOT READY.** Three of six checklist items fail or are
uncertain. The spec cannot govern implementation until they are
resolved by a v2 revision.

The three failing items all trace to the same root: the spec defers
ERC-4337 and EIP-7702 (smart-account) acquisitions to v2 (§1.2), but
the reference transactions observed in this session are
EIP-7702-wrapped smart accounts. Under the v1 decision tree those
candidates classify as UNRESOLVED, not as buyers. That may be the
intended conservative choice, but it has not been decided — it has
been inherited from the deferral clause.

## Checklist

### ☐ The economic-buyer definition matches the research intent

**NOT SATISFIED as written.**

§1.3 defines "economic buyer" as the address whose value was exchanged
for the PEPE, reconstructed from the transaction's value flow. This is
correct in principle.

But the definition is silent on EIP-7702-delegated accounts. Under
§1.2, ERC-4337 user operations are deferred "unless the trace
reconciles to a single identifiable economic actor." EIP-7702 is not
mentioned at all. The reference transaction from this session
(0x71124be5) is a Crossmint `approveAndExecute` where the signer is
an EOA and the receiving address carries an EIP-7702 delegate
(`implementations` populated, `proxy_type: eip7702`). The spec does
not say whether such an address is an economic buyer, an
intermediary, or UNRESOLVED.

**Decision required before implementation:** does the definition of
economic buyer include EIP-7702 accounts whose delegate is transparent
and whose owner signed the outer transaction? If yes, §1.3 needs an
explicit clause. If no, §1.2's deferral list needs to name 7702.

### ☐ The four classifications cover every realistic case

**NOT SATISFIED.**

The four classifications are DIRECT_ORIGINATOR,
TRACED_ECONOMIC_RECIPIENT, INTERMEDIARY, UNRESOLVED. Three cases
observed this session do not fit cleanly:

1. **EIP-7702 delegate accounts.** Under §3.2, TRACED_ECONOMIC_RECIPIENT
   requires `candidate.is_contract == false`. A 7702-delegated account
   has `is_contract == true` at the address level. Under §3.3,
   INTERMEDIARY fires on `candidate.is_contract == true`. So the
   candidate classifies as INTERMEDIARY — but the candidate is the
   economic actor, not a router. This is a misclassification, not a
   conservative default.

2. **Gas-sponsored acquisitions.** §1.2 defers these to v2. §3.4 lists
   "gas-sponsored pattern detected" as an UNRESOLVED reason. Consistent,
   but it means the population will be built from wallets that paid
   their own gas — a subset that biases toward older EOA patterns.

3. **Batched purchases.** §8 defers multicall purchases to v2. If the
   primary window contains multicall acquisitions, they drop to
   UNRESOLVED. Not a spec error, but the acceptance-criteria ceiling
   (§6.6) must account for them.

**Decision required:** add a fifth classification
(TRACED_ECONOMIC_RECIPIENT_SMART_ACCOUNT) or amend §3.2/§3.3 to
treat 7702 accounts per the delegate's behavior rather than per the
address's `is_contract` flag.

### ☐ The decision tree is implementable with available provider data

**SATISFIED with one caveat.**

Every input §3 requires is available from Blockscout PRO:

- `tx.status` — `/api/v2/transactions/{hash}` returns `status`
- ERC-20 transfer logs — `/api/v2/transactions/{hash}/token-transfers`
- Internal trace — `/api/v2/transactions/{hash}/internal-transactions`
- `tx.input` method selector — same transaction object
- Contract metadata — `/api/v2/addresses/{addr}`

Caveat: §3.2 requires reconciling the quote-asset outflow against the
target inflow "given the pool's observed price at that block." The
pool's block-level price is not exposed by any single Blockscout
endpoint. It is derivable from the two token amounts in the transfer
logs plus pool reserves from a `eth_call` to the pair contract. That
is an additional provider dependency the spec does not name. Either
the spec should specify the reserve-fetch mechanism, or §3.2 should
relax to "proportional within a tolerance" without a price
reconciliation.

### ☐ §6 acceptance criteria are sufficient to prevent the same class of error

**PARTIALLY SATISFIED.**

§6.4 (manual review of a 10% sample, <5% disagreement rate) is the
right control and would have caught the original falsification — the
pass-through pattern is visible to any reviewer with an Etherscan tab.

§6.6 (UNRESOLVED ceiling at 40%) is the right kind of guard but the
value may be unreachable on this dataset. Given that EIP-7702 accounts
classify as INTERMEDIARY under current §3.3, and EIP-7702 usage is
growing, the ceiling may be breached by mechanism rather than by
provider failure — meaning the run is declared incomplete for a
reason that has nothing to do with data availability.

**Decision required:** either raise the ceiling with a justification,
or fix §3 so EIP-7702 accounts do not inflate the INTERMEDIARY count.

### ☐ §7 Gate 0b revalidation plan is defensible

**NOT SATISFIED — superseded.**

§7.1 rebuilds the gold-standard from the same Swap-event extraction
over blocks [25735200, 25785424]. §7.2 rebuilds the control from PEPE
holders matched on trade count within ±30% of the gold-standard
median. §7.3 computes `earlyEntryRate` per wallet. §7.4 runs
Mann-Whitney U on the two populations.

§7 is now superseded by two findings from this session:

1. `docs/audits/gate-0b-window-degeneracy-2026-10-15.md` establishes
   that the current PEPE window (2026-08-08 through 2026-08-23) has no
   in-period outcome variance — every entry date 08-08 through 08-18
   had a 14-day forward return above +33%, every date 08-19 onward was
   below the 20% threshold. Any population constructed from this
   window produces an earlyEntryRate determined by entry-date
   distribution, not wallet behavior.

2. `docs/designs/gate-0b-control-1-design-v2.md` replaces the ±30%
   trade-count matching with exact `inCount` matching on a
   net-holder population. §7.2 is out of date.

**§7 must be rewritten before any revalidation run.** The rewrite
depends on either selecting a window with in-period variance or
specifying a regime-normalized metric.

### ☐ §8 known limitations acceptable for v1

**SATISFIED with reservations.**

The deferred list (ERC-4337, gas-sponsored, multicall, cross-transaction
attribution, time-aware contract status, multi-hop routing) is
reasonable for a v1. The accepted limitations (incomplete trace
coverage, snapshot contract status, fixed QUOTES set) are honest.

Reservation: "ERC-4337 user operations, unless the trace reconciles"
is the wrong cut. The right cut is *whether the outer signer is
recoverable* — if it is, the signer is the economic actor regardless
of whether the call path is 4337, 7702, or plain EOA. Framing the
deferral on the mechanism rather than on signer recoverability means
v1 rejects precisely the modern wallets that will grow as a fraction
of the population.

## Recommended next artifact

Not `find-pepe-buyers-v5.js`. Not a classifier patch.

**The next artifact is a v2 revision of `pepe-buyer-attribution-v1.md`
that resolves the three failing items.** Structure:

1. Add an explicit clause on EIP-7702 and smart-account signer
   recoverability to §1.3 and §3.
2. Either add a fifth classification or amend §3.2/§3.3 to
   distinguish delegate-controlled accounts from routers.
3. Rewrite §7 to reference the window-degeneracy finding and specify
   the preconditions for revalidation.

Once v2 is reviewed and signed off, `find-pepe-buyers-v5.js` becomes
the correct next implementation artifact — and can be written against
a spec that will not need rewriting mid-run.

## Provenance

- Spec: `docs/designs/pepe-buyer-attribution-v1.md`
- Window degeneracy: `docs/audits/gate-0b-window-degeneracy-2026-10-15.md`
- Control design: `docs/designs/gate-0b-control-1-design-v2.md`
- Reference transaction: 0x71124be5ff8116e806b75a37845fa56987b0adccd42be364506dc2de6d34cb9b
- Roadmap: `docs/designs/production-roadmap-v1.md` Priority 2