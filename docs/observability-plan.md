# Observability Plan

Status: **plan, not implemented.** Everything in §1 exists today;
everything after it is the gap list with concrete, ordered steps. This
document exists so observability work is decided before incidents, not
during them.

## 1. What exists today

| Signal | Where | Notes |
|---|---|---|
| Worker health | `GET /discovery/health` | `ok`, per-provider budgets (`limit`/`remaining`), `methodologyVersion`, `memeFunnel` counters |
| Deploy evidence | Release manifest artifact (`release-manifest-run-<n>`) from `deploy-worker.yml` | commit, bundle digest, previous + deployed Worker Version ID, smoke outcomes (hardening track) |
| CI results | GitHub Actions (`test-and-build`, data snapshots) | Test gates and snapshot freshness are visible per run |
| Redis backups | `scripts/backup-redis.sh` (compose `backup` profile) | timestamped RDB + sha256, 7-snapshot retention |
| Config drift | `data/` snapshot commits every 30 min | freshness is visible in commit history |

## 2. Known gaps

1. **No alerting.** `ALERT_WEBHOOK_URL` is plumbed through the proxy
   env but nothing reliably fires on: budget exhaustion, limiter
   fail-open/fail-closed events, 5xx spikes, deploy smoke-test failures
   (only the Actions run itself is red), or backup failures.
2. **No log retention/structure on the Worker.** `console.*` output
   lives in ephemeral isolate logs; there is no `wrangler tail` capture,
   no structured fields, no sampling policy.
3. **No metrics.** Workers Analytics exists at the platform level but
   there are no custom counters (per-route latency, budget
   consumption rate, limiter rejections) and no dashboard.
4. **No synthetic monitoring.** Nothing periodically probes
   `/discovery/health` from outside; the first detector of a broken
   proxy is a user.
5. **Backup success is silent.** `backup_ok timestamp=…` goes to compose
   logs; a failed backup is only visible if someone reads logs.

## 3. Plan (ordered, smallest-first)

### P0 — detectors (no new infrastructure)

1. **Deploy smoke as the first alarm.** The four mandatory smoke tests
   in `deploy-worker.yml` already fail the deploy job; add a follow-up
   Actions step (same workflow) that posts the failure to
   `ALERT_WEBHOOK_URL` using a repository secret.
2. **Backup watchdog.** After the backup container runs, a tiny sidecar
   step checks `backups/redis-<today>*.rdb` exists and posts to
   `ALERT_WEBHOOK_URL` when absent (cron in compose, 1 line of shell).
3. **External health probe.** A scheduled GitHub Actions workflow (or
   UptimeRobot-free equivalent — a 2-job cron workflow suffices) hits
   `/discovery/health` every 15 min and alerts when `ok != true` or
   `methodologyVersion != discovery-v3` twice consecutively. Reuse the
   hard gates from the deploy workflow; never alert-green on token
   absence.

### P1 — structure (still no new infra)

4. **Structured Worker logs.** Replace raw `console.log` with a small
   `logEvent(kind, fields)` helper emitting single-line JSON
   (`ts`, `requestId` (worker-runtime track), `route`, `kind`, fields).
   Document `wrangler tail --format json` as the capture path.
5. **Budget consumption metric.** Emit one log line per upstream call
   with provider and remaining budget; the health endpoint already
   exposes the aggregate — logs give the rate.

### P2 — retention and dashboards (only if the operator opts in)

6. **Workers Analytics / Logpush** to the operator's chosen sink; keep
   the free-tier default as "logs are ephemeral" — this is an unmanaged
   deployment (see `docs/product-boundary.md`), so P2 is optional.
7. **Dashboard**: minimum viable = health probe history + deploy
   manifest index + backup watchdog results, all visible from Actions
   run history (no external product required).

## 4. Explicitly out of scope

- Any user-facing telemetry, APM agents in the browser bundle, or
  third-party trackers. The data-handling boundary in
  `docs/product-boundary.md` applies to observability too: metrics are
  operator infrastructure, not user instrumentation.
- Availability SLOs. The deployment is best effort; alerts inform the
  operator, they do not create a promise.

## 5. Success criteria for this plan

- A broken proxy is detected by the system (probe), not by a user,
  within one probe interval.
- A failed deploy or failed backup produces a webhook message, not just
  a red run.
- Any budget exhaustion day is explainable afterwards from logs/health
  history alone.
