# Production secrets and shared state

Production secrets must be configured in the hosting provider's encrypted secret manager or environment configuration. Do not commit `.env` files, Redis URLs, webhook URLs, API tokens, or credentials. The repository includes `.env.example` only as a non-secret contract.

The proxy requires `NODE_ENV=production`, an explicit `ALLOWED_ORIGINS` list, and `REDIS_URL`. Redis should use TLS (`rediss://`) and a dedicated production database or namespace. `REDIS_NAMESPACE` prevents collisions between environments. The process fails during startup if production Redis or allowed origins are missing; the in-memory limiter is available only for local development.

The optional `ALERT_WEBHOOK_URL` must use HTTPS. It receives structured events for circuit openings and API failure-rate thresholds. Alert payloads contain provider hostnames, status codes, counts, and timestamps, but never request URLs, credentials, response bodies, or secret values.

Recommended deployment configuration:

| Variable | Required | Purpose |
| --- | --- | --- |
| `NODE_ENV` | Yes | Set to `production`. |
| `ALLOWED_ORIGINS` | Yes | Comma-separated exact browser origins. |
| `REDIS_URL` | Yes | TLS Redis connection URL. |
| `REDIS_NAMESPACE` | No | Environment-specific key prefix. |
| `RATE_LIMIT_WINDOW_MS` | No | Client rate-limit window; default 60 seconds. |
| `RATE_LIMIT_MAX_REQUESTS` | No | Requests per client/window; default 30. |
| `API_FAILURE_ALERT_THRESHOLD` | No | Failures per provider/window before alert; default 10. |
| `ALERT_WEBHOOK_URL` | No | HTTPS monitoring/alert receiver. |

CI uses the repository's lockfile and should receive secrets through GitHub Actions environment secrets only when a deployment target requires them. Secrets must not be echoed, interpolated into build artifacts, or passed to browser-side JavaScript.