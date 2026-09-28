# Weaver System Patterns — Architectural Rules

> Last synced: 2026-09-28. Prior version contained an embedded copy of
> `techContext.md` and a stray "ready-to-copy Markdown files" header;
> both removed.

## Evidence Pipeline

### Canonical Flow
```text
Signal → Evidence → PersonalContext → Assessment → DecisionPriority → Presentation
Module Ownership

    Signal Generation: js/intelligence/events.js
    (price moves, regime shifts, thesis deterioration)

    Evidence Building: js/intelligence/evidence-builder.js

    Context: js/intelligence/context.js
    (portfolio weight, watchlist, behavioral risk)

    Assessment: js/intelligence/decision-engine.js
    (relevance, impact, urgency, confidence)

    Presentation: js/intelligence/ranker.js
    (renders DecisionPriority[] sorted by score)

Confidence Authority

Single Canonical Authority: W.intelligence.computeConfidence()
confidence =
    sourceReliability
  × dataFreshness
  × corroborationFactor     // 1 + (corroborationCount − 1) × 0.1
  × dataCompleteness
  × interpretationConfidence
Rules:

    If any factor is null or unknown → confidence = null, never a
    reduced number.

    corroborationCount defaults to 1 when not supplied. Non-finite
    values (NaN, ±Infinity) are rejected — the invariant is
    "never returns NaN".

    No magic numbers (0.95, 0.8, etc.) in the formula. Values derive
    from evidence components.

    Source reliability is a per-source table in
    js/intelligence/contracts.js; never hardcode provider names
    inside the formula.

    Data freshness decays with signal age; the window is chosen per
    signal type.
Shield Risk Authority
Scoring System

    EVM Version: shield-evm-v1

    Solana Version: shield-solana-v1

    Max Score: 100 (clamped, never exceeded)

    Risk Threshold: defined in js/features/shield.js

Risk Factors (EVM)

    Honeypot: +50

    Mintable: +20

    Proxy: +15

    LP Unlocked: +15 (only when LP data exists; null = unknown, not
    unlocked)

    Buy Tax > 5%: +10

    Sell Tax > 5%: +10

    Owner Not Renounced: +5

Risk Factors (Solana)

    Freeze Authority: +30

    Balance Mutable: +25

    Mintable: +20

    Closable: +15

    Metadata Mutable: +10

    Transfer Fee > 5%: +15, else +5

High-Risk Predicate

Authoritative Function: W.shield.isHighRisk(assessment)

    The only place riskScore is compared to the threshold.

    Never duplicate the comparison elsewhere — call the function.

    Missing / errored / noData / unsupported assessments are
    never high-risk.

Evidence Provenance
Required Fields

Every evidence record preserves:

    source — data origin (e.g., "goplus-evm")

    observedAt — timestamp of observation

    methodologyVersion — scoring algorithm version

    relationship — "supporting" | "contradicting" | "neutral" | "unknown"

    freshness — data age score (0–1)

    reliability — source trust score (0–1)

Immutability Rules

    Historical records cannot be recalculated with newer models.

    Score versions must be distinguishable.

    Past results are preserved as originally generated.

    Corrections are auditable (original + correction both visible).

Observation Layer
Deployer Graph

    Module: js/intelligence/deployer-graph.js

    Key Format: {chain}:{deployerAddress.toLowerCase()}

    TTL: entries expire after configured window.

    Eviction: LRU when the cache exceeds MAX_PROFILES.

    Summarize: never uses "serial rugger", "safe", or "trusted".

Owner Associations

    Module: js/intelligence/owner-associations.js

    Scope: per-chain. The same address on two chains yields two
    distinct associations.

    Accumulation: distinct tokens under the same owner tracked.

    Deduplication: re-observing the same token updates the
    timestamp; it does not inflate the count.

Market Structure

    Module: js/intelligence/market-structure.js

    Observations: time-series storage with retention window.

    Trajectory: computes deltas when observations span a matching
    interval.

    Direction: "rising" | "falling" | "stable" | "unknown".

Track Record Immutability
Core Rules

    Immutable Snapshot — weaverSnapshot cannot be mutated.

    Immutable Timestamps — createdAt cannot be changed.

    Whitelisted Updates — only specific fields, only with a
    revision reason.

    No Implicit Linkage — Track Record does not auto-link to the
    portfolio.

Migration Rules

    Canonical and legacy records with matching signature AND content
    are deduplicated.

    Signature matches but content differs → conflict record created.

    Malformed records → quarantined with a deterministic ID.

    Unknown schema versions → quarantined, not silently interpreted.

Conflict Resolution

    Conflict IDs are deterministic across re-runs.

    migratedAt does not change on re-run.

    createdAt and weaverSnapshot preserved during migration.

Storage Boundaries
Local Storage Keys

    portfolio_holdings — manual portfolio entries

    portfolio_transactions — buy/sell transaction log

    wallet_sync_data — encrypted wallet list (AES-256-GCM)

    wallet_sync_cache — sanitized sync results
    (5-min TTL, masked addresses only)

    wallet_cost_basis — manual cost basis for wallet holdings

    last_known_prices — shared price cache between Dashboard and
    WalletSync

    encrypted_settings — AI/Telegram credentials encrypted with
    the user passphrase via W.secureSession

    track_records — immutable decision history

    decision_journal_v2 — decision journal entries

    alerts_v2 — price alerts

Encryption Model

    Vault: AES-256-GCM with PBKDF2 key derivation
    (600,000 iterations).

    Sync Code: 128-bit entropy, stored plaintext as a locator
    (not a cryptographic key).

    Password: never leaves the device; derives the encryption key.

    Settings: encrypted with the user-provided passphrase via
    W.secureSession.

Cache Strategy

    Market Data: provider chain CoinLore → CoinPaprika → Coinbase;
    last-known-price cache shared across modules.

    Sync Results: 5-minute TTL.

    Stale-While-Error: during upstream failures, serve cache up to
    10 minutes old.

Module Contract
Standard Pattern
window.W = window.W || {};
W.<feature> = (() => {
  // private functions and constants

  async function render(view) {
    // DOM manipulation
  }

  return { render /* other public methods */ };
})();
CSP Compliance

    Zero inline styles (style="..." attributes prohibited).

    Dynamic styling via CSS classes and CSS variables; when a runtime
    value is unavoidable, use CSSOM property assignment
    (el.style.x = ...). CSSOM assignment is not gated by
    style-src.

    Event handlers attached via addEventListener or property
    assignment after DOM insertion.

    No eval(), no new Function().

    No inline <script> — the CSP meta tag carries no nonce; every
    script loads same-origin or from an allowlisted CDN.

Escaping

    One escaper per module: esc() covering &, <, >, ", '.
    Safe in text and quoted-attribute contexts.

    W.fmt.escapeHTML (the textContent → innerHTML trick) escapes
    only &, <, > — it does not escape quotes. It is unsafe
    in any attribute position. Use a local esc in every renderer
    that emits attributes.

    URL schemes allowlisted: https: for images; http: / https:
    for navigation. Reject javascript:, data:, vbscript:.

Error Handling

    External API failures never crash the UI.

    Fetch wrappers handle their own failures and surface structured
    results.

    Distinct UI states for: unavailable, rate-limited, stale, error.

    No unhandled promise rejections.

    No silent failures.
    EOF

---

## 4 — `techContext.md`

```bash
cat > memory-bank/techContext.md << 'EOF'
# Technical Context

> Last synced: 2026-09-28.

## Core Architecture
Weaver is an evidence-first, non-custodial crypto intelligence and
decision engine. It strictly separates Signal, Evidence, Personal
Context, Assessment, Decision Priority, and Presentation.

## Market Data Provider Chain (Live & CI)
Due to rate-limiting and Cloudflare egress blocking of legacy
providers, the architecture has migrated to a resilient, keyless
fallback chain:
1. **Primary:** CoinLore (`api.coinlore.net`) — free, reliable,
   no API key required.
2. **Secondary:** CoinPaprika (`api.coinpaprika.com`) — robust free
   tier, matches the lowercase ID schema used by the app.
3. **Fallback:** Coinbase (`api.coinbase.com/v2`) — spot quotes for
   the top tickers.
4. **Last resort:** local cached snapshots (`data/top.json`,
   `data/global.json`) refreshed hourly by
   `.github/workflows/data.yml`.

Note: `assets.coingecko.com` URLs still appear in
`js/api/prices.js`, but only as image hosts for token logos. Market
data no longer flows through the CoinGecko API.

## RPC & Node Infrastructure
- **Solana:** Helius RPC. API keys are **never** exposed to the
  client. The browser sends a placeholder to the Cloudflare Worker
  (`weaver-proxy`), which injects `HELIUS_KEY` server-side before
  forwarding to Helius.
- **Ethereum / BSC:** public RPCs (`ethereum.publicnode.com`,
  `bsc-dataseed.binance.org`) and block-explorer APIs
  (`api.bscscan.com`), routed through the Worker proxy to bypass
  browser CORS restrictions.

## Cloudflare Worker Security (`cf-worker/index.js`)
- **Strict Allowlisting** — the `/proxy` endpoint validates every
  outbound request against a hardcoded `ALLOWED_PROXY_HOSTS` Set.
  Arbitrary SSRF is blocked.
- **Query Construction** — Bitquery GraphQL queries are constructed
  server-side; the client cannot inject arbitrary GraphQL.
- **Secret Management** — API keys (Helius, etc.) live exclusively
  in Wrangler secrets. Never in Git, never in the browser.

## Testing & CI
Four application suites run under `npm test` (and individually):

| Suite       | Command                     | Count | Notes                                 |
|-------------|-----------------------------|-------|---------------------------------------|
| Unit        | `npm run test:unit`         | ~538  | Mocha + Chai, JSDOM setup             |
| Integration | `npm run test:integration`  | 16    | Cross-module pipelines                |
| Security    | `npm run test:security`     | 16    | CSP, SSRF, privacy, CSV injection     |
| E2E         | `npm run test:e2e`          | 11    | Playwright, Chromium only             |

CI (`.github/workflows/test-and-build.yml`) runs all four suites plus
Worker tests, and verifies that no inline styles or inline event
handlers remain in `index.html`.

### E2E Configuration
- **Config:** `playwright.config.js`
- **`testDir`:** `./test/e2e` — four spec files:
  `app.spec.js`, `schemas-freshness.spec.js`, `track-record.spec.js`,
  `weaver.spec.js`.
- **Retries on CI:** 2. Local: 0.
- **Workers on CI:** 1. Local: default.
- **Web server:** `npx http-server -p 8080 -c-1`.
- **Artifacts on failure:** `playwright-report/` (HTML report) and
  `test-results/` (screenshots, videos, traces). Both are ignored by
  `.gitignore`.

### Known Gaps
- No dedicated unit tests for portfolio math (weighted-average cost
  basis, realized / unrealized P&L).
- E2E suite is smoke and acceptance — no browser coverage for
  wallet-sync failure paths, degraded-provider behavior, or the full
  end-to-end intelligence → evidence → verdict → drawer flow.
