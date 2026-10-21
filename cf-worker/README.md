# Weaver Proxy — Deployment

A Cloudflare Worker that acts as Weaver's controlled relay for:

- **GoPlus token security** — EVM (`/goplus/evm/:chainId`) and Solana (`/goplus/solana`)
- **EVM deployer lookup** — `/etherscan/deployer` via Etherscan V2
- **Solana deployer lookup** — `/helius/deployer` via Helius Parsed Events
- **Meme alert persistence** — `/meme/alert`, `/meme/alerts` backed by KV
- **Provenance bridge** — `/provenance` GET/POST/DELETE
- **Generic signal bridge** — `/signal`, `/signals`
- **Allowlisted market/news relay** — `/proxy?url=...` with per-colo caching and request coalescing

It replaces the public CORS-relay fallback chain (`allorigins.win`,
`corsproxy.io`, `codetabs.com`) previously used in `shield.js`. Free tier
(100,000 requests/day) is enough for Weaver's current load.

The Worker is **not** a general-purpose CORS proxy. `/proxy` only forwards
to hosts in `ALLOWED_PROXY_HOSTS`; every other route is a fixed upstream.

## 1. One-time setup

```bash
npm install -g wrangler
wrangler login          # opens a browser to authorize your Cloudflare account
