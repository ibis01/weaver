# Weaver Proxy — Deployment

Replaces the public CORS-relay fallback chain (`allorigins.win`,
`corsproxy.io`, `codetabs.com`) in `shield.js` with a small Worker you
control. Free tier (100k requests/day) is enough for this.

## 1. One-time setup

```bash
npm install -g wrangler
wrangler login          # opens a browser to authorize your Cloudflare account
```

If you don't have a Cloudflare account yet, signing up is free and takes
a minute — no credit card required for the Workers free tier.

## 2. Edit the allowlist before deploying

Open `index.js` and update `ALLOWED_ORIGINS` with the actual origin(s)
your Weaver frontend is served from — e.g. your GitHub Pages URL. This
is what stops a stranger from finding your `workers.dev` URL and
quietly using it as a free open proxy against your quota.

```js
const ALLOWED_ORIGINS = [
  "https://ibis01.github.io",   // <- replace/add your real origin(s)
];
```

## 3. Deploy

```bash
cd cf-worker
wrangler deploy
```

Wrangler will print your live URL, something like:

```
https://weaver-proxy.<your-subdomain>.workers.dev
```

## 4. Point Weaver at it

In `js/features/shield.js`, set:

```js
const WORKER_PROXY_BASE = "https://weaver-proxy.<your-subdomain>.workers.dev";
```

Rebuild (`npm run build && npm run minify`) and redeploy your site.
Leaving `WORKER_PROXY_BASE` blank is safe — Shield falls back to the
old public-proxy chain automatically until you fill this in, so nothing
breaks mid-migration.

## 5. Sanity-check it

```bash
curl "https://weaver-proxy.<your-subdomain>.workers.dev/goplus/evm/1?contract_addresses=0xdac17f958d2ee523a2206206994597c13d831ec7" \
  -H "Origin: https://ibis01.github.io"
```

You should get back GoPlus's JSON response for USDT on Ethereum. A
request without a matching `Origin` header should get `403`.

## Notes

- This worker only forwards to GoPlus's EVM and Solana endpoints on a
  fixed allowlist of chain IDs — it is not a general-purpose CORS
  proxy, by design (an open `?url=` passthrough is exactly the kind of
  thing that makes public proxies risky to depend on).
- No secrets, no API keys, nothing to leak — GoPlus's basic tier is
  free and keyless, same as before.
- If you later add more upstreams (e.g. RugCheck for the "Meme Gems"
  work), extend this worker's route table rather than opening it up
  to arbitrary URLs.