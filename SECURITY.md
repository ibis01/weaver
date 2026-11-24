# Security Policy

## Supported Versions

Security fixes are applied to the `main` branch and released from there.
There are no long-term support branches; always run the latest version of
the repository and the latest deployed Worker version.

| Component | Supported |
|---|---|
| `main` branch (app, proxy, cf-worker) | yes |
| Older commits / tags | no |

## Reporting a Vulnerability

Please report vulnerabilities **privately** — do not open public issues
for anything you believe is exploitable.

Primary channel: **GitHub private vulnerability reporting**
(Repository → Security → Report a vulnerability). This reaches the
maintainers directly and keeps the report, discussion, and fix
coordination in one private place.

If you cannot use GitHub private reporting, email a description to the
address configured in this repository's SECURITY contacts. Do not
disclose the issue publicly until a fix is available and coordinated.

What to include: affected component (app / `proxy-server.js` /
`cf-worker` / deploy artifacts), reproduction steps, impact assessment,
and any logs or request traces that demonstrate the issue.

**Response targets** (best effort): acknowledgment within 48 hours,
assessment and fix timeline within 7 days, coordinated disclosure after
the fix ships.

**Safe harbor**: we will not pursue action against researchers who
report vulnerabilities in good faith, avoid privacy violations and
service degradation, and give us reasonable time to respond.

## In Scope

- `cf-worker/` — the production proxy (CORS, rate limiting, daily
  provider budgets, KV/D1 state, upstream SSRF surface)
- `server/` and `proxy-server.js` — Node proxy (Redis-backed limiter,
  TLS posture in production)
- `deploy/` — nginx config, compose templates, backup tooling
- The browser app (`js/`, `dist/` bundle) — XSS, injection, state
  handling
- CI/CD — workflow permissions, secret handling, supply chain

Out of scope: the third-party upstream providers themselves (Dex
Screener, GoPlus, Etherscan, Helius), Cloudflare platform
vulnerabilities, and social engineering of the operator.

## Security Best Practices (operators)

- Use a strong sync password (12+ characters, mixed case, numbers,
  symbols) where a password protects sync/storage.
- Keep the deployed Worker and any self-hosted proxy updated to the
  latest `main`.
- Run the local proxy only on trusted networks; in production use the
  TLS-only Redis posture enforced by `server/config.js` (`rediss://`) and
  the internal-only backend network in `docker-compose.prod.yml`.
- Never commit secrets. Configure `CLOUDFLARE_API_TOKEN`,
  `REDIS_PASSWORD`, and provider keys through the secret manager for
  your environment (GitHub Actions secrets, `.env` outside VCS).
- Prefer GitHub Actions OIDC/short-lived credentials and SHA-pinned
  third-party actions where available.
