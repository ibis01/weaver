# Weaver

**Weaver is an evidence-first crypto intelligence tool.** It scans new tokens,
audits contract security, evaluates evidence quality, tracks outcomes over
time, and explains every conclusion it draws.

It is not a trading bot. It does not execute trades. It does not issue BUY
or SELL directives. Every output is a statement of what the data supports —
not a prediction.

---

## What Weaver is

- **A scanner.** Crawls DEX Screener for newly boosted and newly profiled
  tokens across chains with Token Shield coverage.
- **A security auditor.** Runs contract security checks via GoPlus and
  surfaces honeypot indicators, mint/freeze authorities, holder
  concentration, liquidity lock status, and tax exposure.
- **An evidence engine.** Every conclusion carries its source, timestamp,
  methodology version, and a relationship label
  (`supporting` / `contradicting` / `neutral` / `unknown`).
- **A historical record.** Every analysis can be captured as an immutable
  snapshot. Outcomes are recorded separately from decisions. The Track
  Record module migrates legacy data deterministically and quarantines
  malformed records rather than silently interpreting them.

## What Weaver is not

- **Not financial advice.** Every UI surface that renders a signal also
  renders the caveat that the signal is not a directive.
- **Not autonomous.** There is no trading path. The decision engine produces
  a `recommendedAction` of `MONITOR`, `REVIEW_THESIS`, `REVIEW_RISK`, or
  `LOG_DECISION` — never `BUY`, `SELL`, or `REBALANCE`.
- **Not a source of truth.** When a data provider is unavailable, Weaver
  reports the gap. Missing data is `null`, never `0`, and never fabricated.
  The invariant enforced throughout the intelligence layer is:

  > unknown ≠ zero  
  > unknown ≠ safe  
  > missing ≠ fabricated

---

## Architecture

Weaver is a client-side application. The bundle is built from modular
sources under `js/` and loaded via `dist/bundle.min.js` by `index.html`.
There is a lightweight proxy backend for CORS-restricted API calls and a
Cloudflare Worker for the GoPlus Solana endpoint.

```
External APIs (CoinGecko, Binance, DEX Screener, GoPlus, …)
              │
              ▼
       Proxy layer (proxy-server.js, cf-worker/)
              │
              ▼
   ┌──────────────────────┐
   │  Signal collection    │   js/intelligence/events.js
   └──────────┬───────────┘
              ▼
   ┌──────────────────────┐
   │  Evidence build       │   js/intelligence/evidence.js
   │  (source, freshness,  │   js/intelligence/evidence-builder.js
   │   reliability)        │
   └──────────┬───────────┘
              ▼
   ┌──────────────────────┐
   │  Canonical confidence │   js/intelligence/types.js
   │  computeConfidence()  │   (single authority)
   └──────────┬───────────┘
              ▼
   ┌──────────────────────┐
   │  Decision engine      │   js/intelligence/decision-engine.js
   │  (relevance, impact,  │
   │   urgency, eligibility)│
   └──────────┬───────────┘
              ▼
   ┌──────────────────────┐
   │  Unified verdict      │   js/intelligence/unified-verdict.js
   └──────────┬───────────┘
              ▼
   ┌──────────────────────┐
   │  Evidence drawer      │   js/ui/evidence-drawer.js
   │  Track record         │   js/features/track-record.js
   └──────────────────────┘
```

### Canonical confidence

`W.intelligence.computeConfidence()` is the **single authority** for the
numeric confidence attached to any evidence record. Every factor
(`sourceReliability`, `dataFreshness`, `dataCompleteness`,
`interpretationConfidence`) is required. If any factor is missing or
non-finite, the function returns `null`. `null` means "we do not have
enough information to make a numeric claim" — callers must surface that
distinction honestly rather than coercing to a number.

The evidence builder delegates to this function; it does not re-derive the
formula. The invariant is structural: a second confidence formula anywhere
in the codebase is a bug.

### Security boundary

`W.shield.isHighRisk()` is the **single authority** for the high-risk
decision. The numeric threshold (`RISK_THRESHOLD = 40`) lives in
`js/features/shield.js` and nowhere else. Consumer modules (Gem Agent,
Token Analysis) delegate rather than duplicating the comparison.

Security assessments carry:

- `riskScore`, `risks`, `riskLevel`, `scoreVersion`
- `flags` (EVM: booleans; Solana: `{ active, authority }` objects)
- `holders` (concentration data; `source: "unavailable"` on chains where
  the provider does not return it)

The Gem-local Shield cache has a five-minute TTL matching `shield.js`'s
own `W.store` TTL. Cache entries carry an `observedAt` timestamp; expired
entries are deleted on read. The TTL applies uniformly to successful,
error, unsupported, and noData results.

### Evidence provenance

Every evidence record carries six fields: `source`, `observedAt`,
`freshness`, `methodologyVersion`, `relationship`, `reliability`. Missing
values render as the literal string `"unknown"` in the Evidence Drawer —
never omitted, never silently defaulted. A domain with `status: "verified"`
does **not** imply `relationship: "supporting"`; status describes whether
the data was obtained, relationship describes whether it supports the
thesis. The drawer places a domain under Unknowns unless the relationship
is declared explicitly.

### Track Record

Immutable historical snapshots. User decisions and outcomes are stored
separately from the analysis itself and are revisioned with an explicit
reason. Migration from legacy storage formats:

- Deterministic IDs from content hashes
- Snapshot identity via narrow signature (score, confidence,
  scoringVersion, analysisTimestamp)
- Snapshot content via normalized projection (`asset`, `score`,
  `confidence`, `scoringVersion`, `analysisTimestamp`,
  `scenarioClassification`, `supportingEvidenceCount`,
  `contradictingEvidenceCount`)
- Deduplication requires **both** the narrow signature and the projected
  content hash to match
- Same identity + different content → preserved as a conflict, not
  overwritten
- Malformed records → quarantined with a deterministic ID

---

## Repository layout

```
.
├── js/
│   ├── ai/                  AI provider registry
│   ├── api/                 API schemas, request guard, prices, snapshots
│   ├── data/                News and market data adapters
│   ├── features/            User-facing modules (one file per feature)
│   ├── intelligence/        Signal → evidence → decision pipeline
│   ├── lib/crypto/          Encryption for secure settings
│   ├── models/              Canonical data models (AssetId, etc.)
│   ├── storage/             Encrypted settings, session storage
│   ├── ui/                  Theme, dashboard, drawer, particles
│   └── utils/               Format, finance, logger, perf, debounce
├── test/
│   ├── unit/                Isolated module tests (Mocha + Chai + JSDOM)
│   ├── integration/         Multi-module pipeline tests
│   ├── security/            CORS, SSRF, rate-limit tests
│   ├── e2e/                 Playwright browser tests
│   └── setup.js             JSDOM + mock namespace for unit/integration
├── dist/                    Generated bundles (committed for Pages)
├── data/                    Snapshot JSON refreshed by CI cron
├── cf-worker/               Cloudflare Worker proxy for GoPlus
├── deploy/                  Nginx config and deployment notes
├── docs/                    Design documents and audits
├── performance/             k6 benchmark scripts
├── assets/                  Icons and static assets
├── concat.js                Build script (produces dist/bundle*.js)
├── proxy-server.js          Local/backend proxy for CORS-restricted APIs
├── index.html               Loads dist/bundle.min.js
├── style.css                Application stylesheet
├── sw.js                    Service worker
├── WEAVER_CONSTITUTION.md   Design principles referenced by source comments
└── package.json
```

---

## Testing

The suite is split into four layers, all of which run in CI on every push
to `main`:

```bash
npm run test:unit          # Isolated module tests (Mocha + JSDOM)
npm run test:integration   # Cross-module pipeline tests
npm run test:security      # CORS, SSRF, rate-limit boundaries
npm run test:e2e           # Playwright browser specs
npm test                   # All four in sequence
```

Individual suites can be run in isolation:

```bash
npx mocha --require test/setup.js --ui bdd test/unit/market-structure.test.js
npx playwright test test/e2e/track-record.spec.js
```

### Test discipline

- Tests that depend on a shared namespace (`W.evidence`,
  `W.marketStructure`, `W.intelligence`) **load the module themselves**
  inside a `before()` hook. Relying on another test file to have loaded
  it makes the suite order-dependent.
- When a test asserts a new contract that contradicts an old one, the
  test is updated to match the contract — not the contract updated to
  match the test.
- Tests are never adjusted to hit a specific pass count.

### Current counts

As of the latest commit, `npm run test:unit` reports approximately 243
passing tests. The number is not a target; it reflects the actual suite.

---

## Development

Requires Node 22 (see `.nvmrc`).

```bash
npm ci                     # Install dependencies
npm run build              # Regenerate dist/bundle.js and dist/bundle.min.js
npm run minify             # Minify dist/bundle.js in place
```

The build script (`concat.js`) concatenates the modules listed in `files`
in a specific order. Load-order matters for some modules — see the
comments at the top of `evidence.js` and `evidence-builder.js`. Both
bundles are generated from the same source string, so they are guaranteed
to be in sync.

**Do not hand-edit `dist/*`.** The bundles are committed so that GitHub
Pages can serve them directly. Any source change must be followed by
`npm run build` and a commit of the regenerated bundles.

---

## Continuous integration

Three workflows run on `main`:

| Workflow | Trigger | What it does |
| :--- | :--- | :--- |
| `ci.yml` | Push, PR | Unit → integration → security → E2E → build |
| `data.yml` | Cron every 30 min | Fetches CoinGecko, CryptoCompare, and alternative.me snapshots into `data/`, validates the JSON schema, and commits if changed |
| `performance.yml` | Manual, weekly | Runs the k6 benchmark against a deployed proxy URL |

The `data.yml` job validates every response before committing: type
checks on the top-level shape, minimum-length checks on arrays, and a
required-field check on each entry. Invalid responses are not committed.

---

## Data sources

| Source | What | Where |
| :--- | :--- | :--- |
| CoinGecko | Prices, market caps, global stats | `js/api/prices.js`, `data/top.json`, `data/global.json` |
| Binance | OHLCV klines for technical analysis | Proxy layer |
| DEX Screener | New pairs, boosts, profiles, prices | `js/features/gems.js` |
| GoPlus | Contract security (EVM and Solana) | `js/features/shield.js` |
| alternative.me | Fear & Greed index | `data/fng.json` |
| CryptoCompare | News headlines | `data/news.json` |

All external requests go through the proxy layer where CORS applies. The
`RequestGuard` module (`js/api/request-guard.js`) enforces rate limits and
circuit breakers.

---

## Known limitations

- **Holder distribution is unavailable on Solana.** The GoPlus Solana
  endpoint does not return it in the same shape as the EVM endpoint.
  Market Structure observations on Solana therefore carry
  `source: "unavailable"` and `null` values for all concentration fields.
- **Trajectory is not yet implemented.** Market Structure produces a
  single observation per scan. Change metrics (`change5m`, `change15m`,
  `change1h`) require a persistent observation store, which is a
  separate task.
- **No historical outcome backfill.** Track Record captures outcomes for
  gem-agent calls going forward. Legacy records cannot have their outcomes
  reconstructed.
- **Proxy backend is not in this repository.** The `nginx.conf` in
  `deploy/` forwards to a `proxy:3001` upstream. The proxy itself lives
  outside the checked-in tree. `proxy-server.js` at the root is a
  reference implementation for local development, not the deployed
  service.
- **Track Record migration identity is content-projection based, not
  cryptographic.** Two records are deduplicated only when both their
  narrow signature and their normalized content hash match. The projection
  intentionally excludes storage-layer fields (see `analysisProjection` in
  `js/features/track-record.js` for the field list).

---

## Documentation

- `WEAVER_CONSTITUTION.md` — the design principles referenced throughout
  the source. Includes the "unknown ≠ zero", "unknown ≠ safe", and
  "evidence provenance" rules.
- `docs/` — design documents and historical audits.
- `data-path-audit.md` — a review of how data flows between the storage
  and intelligence layers.