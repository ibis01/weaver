# Quota and Rate-Limit Policy

Status: descriptive of the shipped implementation (`cf-worker/index.js`,
`proxy-server.js`, `server/`) plus operator guidance.

## 1. Why quotas exist

The Worker proxy spends the **operator's** upstream provider quotas.
Without budgets, one abusive client (or one frontend bug) can exhaust
the day's allowance for everyone and silently degrade the product for
all users. The policy below makes the spend bounded, observable, and
fair.

## 2. Daily provider budgets (Worker)

Declared in `cf-worker/index.js` as `DAILY_BUDGETS` (calls per UTC day,
per provider):

| Provider | Budget/day | Typical use |
|---|---|---|
| `goplus` | 500 | Contract security audits (Shield) |
| `etherscan` | 5,000 | Deployer/provenance lookups |
| `helius` | 50,000 | Solana RPC (deployer relay) |

Behavior:

- Counters live in KV under `budget:<provider>:<YYYY-MM-DD>`.
- When a budget is exhausted, upstream calls for that provider return
  `503` with `{"code":"BUDGET_EXHAUSTED", …}` until the next UTC day.
- Health (`/discovery/health`) exposes per-provider `limit` and
  `remaining`, so exhaustion is observable without guessing.
- Known limitation (fixed on the `hardening/worker-runtime` track):
  read-then-increment is not atomic across concurrent isolates; the
  hardening PR moves the counter to a D1 transactional increment so
  bursts cannot overshoot the declared budget.

## 3. Rate limiting

- **Worker**: per-identity token-bucket in KV (`rateLimit(request, env,
  "<scope>")`), scoped per sensitive route (`etherscan-post`,
  `signal-post`, …). Identity is derived from request attributes; the
  limiter is eventually consistent (KV TTL), which bounds but does not
  strictly guarantee cross-isolate fairness. The
  `hardening/worker-runtime` PR adds a configurable fail-closed mode
  for auth-shaped routes so limiter state unavailability cannot widen
  the surface by default.
- **Node proxy** (`server/`): Redis-backed limiter using an atomic Lua
  script (single write per decision), so concurrent requests cannot
  overshoot. Failure policy: if Redis is unreachable the proxy refuses
  the request rather than running unbounded (fail-closed), matching the
  TLS-only `rediss://` production posture enforced by
  `server/config.js`.

## 4. Client-facing rules (fair use)

1. One frontend instance, one user: normal interaction cannot hit the
   daily budgets. Budget exhaustion in practice indicates scripted
   abuse or a frontend bug.
2. Clients must honor `429` responses' `Retry-After` and `503`
   `BUDGET_EXHAUSTED` semantics — no immediate retry storms.
3. CORS is allowlist-only (`ALLOWED_ORIGINS`); third-party origins
   cannot spend the operator's quotas from a browser at all.
4. No provider keys are exposed to clients; all upstream calls are
   proxied.

## 5. Operator guidance

- Raise `DAILY_BUDGETS` only with the corresponding paid-tier quota on
  the provider side; a budget above the real provider quota turns
  `BUDGET_EXHAUSTED` into provider `429`s, which are noisier and less
  honest.
- Lowering a budget is always safe for correctness; it only makes the
  proxy say "exhausted" earlier.
- Budget/limiter state is ephemeral and TTL'd; restoring Redis from
  backup (see `docs/restore-drill-runbook.md`) does not resurrect stale
  budgets, and losing it does not reset provider-side quotas.
- When changing quota semantics, bump the methodology version in
  `/discovery/health` if the change is observable through it.
