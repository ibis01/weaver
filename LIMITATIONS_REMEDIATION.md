# Weaver Remaining Limitations — Audit and Remediation

**Repository:** https://github.com/ibis01/weaver  
**Audited revision:** `da98d21ab57682a6bb7ac904ed91ce78a16badca` (`fix(shield): clamp risk scores and handle unknown LP evidence`)  
**Audit date:** 2026-10-04/05  
**Working branch:** `staging-shield-fix-20260922`

## Executive summary

The seven limitations are real, but most are **provider- and data-contract-dependent capabilities**, not defects that can be safely completed using the current repository alone. The audit found several correctness and safety issues that could be fixed locally, and those fixes are now implemented. The repository still needs selected chain-native providers, RPC/indexer access, durable historical storage, and operational quota contracts before the missing intelligence features can be truthfully marked complete.

## Implemented in this pass

### 1. Conservative LP-lock aggregation

**Problem:** the EVM Shield assessment classified LP evidence as locked when any LP holder was marked locked. A payload containing one locked and one explicitly unlocked position could therefore avoid the unlocked-liquidity penalty.

**Fix:** `js/features/shield.js` now returns:

- `locked` only when every material LP entry is explicitly locked;
- `unlocked` only when every entry is explicitly unlocked;
- `unknown` for mixed, malformed, empty, or incomplete evidence.

The assessment no longer emits `isLpLocked: true` for mixed evidence. Existing and new regression tests cover missing, malformed, string-valued, empty, all-locked, all-unlocked, and mixed payloads.

### 2. Time Machine future-leakage fix

**Problem:** `getSnapshotAt()` selected the snapshot nearest to the cutoff using absolute distance. A snapshot after the requested historical cutoff could be selected, introducing forward-looking portfolio state.

**Fix:** `js/features/timemachine.js` now selects the latest valid snapshot whose timestamp is **at or before** the cutoff and returns `null` when no eligible snapshot exists.

### 3. News provenance and article freshness

**Problem:** live RSS parsing discarded feed identity and treated all fetched articles as equally current. Publication timestamps were not normalized into a reliable per-article contract.

**Fix:** `js/features/news.js` now preserves or derives:

- `providerId` and `publisher`;
- `canonicalUrl`;
- normalized nullable `publishedAt`;
- request `fetchedAt` and `observedAt`;
- `provenanceConfidence` (`high` or `partial`).

Deduplication uses the canonical URL when available, and the resource health source identifies contributing RSS providers. Unknown publication time remains explicit rather than being treated as current.

### 4. Gem discovery provenance and freshness

The existing Gem discovery path is still an **aggregated DexScreener latest-token feed**, not a chain-native launch feed. It is now explicitly marked in runtime metadata as:

- provider: `dexscreener`;
- source type: `aggregated-latest`;
- `observedAt` and a five-minute freshness window;
- resource health source: `dexscreener:aggregated-latest`.

This prevents the current source from being silently represented as native or complete per-chain launch coverage.

### 5. Source-aware proxy rate limits

The existing proxy had a client bucket but no provider-specific bucket. `proxy-server.js` now retains the client abuse cap and adds a second Redis/memory-backed bucket keyed by the validated upstream hostname, including redirected hosts. Both Redis and memory backends now honor the selected bucket's own window and capacity. New configuration is available through:

- `PROVIDER_RATE_LIMIT_WINDOW_MS` (default `60000`);
- `PROVIDER_RATE_LIMIT_MAX_REQUESTS` (default `120`).

Production Redis and existing trust-proxy requirements remain unchanged.

The proxy also records per-provider route request count, success/failure count, last status, latency, and error, exposes them through `/health/providers`, and forwards an upstream `Retry-After` header when present.

### 6. Dependency supply-chain remediation

`npm audit fix --ignore-scripts` upgraded the vulnerable transitive packages in `package-lock.json`:

- `brace-expansion` → `5.0.12`;
- `serialize-javascript` → `7.1.2`.

The final audit reports **0 vulnerabilities**. The package-lock root identity was restored to the repository’s original `weaver` name after npm added a local-directory name during remediation.

## Audit of the seven remaining capability areas

| Capability | Current status | What is now true | What remains |
|---|---|---|---|
| Chain-native launch feeds | Partial | Current DexScreener aggregation is explicitly labelled with source and freshness metadata; supported-chain filtering remains bounded. | Native Solana/Base/BSC and other chain adapters, event timestamps, pagination, cache/stale policy, provider contracts, and live integration tests. |
| LP-lock and LP-ownership verification | Partial | Mixed provider evidence is conservative and cannot be called fully locked; missing Solana evidence remains unavailable. | Independent EVM RPC/indexer verification of pair, LP token, locker, amount, expiry, and block; separate AMM/program adapters for Solana; owner/admin chain reads. |
| Unique-holder growth and smart-wallet netflow | Partial | Local observations expose provider-reported holder counts and short-window deltas. | Durable history, pagination-complete transfer aggregation, token decimals, mint/burn semantics, completeness metadata, and explicit separation of pseudonymous addresses from beneficial owners. |
| Sell simulation and slippage testing | Missing | Existing Shield honeypot/tax signals remain read-only heuristics; analytical SELL output is not presented as execution. | Chain-specific quote/simulation adapters, route-specific `eth_call`/Solana simulation, taxes, gas, min-out/deadline, and mocked/testnet fixtures. No wallet-signing or execution should be added as a side effect of this pass. |
| Social attention quality and bot risk | Partial | News now carries provider and article-level provenance/freshness. | Social platform ingestion, engagement normalization, author diversity, coordination/bot-risk methodology, and source/licensing contracts. RSS alone cannot support bot-risk claims. |
| Historical snapshots and backtesting | Partial | Time Machine no longer selects future snapshots. Track-record snapshots remain immutable. | Point-in-time feature bundles, durable append-only storage, historical prices/liquidity/on-chain inputs, as-of replay APIs, execution/fee/slippage model, walk-forward runner, and leakage tests. |
| Source-specific rate limits and provider health | Partial | Node proxy now has client and validated-host buckets, Redis parity, route latency/status counters, `/health/providers`, and `Retry-After` forwarding; production Redis is enforced by existing startup checks. | Provider-operation quota accounting, half-open breakers, direct-fetch adapter unification, Cloudflare Worker abuse controls/state, and durable/shared provider-health history. |

## Provider-dependent blockers that must be resolved before the remaining features are production-complete

1. Select and authorize launch-feed providers for Solana, Base, BSC, and any additional chains. Define what “launch” means: token creation, first pool, first liquidity, first trade, or first provider observation.
2. Select RPC/indexer and locker registries for independent LP and owner verification. The implementation must preserve block number, block timestamp, locker address, locked amount, expiry, and methodology version.
3. Select a durable historical store and retention policy. Redis is operational state in this repository, not a backtesting ledger.
4. Select quote/simulation providers and define supported DEX routes and chain semantics. Keep this strictly read-only until simulation confidence is established.
5. Select social data sources and a defensible bot-risk methodology. Do not infer bot activity from headline count or raw engagement.
6. Establish quotas, licensing, attribution, and retry semantics for each provider. Add credentials only through the deployment secret mechanism; none were invented or added during this audit.

## Validation

The final validation completed successfully:

- `npm audit --audit-level=high` — **0 vulnerabilities**;
- focused regression suite — **36 passing**;
- complete unit suite — **549 passing, 2 pending**;
- complete integration suite — **16 passing**;
- complete security suite — **16 passing**;
- Playwright E2E — **8 passing**;
- `npm run build` — passed;
- `npm run minify` — passed;
- `git diff --check` — passed.

The provider-health correction and rebuilt bundles were included in the latest validation run.

The generated browser bundles were rebuilt after the source changes.

## Recommended next implementation order

1. Add an explicit server-side launch-feed adapter boundary with bounded cache, stale-if-error, provider/chain provenance, and contract tests; retain DexScreener as a labelled fallback.
2. Implement independent EVM LP/owner verification for one supported chain and one known DEX/locker family, then add Solana-specific program adapters separately.
3. Build the durable point-in-time observation ledger and replay contract before claiming backtesting support.
4. Add a read-only quote/simulation adapter for one EVM route and one Solana route, with no transaction submission.
5. Expand provider health telemetry and Worker rate limiting after provider quotas and deployment state storage are selected.
6. Add social-signal ingestion only after provenance, licensing, and bot-risk methodology are approved.
