# Design — Deployer Graph (Phase 2)

**Status:** implemented and closed.
- Phase 2 scope: direct creation-call history only (see §1.1).
- CI: `test-and-build` passes on current `main`.
- Step 4 integration audit: complete; live-verified against Uniswap V3 factory.
- Factory-aware provenance (EOA → Factory → Contract) is explicitly out of scope
  and belongs to a future phase.
**Supersedes:** the earlier "Owner associations (Phase 1)" draft, preserved
verbatim under *Historical context* below for traceability.
**Implementation:** `js/intelligence/deployer-graph.js`
**Worker route:** `cf-worker/index.js` → `POST /bitquery/deployer`

---

## 1. Scope

This document defines how Weaver derives a **deployer of record** for a
token contract, and how that evidence is qualified before any part of it
is shown to a user.

It does **not** define owner identity. Owner and deployer are separate
concepts (Constitution §3.8) and must never be conflated. Specifically:

| Concept              | Source                          | Meaning                                              |
| -------------------- | ------------------------------- | ---------------------------------------------------- |
| `owner.address`      | GoPlus `owner_address`          | Current owner / admin authority reported by GoPlus.  |
| `creator.address`    | GoPlus `creator_address`        | Creator metadata reported by GoPlus.                 |
| `deployerAddress`    | Bitquery creation-call evidence | Address that initiated the creation call on-chain.   |

`deployerAddress` is the only value in this document that is established
from on-chain creation evidence. The other two are provider metadata and
are **inputs**, not conclusions.

---

## 2. Evidence contract

Bitquery returns two distinct creation shapes. Weaver must label each
row with the shape it actually observed, and must never guess.

| Bitquery shape                                                         | `callType`         | `deployedAddress`          |
| ---------------------------------------------------------------------- | ------------------ | -------------------------- |
| `Receipt.ContractAddress` is a non-zero address                        | `top-level`        | `Receipt.ContractAddress`  |
| `Receipt.ContractAddress` absent/zero **and** `Call.To` non-zero       | `factory-internal` | `Call.To`                  |
| Neither field yields a non-zero address                                | *(unresolved)*     | none — row is excluded     |

Source: [Bitquery — Smart Contract Creation](https://docs.bitquery.io/docs/blockchain/Ethereum/calls/contract-creation/).

### 2.1 `callType: "direct"` is not a valid label

The literal `"direct"` must not appear in any persisted
`deploymentEvidence` object, any UI string, or any test fixture. It
overstates what the response establishes for factory-internal rows.

Valid values: `"top-level"`, `"factory-internal"`.

### 2.2 Unresolved rows

A row whose creation evidence cannot be resolved is **not** treated as a
deployment. It is counted in `unresolvedCreationCount` on the profile
and excluded from `tokens[]`. This follows Weaver's "degradation over
fabrication" principle: an honest count of unclassified rows is
preferable to a plausible-looking but wrong deployment claim.

---

## 3. What this evidence establishes, and what it does not

### Establishes

- That a `Call.Create: true` row exists in the queried Bitquery dataset
  for the queried `deployerAddress`.
- Which address was created (subject to the table in §2).
- Which transaction hash and block time the creation occurred at.
- Which address initiated the creation call (`Call.From`).

### Does **not** establish

- That the deployer is the current owner. Owner identity is a separate
  lookup (GoPlus `owner_address`).
- That the deployed contract is a fungible token. Qualification is
  discussed in §4.
- That the deployer is an EOA. A smart contract can be a deployer.
- For `callType: "factory-internal"`: that the initiating address is the
  EOA that deployed the factory. `Call.From` is the factory itself.
  Consumers must not conflate the two.

### Dataset limitation

The Worker query uses `dataset: realtime` to stay within the free/trial
Bitquery plan. Consequences:

- Results cover only recent blocks.
- A deployer whose last creation is older than the realtime window will
  return an empty `Calls` array — an honest "no recent creations", not
  an error.
- Switching to `combined` or `archive` requires a paid plan and a
  corresponding Worker change. Do not switch silently.

---

## 4. Qualification policy

The Bitquery response identifies contracts a deployer created. It does
not confirm that each contract is a fungible token.

Weaver's current policy:

1. **The token under analysis** is the only contract we can independently
   confirm as a token. GoPlus recognized it — that is precisely why we
   have a `creator_address` to query with.
2. Any other contract returned by Bitquery is counted in
   `filteredContractCount` and **not** admitted to `tokens[]`.
3. Unresolved rows are counted separately in `unresolvedCreationCount`.

`summarise()` reports counts from `tokens[]` only. Filtered and
unresolved contracts are visible as numbers, not as qualified tokens.

Refining this — for example, a per-contract GoPlus follow-up, or a
richer Bitquery query with token metadata — is deferred to a later step
and will require a `METHODOLOGY_VERSION` bump.

---

## 5. Data flow

```text
GoPlus assessment
  └── creator.address              (query hint only)
          │
          ▼
  POST /bitquery/deployer          cf-worker/index.js
    { chain, deployerAddress }     (fixed-query architecture;
          │                         client cannot supply GraphQL)
          ▼
  Bitquery Calls(...) response
          │
          ▼
  extractCreationEvidence(call)    deployer-graph.js
          │
          ├── top-level        → Receipt.ContractAddress
          ├── factory-internal → Call.To
          └── unresolved       → counted, excluded
          │
          ▼
  qualification                    (only current token qualifies)
          │
          ▼
  record(chain, deployerAddress, profile)
          │
          ▼
  W.store (localStorage, TTL 24h, cap 100)
```

### 5.1 Why the query is fixed

The client sends only `{ chain, deployerAddress }`. The Worker
constructs the GraphQL query from a fixed template and attaches
`Authorization: Bearer <BITQUERY_KEY>` from its environment. This
prevents a caller who discovers the Worker URL from running arbitrary
queries against the account. See `cf-worker/index.js` for the fixed
query and the security note about the CORS allowlist.

---

## 6. Cache

- **Store:** `W.store` (localStorage with an in-memory fallback).
- **Key:** `deployer:<chain>:<deployerAddress>` — lowercased EVM hex.
- **TTL:** 24 hours (`RETENTION_MS`).
- **Cap:** 100 profiles (`MAX_PROFILES`).
- **Eviction:** expired entries first, then least-recently-observed.
- **Index:** `deployer:__index__` holds the list of live keys.

`get(chain, tokenAddress)` is a **semantic** lookup: it returns the
profile whose `tokens[]` contains the given token. A profile that
qualified zero tokens is still recorded and returned by `observe()`,
but will not be surfaced by `get()`.

---

## 7. Methodology versioning

`METHODOLOGY_VERSION` is stored on every cached entry. Bump it whenever
the extraction policy, qualification policy, or evidence shape changes.

| Version              | Change                                                                 |
| -------------------- | ---------------------------------------------------------------------- |
| `deployer-graph-v1`  | Initial Phase 2 implementation; used `Call.To` for every row and labelled everything `callType: "direct"`. |
| `deployer-graph-v2`  | Introduced `extractCreationEvidence()`; distinguishes top-level from factory-internal; counts unresolved rows; removed `"direct"` label. |

A methodology change does not invalidate the cache automatically; the
new version will simply be recorded on subsequent observations. If a
change is semantically incompatible with v1 entries, call
`W.deployerGraph.reset()` on deploy.

---

## 8. Risk authority

`isHighRisk` is **not** persisted on token observations. It is derived
at summarise time via `W.shield.isHighRisk()`. This ensures a Shield
methodology change does not leave stale booleans in the cache.

`summarise()` reports counts, never rates. A profile with N qualified
tokens and K of them high-risk produces:

> "Deployer previously created N qualified tokens — K flagged high-risk"

Never a percentage, never a score.

---

## 9. Failure behavior

Every public function returns `null` or `false` on failure. No public
function throws.

| Failure                                   | Result                                    |
| ----------------------------------------- | ----------------------------------------- |
| `W.store` missing                         | Reads return `null`; writes return `false`.|
| Worker base URL not configured            | `observe()` returns `null`, no network call.|
| Worker fetch fails (network/CORS)         | `observe()` returns `null`.               |
| Worker returns non-2xx                    | `observe()` returns `null`.               |
| Worker returns non-JSON                   | `observe()` returns `null`.               |
| Bitquery response carries `errors[]`      | `extractCalls()` returns `null`; `observe()` returns `null`. |
| A call row is unresolved                  | Row counted in `unresolvedCreationCount`; other rows proceed normally. |
| Corrupt cached entry                      | `readEntry()` returns `null`; entry treated as absent. |

The design goal is that any single failure degrades to "no deployer
information available", never to a wrong or partial deployment claim.

---

## 10. Open items

- **Avalanche network mapping** (`CHAIN_TO_BITQUERY_NETWORK.avalanche`)
  has not been live-verified. It must be confirmed with a real,
  recently-active deployer before being declared supported. If Bitquery
  rejects the network name, remove the mapping rather than shipping a
  route that returns 502.
- **CI verification.** The Worker test suite exists
  (`cf-worker/index.test.js`) but the current commit's combined status
  has not been confirmed green. Step 4 closure requires a green run.
- **Per-contract qualification.** A future step could enrich
  `tokens[]` beyond the single token under analysis, but this requires a
  new methodology version and, likely, additional GoPlus or Bitquery
  calls per contract.

---

## Historical context — Phase 1 owner associations

The section below is the **superseded** Phase 1 draft. It is retained
for traceability because early commits, issue threads, and internal
notes reference it. It is **not** the current design and must not be
used as the source of truth for the Deployer Graph.

<details>
<summary>Original Phase 1 draft — "Design — Owner associations"</summary>

<!--
PASTE THE ORIGINAL docs/deployer-graph-design.md CONTENT HERE,
UNCHANGED. Do not edit it. It is preserved verbatim as a historical
artifact. The <details> block keeps it out of the way for readers who
open the file looking for the current design.
-->

### Supported chains for `/bitquery/deployer`

| Chain     | Bitquery `network` | Status |
| --------- | ------------------ | ------ |
| Ethereum  | `eth`              | ✅     |
| BSC       | `bsc`              | ✅     |
| Base      | `base`             | ✅     |
| Arbitrum  | `arbitrum`         | ✅     |
| Polygon   | `matic`            | ✅     |
| Optimism  | `optimism`         | ✅     |
| Avalanche | *(unmapped)*       | ❌ V1-only on Bitquery; V2 streaming endpoint does not support it. Requests return HTTP 400 `Unsupported chain`. |

Chains absent from this table are rejected by the Worker before any
upstream call. To add a chain, it must first be confirmed as supported
on Bitquery's V2 streaming endpoint (`streaming.bitquery.io/graphql`)
and then added to `CHAIN_TO_BITQUERY_NETWORK` in `cf-worker/index.js`.

</details>