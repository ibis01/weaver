# Design — Owner associations

**Status:** draft, awaiting implementation
**Depends on:** `js/features/shield.js`, `js/storage/storage.js`
**Blocks:** Nothing in the current sequence
**Phase:** 1 of 3 (see §8)

## 1. Problem

When a token is discovered by the Gem Agent and passes through Shield
enrichment, the assessment answers "is this contract safe?" It does not
answer:

- Has the same address been seen as owner on other tokens?
- Were any of those tokens flagged high-risk by Shield?

A full Deployer Graph — funding-wallet tracing, cross-token deployment
history, cross-chain identity clustering — requires on-chain creation
events and deployer transaction history. That is a substantial
data-acquisition problem with a real external dependency.

This document scopes a smaller, honest step: track the address that
GoPlus reports as `owner_address`, and observe whether the same address
appears as owner on multiple tokens during a browser session. No new
external dependency. No claim about who deployed anything.

## 2. Terminology — why "owner", not "deployer"

`owner_address` in the GoPlus EVM response is the address that currently
holds owner/admin authority on the contract. It is not necessarily the
address that deployed the contract. It can change over time. It can be
a multisig. It can be a proxy admin contract.

GoPlus documents `creator_address` separately. It also documents that
`owner_address` may be absent when the owner cannot be determined,
including some proxy and open-source cases.

Conflating `owner_address` with "deployer" would produce statements like
"this deployer has launched 3 tokens" that the underlying data does not
support. That violates the "degradation over fabrication" principle
documented in the constitution and enforced throughout the Shield,
Evidence, and Track Record work.

**Phase 1 uses "owner" terminology exclusively.** The word "deployer"
is reserved for Phase 2, when on-chain deployment evidence is actually
available.

| Term | Meaning in this document |
| :--- | :--- |
| **owner address** | The value of `owner_address` from the GoPlus EVM response |
| **owner observation** | A single record: "at time T, address A was reported as owner of token X" |
| **owner association** | A set of owner observations sharing the same owner address |
| **deployer** | The address that created the contract. **Not known in Phase 1.** |

**Owner address ≠ entity.** Even with the correct terminology, an
identical owner address on multiple tokens does not imply the same
human, team, or project. An owner address may be a multisig, a
deployer contract, or a shared admin wallet. The strongest supported
statement is: *"The same address was observed as the owner of multiple
tokens."* Never *"the same team controls multiple tokens."*

## 3. What the design must achieve

| Property | Meaning |
| :--- | :--- |
| **Honest scope** | Only claims what the available data supports |
| **Session-bounded** | Observations live for the session; no persistence yet |
| **Chain-aware** | Same owner address on two chains is two separate observations |
| **Token-deduplicated** | A token counts once per `(chain, tokenAddress)` within the session |
| **Missing-data honest** | No owner address → no observation, never a fabricated one |
| **Single risk authority** | `isHighRisk` comes from `W.shield.isHighRisk()` |
| **Failure-isolated** | Storage/read errors never break the Gem scan |

## 4. Data source

### 4.1 Available today

The GoPlus EVM token security response includes `owner_address` in the
raw result. `assessEvmRisk()` does not currently surface it on the
returned assessment, but the raw response is already fetched and
cached.

**The Phase 1 association source is specifically `result.owner_address`.**
It must **not** reuse `result.owner`, `creator_address`, holder tags, or
any inferred address.

`owner_address` may be absent when the owner is unknown or cannot be
determined — some proxy and open-source cases. The implementation must
treat absence as `null`, never as a default, never as a fabricated
value.

### 4.2 Not available today

- Whether the owner address is also the deployer
- Deployer funding wallet (needs on-chain trace)
- Prior deployments by any address (needs a creation-event indexer)
- Cross-chain identity (needs a multi-chain provider)
- Owner-address history on-chain (needs a transaction indexer)

### 4.3 Solana

The GoPlus Solana endpoint does not return an owner field in the same
shape. Phase 1 skips Solana owner observations entirely, matching the
Market Structure policy for Solana holder data.

## 5. Design

### 5.1 Assessment extension

`assessEvmRisk()` gains one field:

```js
owner: {
  address:
    typeof result.owner_address === "string"
      ? result.owner_address.trim().toLowerCase()
      : null,
  source: "goplus-evm",
}