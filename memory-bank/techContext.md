# Technical Context

## Core Architecture
Weaver is an evidence-first, non-custodial crypto intelligence and decision engine. It strictly separates Signals, Evidence, Personal Context, Assessment, Decision Priority, and Presentation.

## Market Data Provider Chain (Live & CI)
Due to rate-limiting and Cloudflare egress blocking of legacy providers, the architecture has been migrated to a resilient, keyless fallback chain:
1. **Primary**: CoinLore (`api.coinlore.net`) - Free, reliable, no API key required.
2. **Secondary**: CoinPaprika (`api.coinpaprika.com`) - Robust free tier, matches CoinGecko lowercase ID schema.
3. **Fallback**: Local cached snapshots (`data/top.json`, `data/global.json`) updated hourly via GitHub Actions (`.github/workflows/data.yml`).

## RPC & Node Infrastructure
- **Solana**: Uses Helius RPC. API keys are **never** exposed to the client. The browser sends a request with a placeholder key to the Cloudflare Worker (`weaver-proxy`), which injects the `HELIUS_KEY` server-side before forwarding to Helius.
- **Ethereum/BSC**: Public RPCs (`ethereum.publicnode.com`, `bsc-dataseed.binance.org`) and block explorer APIs (`api.bscscan.com`), routed through the Worker proxy to bypass browser CORS restrictions.

## Cloudflare Worker Security (`cf-worker/index.js`)
- **Strict Allowlisting**: The `/proxy` endpoint validates all outbound requests against a hardcoded `ALLOWED_PROXY_HOSTS` Set. Arbitrary SSRF is blocked.
- **Query Construction**: Bitquery GraphQL queries are constructed server-side; the client cannot inject arbitrary GraphQL.
- **Secret Management**: API keys (Helius, etc.) are managed exclusively via Wrangler secrets, never committed to Git or sent to the browser.

## Testing & CI
- Unit, Integration, and Security tests are defined in `package.json` (`npm run test:unit`, `test:integration`, `test:security`).
- Evidence Drawer regressions have been resolved; the module is fully CSP-compliant and passes all unit tests.