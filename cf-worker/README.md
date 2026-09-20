# Weaver Proxy — Deployment

Replaces the public CORS-relay fallback chain (`allorigins.win`,
`corsproxy.io`, `codetabs.com`) in `shield.js` with a small Worker you
control. Free tier (100,000 requests/day) is enough for this.

The Worker also exposes a `POST /bitquery/deployer` route used by the
Deployer Graph feature to look up which contracts a wallet has created.

## 1. One-time setup

```bash
npm install -g wrangler
wrangler login          # opens a browser to authorize your Cloudflare account
```

If you don't have a Cloudflare account yet, signing up is free and takes
a minute — no credit card required for the Workers free tier.

## 2. Edit the allowlist before deploying

Open `index.js` and update `ALLOWED_ORIGINS` with the actual origin(s)
your Weaver frontend is served from — e.g. your GitHub Pages URL.

```js
const ALLOWED_ORIGINS = [
  "https://ibis01.github.io",   // <- replace/add your real origin(s)
];
```

**This is a CORS check, not authentication.** It prevents a browser
on an unauthorized origin from reading the response. It does not
prevent a scripted caller from sending a spoofed `Origin` header.
Concrete abuse protection should be applied at the deployment level
(see "Rate limiting" below).

## 3. Set the Bitquery secret (required)

The `/bitquery/deployer` route forwards to Bitquery with an API key
attached. The key lives in the Worker environment, never in the source
tree and never in the client bundle.

```bash
cd cf-worker
npx wrangler secret put BITQUERY_KEY
```

Wrangler prompts for the value. Paste the key from
<https://account.bitquery.io/>.

`wrangler.toml` declares this as a required secret, so `wrangler
deploy` will fail early if it has not been set.

Without the secret, the GoPlus routes still work; only the
`/bitquery/deployer` route returns `503 Bitquery not configured`.

## 4. Deploy

```bash
cd cf-worker
wrangler deploy
```

Wrangler prints the live URL, something like:

```
https://weaver-proxy.<your-subdomain>.workers.dev
```

## 5. Point Weaver at it

In `js/features/shield.js`, set:

```js
const WORKER_PROXY_BASE = "https://weaver-proxy.<your-subdomain>.workers.dev";
```

Rebuild (`npm run build && npm run minify`) and redeploy your site.
Leaving `WORKER_PROXY_BASE` blank is safe — Shield falls back to the
old public-proxy chain automatically until you fill this in.

## 6. Sanity-check it

GoPlus route:

```bash
curl "https://weaver-proxy.<your-subdomain>.workers.dev/goplus/evm/1?contract_addresses=0xdac17f958d2ee523a2206206994597c13d831ec7" \
  -H "Origin: https://ibis01.github.io"
```

You should get back GoPlus's JSON response for USDT on Ethereum. A
request without a matching `Origin` header should get `403`.

Bitquery route (requires a `BITQUERY_KEY` that grants the query access):

```bash
curl -X POST "https://weaver-proxy.<your-subdomain>.workers.dev/bitquery/deployer" \
  -H "Origin: https://ibis01.github.io" \
  -H "Content-Type: application/json" \
  -d '{"chain":"ethereum","deployerAddress":"0xdac17f958d2ee523a2206206994597c13d831ec7"}'
```

A successful response is Bitquery's raw GraphQL JSON with a `data`
key. A `502` with an `error` field indicates an upstream failure; a
`400` with an `error` field indicates request validation failure.

## Rate limiting

This Worker has **no application-level rate limiting**. The
`ALLOWED_ORIGINS` check is CORS, not abuse prevention — a scripted
caller can send a spoofed `Origin` header.

For deployment hardening, configure a Cloudflare Rate Limiting Rule
scoped to the path:

```
Path:  /bitquery/deployer
Count by: IP
Rate:  10 requests per minute per IP
Action: Block
```

Configure it in the Cloudflare dashboard under Security → WAF → Rate
limiting rules. It requires no code change and no client-side change.

## Notes

- This Worker forwards only to the GoPlus EVM endpoint, the GoPlus
  Solana endpoint, and the fixed Bitquery GraphQL endpoint — it is
  not a general-purpose CORS proxy, by design.
- The Bitquery route accepts `{ chain, deployerAddress }` from the
  client and constructs the GraphQL query server-side. The client
  never supplies a GraphQL query, and the Worker never reflects a
  client-supplied query into the upstream request.
- Only these chains are supported by the deployer route: ethereum,
  bsc, base, arbitrum, polygon, optimism. Chains absent
  from `CHAIN_TO_BITQUERY_NETWORK` are rejected before any upstream
  call.
- If you later add more upstreams (e.g. RugCheck for the "Meme Gems"
  work), extend this Worker's route table rather than opening it up
  to arbitrary URLs.