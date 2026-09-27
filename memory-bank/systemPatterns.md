Below are the two **ready-to-copy Markdown files** exactly as requested.


# Weaver System Patterns — Architectural Rules

## Evidence Pipeline

### Canonical Flow
```text
Signal → Evidence → PersonalContext → Assessment → DecisionPriority → Presentation
```

### Module Ownership
- **Signal Generation:** `js/intelligence/events.js` (price moves, regime shifts, thesis deterioration)
- **Evidence Building:** `js/intelligence/evidence-builder.js` (computes confidence from components)
- **Context:** `js/intelligence/context.js` (portfolio weight, watchlist, behavioral risk)
- **Assessment:** `js/intelligence/decision-engine.js` (relevance, impact, urgency, confidence)
- **Presentation:** `js/intelligence/ranker.js` (renders `DecisionPriority[]` sorted by score)

### Confidence Authority
**Single Canonical Authority:** `W.intelligence.computeConfidence()`

**Formula:**
```text
confidence = sourceReliability × dataFreshness × corroborationFactor
```

**Rules:**
- Never fabricate confidence from missing components.
- If any factor is null/unknown → `confidence = null` (not a reduced number).
- No magic numbers (e.g., 0.95, 0.8) — all values must be derived from evidence.
- Source reliability is predefined per data source (e.g., CoinGecko = 0.9, RSS = 0.4).
- Data freshness decays with age (e.g., 1.0 if <1min, 0.5 if >1hr).

## Shield Risk Authority

### Scoring System
- **EVM Version:** `shield-evm-v1`
- **Solana Version:** `shield-solana-v1`
- **Max Score:** 100 (clamped, never exceeded)
- **Risk Threshold:** 40 (authoritative, defined in `shield.js`)

### Risk Factors (EVM)
- Honeypot: +50
- Mintable: +20
- Proxy: +15
- LP Unlocked: +15 (only if LP data exists; `null` = unknown, not unlocked)
- Buy Tax >5%: +10
- Sell Tax >5%: +10
- Owner Not Renounced: +5

### Risk Factors (Solana)
- Freeze Authority: +30
- Balance Mutable: +25
- Mintable: +20
- Closable: +15
- Metadata Mutable: +10
- Transfer Fee >5%: +15, else +5

### High-Risk Predicate
**Authoritative Function:** `W.shield.isHighRisk(assessment)`
- Returns `true` only when `riskScore >= RISK_THRESHOLD`.
- Never duplicate threshold comparison elsewhere.
- Missing/errored/noData/unsupported assessments are **NEVER** high-risk.

## Evidence Provenance

### Required Fields
Every evidence record must preserve:
- `source`: Data origin (e.g., "coingecko", "goplus-evm")
- `observedAt`: Timestamp of observation
- `methodologyVersion`: Scoring algorithm version
- `relationship`: "supporting" | "contradicting" | "neutral" | "unknown"
- `freshness`: Data age score (0-1)
- `reliability`: Source trust score (0-1)

### Immutability Rules
- Historical records cannot be recalculated with newer models.
- Score versions must be distinguishable.
- Past results preserved as originally generated.
- Corrections must be auditable (original + correction both visible).

## Observation Layer

### Deployer Graph
- **Module:** `js/intelligence/deployer-graph.js`
- **Key Format:** `{chain}:{deployerAddress.toLowerCase()}`
- **TTL:** Entries expire after configured window.
- **Eviction:** LRU when cache exceeds `MAX_PROFILES`.
- **Summarize:** Returns human-readable description; never uses "serial rugger", "safe", or "trusted".

### Owner Associations
- **Module:** `js/intelligence/owner-associations.js`
- **Scope:** Per-chain (same address on two chains = two associations).
- **Accumulation:** Distinct tokens under same owner tracked.
- **Deduplication:** Same token re-observed updates timestamp, does not inflate count.

### Market Structure
- **Module:** `js/intelligence/market-structure.js`
- **Observations:** Time-series storage with retention window.
- **Trajectory:** Computes deltas when observations span matching interval.
- **Direction:** "rising" | "falling" | "stable" | "unknown".

## Track Record Immutability

### Core Rules
1. **Immutable Snapshot:** `weaverSnapshot` cannot be mutated after creation.
2. **Immutable Timestamps:** `createdAt` cannot be changed.
3. **Whitelisted Updates:** Only specific fields can be updated with revision reason.
4. **No Implicit Linkage:** Track Record does not auto-link to portfolio.

### Migration Rules
- Canonical and legacy records with matching signature AND content → deduplicated.
- Signature matches but content differs → conflict record created.
- Malformed records → quarantined with deterministic ID.
- Unknown schema versions → quarantined, not silently interpreted.

### Conflict Resolution
- Conflict IDs are deterministic across re-runs.
- `migratedAt` does not change on re-run.
- `createdAt` and `weaverSnapshot` preserved during migration.

## Storage Boundaries

### Local Storage Keys
- `portfolio_holdings`: Manual portfolio entries.
- `portfolio_transactions`: Buy/sell transaction log.
- `wallet_sync_data`: Encrypted wallet list (AES-256-GCM).
- `wallet_sync_cache`: Sanitized sync results (5-min TTL, masked addresses only).
- `wallet_cost_basis`: Manual cost basis for wallet holdings.
- `last_known_prices`: Shared price cache between Dashboard and WalletSync.
- `encrypted_settings`: AI/Telegram credentials (encrypted with user passphrase).
- `track_records`: Immutable decision history.

### Encryption Model
- **Vault:** AES-256-GCM with PBKDF2 key derivation (600,000 iterations).
- **Sync Code:** 128-bit entropy, stored plaintext as locator (not cryptographic key).
- **Password:** Never leaves device, derives encryption key.
- **Settings:** Encrypted with user-provided passphrase via `W.secureSession`.

### Cache Strategy
- **Market Data:** 1-minute TTL (CoinGecko), 5-minute TTL (global/fear-greed).
- **Sync Results:** 5-minute TTL.
- **Price Cache:** Shared across modules, updated on successful fetch.
- **Stale-While-Error:** During upstream failures, serve cache ≤10 minutes old.

## Module Contract

### Standard Pattern
```javascript
window.W = window.W || {};
W.<feature> = (() => {
  // Private functions and constants
  
  async function render(view) {
    // DOM manipulation
  }
  
  return { render, /* other public methods */ };
})();
```

### CSP Compliance
- **Zero inline styles** (`style="..."` attributes prohibited).
- All dynamic styling via CSS classes and CSS variables.
- Event handlers attached via `addEventListener` or property assignment after DOM insertion.
- No `eval()`, no `new Function()`.

### Error Handling
- External API failures never crash UI.
- Fetch wrappers handle own failures.
- Useful UI states for: unavailable, rate-limited, stale, error.
- No unhandled promise rejections.
- No silent failures.
```

### `memory-bank/techContext.md`

```markdown
# Weaver Technical Context

## Development Environment

### Node Version
- **Expected:** 18.x or 20.x LTS (verify with `.nvmrc` if present)
- **Command:** `node --version`

### Package Manager
- **Primary:** npm (verify with `package-lock.json` presence)
- **Alternative:** yarn (if `yarn.lock` present)

### Key Dependencies
- **Chart.js:** ^4.4.1 (portfolio performance charts)
- **Mocha:** Unit testing framework
- **Chai:** Assertion library
- **esbuild:** Bundle minification
- **Playwright:** E2E testing (if configured)

## Build System

### Architecture
- **No Required Build Step:** Must run via `open index.html`
- **Optional Optimization:** `dist/bundle.js` and `dist/bundle.min.js`
- **Concatenation:** `concat.js` merges modules in dependency order
- **Minification:** esbuild with `--minify` flag

### Build Commands
```bash
npm run build              # Concatenate modules into dist/bundle.js
npm run minify             # Minify to dist/bundle.min.js
npm run test:unit          # Run unit tests
npm run test:integration   # Run integration tests
npm run test:security      # Run security tests
npm run test:e2e           # Run E2E tests (requires app served)
npm test                   # Run all test suites
```

### Bundle Structure
- **Unminified:** ~820 KB, ~73 files
- **Minified:** ~427 KB
- **Version Query Param:** `bundle.min.js?v=YYYYMMDD` (cache busting)

## Application Structure

### Directory Layout
```text
weaver/
├── index.html              # Entry point, CSP meta tag
├── style.css               # Command Center design system
├── package.json            # Dependencies and scripts
├── concat.js               # Build script (module concatenation order)
├── dist/
│   ├── bundle.js           # Unminified bundle
│   └── bundle.min.js       # Production bundle
├── js/
│   ├── core/               # Foundational modules (prices, schemas, request guard)
│   ├── features/           # User-facing features (dashboard, portfolio, shield, etc.)
│   ├── intelligence/       # Decision engine, evidence, regime, thesis health
│   └── ui/                 # UI components (modal, toast, skeleton, evidence drawer)
├── test/
│   ├── unit/               # Module-level tests
│   ├── integration/        # Cross-module pipelines
│   ├── security/           # CSP, SSRF, privacy tests
│   └── e2e/                # Playwright browser tests
├── cf-worker/              # Cloudflare Worker proxy
│   └── index.js            # Edge cache, CORS, rate limiting
└── memory-bank/            # Project documentation
```

### Module Loading Order
Modules load in dependency order via `concat.js`:
1. Storage, crypto, session
2. Utilities (format, logger, debounce)
3. UI primitives (modal, toast, skeleton)
4. Data layer (schemas, request guard, prices)
5. Intelligence (evidence, regime, decision engine)
6. Features (dashboard, portfolio, shield, gems, etc.)
7. App initialization

## Test Framework

### Unit Tests
- **Framework:** Mocha with BDD interface
- **Assertions:** Chai `expect`
- **Setup:** `test/setup.js` initializes JSDOM and W namespace
- **Location:** `test/unit/**/*.test.js`
- **Run:** `npm run test:unit`

### Test Categories
1. **Unit:** Module-level functionality (489 tests as of last run)
2. **Integration:** Cross-module pipelines (16 tests)
3. **Security:** CSP, SSRF, privacy (16 tests)
4. **E2E:** Browser automation with Playwright (8 tests)

### Test Requirements
- Zero unit tests for portfolio math (v2.0 P2 Task 1 — **PENDING**)
- Zero E2E tests for critical paths (v2.0 P2 Task 2 — **PENDING**)
- Current coverage: smoke tests only

## Deployment

### Static Hosting
- **Primary:** GitHub Pages (`https://ibis01.github.io/weaver/`)
- **Local Development:** Live Server (`http://127.0.0.1:5500`)
- **CSP Origins:** GitHub Pages, localhost:3000, localhost:5500, 127.0.0.1:5500

### Cloudflare Worker Proxy
- **URL:** `https://weaver-proxy.ibis01-weaver.workers.dev`
- **Purpose:** CORS proxy for CoinGecko, GoPlus, Bitquery
- **Features:**
  - Edge cache (60s fresh, 600s stale-while-error)
  - Host allowlist (SSRF protection)
  - GoPlus 4029 retry with exponential backoff
  - Optional API key injection (`GOPLUS_KEY`, `COINGECKO_KEY`, `BITQUERY_KEY`)
- **Deploy:** `cd cf-worker && npx wrangler deploy`
- **Secrets:** `npx wrangler secret put <KEY_NAME>`

### Browser Requirements
- Modern browsers with ES6+ support
- Chart.js for data visualization
- LocalStorage for data persistence
- Fetch API for network requests
- Crypto API for encryption (optional, graceful degradation)

## Content Security Policy

### Current State
- **Location:** `index.html` `<meta>` tag
- **style-src:** `'self' https://fonts.googleapis.com` (no `'unsafe-inline'`)
- **script-src:** `'self' https://cdn.jsdelivr.net`
- **connect-src:** Multiple API domains (CoinGecko, Binance, GoPlus, etc.

### CSP Compliance Rules
- No inline `style="..."` attributes
- No inline `<script>` tags
- Event handlers attached after DOM insertion
- Dynamic CSS via `<style>` tags only with nonce/hash (not currently used)

## Important Development Commands

### Daily Development
```bash
# Start local server
npx live-server --port=5500

# Run tests
npm run test:unit
npm test

# Build for production
npm run build && npm run minify

# Deploy Worker
cd cf-worker && npx wrangler deploy
```

### Debugging
```bash
# Check bundle contents
grep -c "functionName" dist/bundle.min.js

# Verify module exports
node -e "require('./dist/bundle.js'); console.log(typeof W.dashboard)"

# Watch Worker logs
cd cf-worker && npx wrangler tail
```

### Git Workflow
```bash
# Standard commit
git add <files>
git commit -m "type(scope): description"
git push origin main

# Types: feat, fix, docs, style, refactor, test, chore
# Scopes: dashboard, shield, portfolio, wallet-sync, intelligence, etc.
```

## Environment Variables

### Local Development
- None required (zero-key path must work)

### Production (Optional Enhancements)
- `GOPLUS_KEY`: GoPlus API authentication (higher rate limits)
- `COINGECKO_KEY`: CoinGecko Demo API key (bypass anonymous 429s)
- `COINGECKO_PRO_KEY`: CoinGecko Pro API key (paid tier)
- `BITQUERY_KEY`: Bitquery GraphQL API key (deployer graph)

### Worker Secrets
Set via: `npx wrangler secret put <KEY_NAME>`
**Never commit secrets to repository.**
```

**Important:** I preserved your supplied content, but there is one Markdown typo in `techContext.md`: the `connect-src` bullet is missing its closing `)`.

### Next Actions
- [ ] Create `memory-bank/systemPatterns.md`
- [ ] Create `memory-bank/techContext.md`
- [ ] Fix the `connect-src` typo above
- [ ] Verify against the actual current Weaver repo before treating these values as authoritative
- [ ] Commit as `docs(memory-bank): add architectural and technical context`