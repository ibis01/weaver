
---

### `memory-bank/techContext.md`

```markdown
# Technical Context

> Last synced: 2026-10-01.

## Core Architecture
Weaver is an evidence-first, non-custodial crypto intelligence and
decision engine. It strictly separates Signals, Evidence, Personal
Context, Assessment, Decision Priority, and Presentation.

## Market Data Provider Chain (Live & CI)
Due to rate-limiting and Cloudflare egress blocking of legacy
providers, the architecture uses a resilient, keyless fallback chain:
1. **Primary**: CoinLore (`api.coinlore.net`) — free, reliable,
   no API key required.
2. **Secondary**: CoinPaprika (`api.coinpaprika.com`) — robust free
   tier, matches the lowercase ID schema used by the app.
3. **Fallback**: Coinbase (`api.coinbase.com/v2`) — spot quotes for
   the top tickers.
4. **Last resort**: local cached snapshots (`data/top.json`,
   `data/global.json`) refreshed hourly by
   `.github/workflows/data.yml`.

Binance is the OHLCV / chart source, browser-direct (the Worker 403s
Cloudflare egress IPs).

Note: `assets.coingecko.com` URLs still appear in `js/api/prices.js`,
but only as image hosts for token logos. Market data no longer flows
through the CoinGecko API.

## RPC & Node Infrastructure
- **Solana**: Uses Helius RPC. API keys are **never** exposed to the
  client. The browser sends a request with a placeholder key to the
  Cloudflare Worker (`weaver-proxy`), which injects `HELIUS_KEY`
  server-side before forwarding to Helius.
- **Ethereum / BSC**: Public RPCs (`ethereum.publicnode.com`,
  `bsc-dataseed.binance.org`) and block-explorer APIs
  (`api.bscscan.com`), routed through the Worker proxy to bypass
  browser CORS restrictions.

## Cloudflare Worker Security (`cf-worker/index.js`)
- **Strict Allowlisting**: The `/proxy` endpoint validates all
  outbound requests against a hardcoded `ALLOWED_PROXY_HOSTS` Set.
  Arbitrary SSRF is blocked.
- **Query Construction**: Bitquery GraphQL queries are constructed
  server-side; the client cannot inject arbitrary GraphQL.
- **Secret Management**: API keys (Helius, etc.) are managed
  exclusively via Wrangler secrets, never committed to Git or sent
  to the browser.

## Testing & CI
- Unit, Integration, and Security tests are defined in `package.json`
  (`npm run test:unit`, `test:integration`, `test:security`).
- Evidence Drawer regressions have been resolved; the module is fully
  CSP-compliant.
- CI (`.github/workflows/test-and-build.yml`) runs build, unit,
  integration, security, Worker tests, and Playwright E2E; it also
  verifies no inline styles or inline event handlers remain in
  `index.html`.

| Suite       | Command                     | Count | Notes                                 |
|-------------|-----------------------------|-------|---------------------------------------|
| Unit        | `npm run test:unit`         | 564   | Mocha + Chai, JSDOM setup             |
| Integration | `npm run test:integration`  | 29    | Cross-module pipelines                |
| Security    | `npm run test:security`     | 16    | CSP, SSRF, privacy, CSV injection     |
| E2E         | `npm run test:e2e`          | 35    | Playwright, Chromium only             |

### E2E Configuration
- **Config:** `playwright.config.js`
- **`testDir`:** `./test/e2e` — six spec files:
  `app.spec.js`, `weaver.spec.js`, `schemas-freshness.spec.js`,
  `track-record.spec.js`, `dashboard-acceptance.spec.js`,
  `critical-path.spec.js`.
- **Retries on CI:** 2. Local: 0.
- **Workers on CI:** 1. Local: default.
- **Web server:** `npx http-server -p 8080 -c-1`.
- **Artifacts on failure:** `playwright-report/` (HTML report) and
  `test-results/` (screenshots, videos, traces). Both are ignored by
  `.gitignore`.

### Known Gaps
- No browser coverage for wallet-sync failure paths.
- Real-device mobile pass (DevTools emulation is not exact).