# Product Boundary

Status: normative. This document defines what Weaver claims to be, what
it explicitly is not, and who is responsible for what in each deployment
mode. The README "What Weaver is not" section is the user-facing summary;
this document is the operator/compliance-facing version.

## 1. What Weaver is

Weaver is an **evidence-first crypto intelligence and portfolio-tracking
tool**. It:

- Scans newly boosted / newly profiled tokens (DEX Screener) and audits
  contract security via third-party providers (GoPlus, honeypot.is,
  RugCheck).
- Records observations over time (market structure, owner-address
  associations) with explicit provenance (`source`, `observedAt`,
  `methodologyVersion`, `relationship`, `reliability`).
- Produces **decision support**, not decisions: a `recommendedAction` of
  `MONITOR`, `REVIEW_THESIS`, `REVIEW_RISK`, or `LOG_DECISION`.
- Persists user-made decisions and their later-measured outcomes (Track
  Record) so the user can audit their own judgment over time.

## 2. What Weaver is not (hard boundaries)

These are design commitments, not feature gaps. PRs that cross them are
rejected regardless of implementation quality.

1. **Not a trading system.** There is no order path, no exchange
   integration, no key custody of trading credentials, no signal→order
   bridge of any kind. The `recommendedAction` vocabulary has no
   `BUY`/`SELL`/`REBALANCE` values by construction.
2. **Not managed.** Weaver is unmanaged software plus an unmanaged demo
   deployment. No person or entity operates it on the user's behalf,
   monitors the user's portfolio for them, or owes the user availability.
   The hosted deployment is provided **as-is**, best effort, without an
   availability SLO (see `docs/observability-plan.md`).
3. **Not custodial.** Weaver never holds user assets. Encrypted user
   settings (AI provider keys) are stored client-side or in the user's
   own configured storage; the operator cannot recover them.
4. **Not financial advice.** Every output is a statement about data, with
   provenance and caveats. Nothing in the product is a solicitation,
   recommendation, or forecast promise.
5. **Not a deployer-identity authority.** Observed addresses come from
   provider reports (`owner_address` ≠ deployer ≠ controller). Identity
   claims beyond "this address was reported as owner" are out of bounds.
6. **Not a source of truth.** Unknown is `null`/`"unknown"`, never `0`,
   never fabricated (`unknown ≠ zero`, `unknown ≠ safe`,
   `missing ≠ fabricated`).

## 3. Frozen configuration (constitution)

The Window 4 gate configuration is frozen and may not be adjusted to
make results look better:

- Score threshold ≥ 70 for the meme-opportunity gate
- Methodology id `meme-opportunity-v1`
- Cohort and 7-day window definitions
- Window 3 FAIL results are historical evidence and are never edited or
  reinterpreted retroactively

Changes to these require a new methodology version and a new window —
never an in-place edit.

## 4. Deployment modes and responsibility split

| Mode | Where it runs | Operator | Responsibility |
|---|---|---|---|
| **Local / self-hosted** | User's machine (`npm run preview`, `docker compose -f docker-compose.prod.yml`) | The user | Secrets, Redis TLS posture, backups, provider quotas under their own keys |
| **GitHub Pages (static app)** | `ibis01.github.io` | Repo owner | Static files only; no backend, no user data custody |
| **Cloudflare Worker proxy** | `weaver-proxy.ibis01-weaver.workers.dev` | Repo owner | Proxy availability (best effort), provider quotas under the operator's provider keys, rate limiting, daily budgets |

In every mode: the **user** is responsible for their own decisions, key
material entered into the app, and compliance with their local
regulations. The **operator** is responsible only for serving the
software and the shared proxy honestly and within provider terms.

## 5. Data handling boundary

- The proxy stores **no personal data**: KV/D1 hold ephemeral rate-limit
  identity hashes, provider budget counters, and signal payloads the
  user's own client sent; Redis (self-hosted mode) holds proxy limiter
  state. Backups (`scripts/backup-redis.sh`) therefore contain limiter
  and signal state, not user identity documents.
- Provider payloads pass through the proxy; the proxy does not
  enrich, persist long-term, or sell anything.
- No telemetry is collected from browsers beyond what the user's own
  provider requests reveal.

## 6. What would change the boundary

Adding any of the following requires a new product decision and a
revision of this document first: exchange API integration with order
permissions, custodial key storage, an availability SLA, on-chain
transaction signing, automated capital allocation, or identity
attribution beyond provider-reported addresses.
