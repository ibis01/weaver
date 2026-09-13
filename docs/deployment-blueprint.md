# Weaver production deployment blueprint

## Topology

```
Internet
   |
   v
Nginx frontend :8080  ── /proxy, /health, /ready ──>  Weaver proxy :3001
                                                        |
                                                        v
                                                Redis 7 with AOF + RDB
                                                        |
                                                        v
                                             Backup worker -> /backups
```

The frontend is a static Nginx container. The proxy is a separate non-root Node.js container. Redis is internal-only and stores rate-limit buckets, circuit states, and short-lived API-failure counters. Browser users never receive Redis credentials.

## Initial deployment

1. Copy `.env.example` to `.env.production` on the deployment host and fill in secrets through the host's secret manager. Do not commit the file.

1. Export `REDIS_PASSWORD` for Compose interpolation, or invoke Compose with `--env-file .env.production`.

1. Build and start the core services:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build web proxy redis
```

1. Verify readiness and persistence:

```bash
curl -fsS http://localhost:8080/health
curl -fsS http://localhost:8080/ready
```

1. Enable the backup profile on a host with durable backup storage:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml --profile backup up -d backup
```

A production ingress or load balancer should terminate TLS in front of Nginx. Restrict Redis security-group access to the Compose backend network or private host network. Use a managed Redis service when multi-host failover, replication, or automated durability is required.

## Persistence and recovery

The Redis service enables append-only persistence and periodic RDB snapshots on the `redis-data` named volume. The backup worker creates timestamped RDB files, verifies them with `redis-check-rdb`, records SHA-256 checksums, and retains the newest seven snapshots by default. Store `/backups` on durable disk or sync it to object storage with a separate host-level job.

The backup artifact is a recovery point, not a substitute for a tested restore. A monthly restore drill should load the newest snapshot into an isolated Redis instance, run `redis-check-rdb`, verify expected keys under the configured namespace, and record recovery time and point objectives. Rate-limit and circuit state are operational state; losing them is safe, but backup integrity is still monitored to detect persistence failures.

## Load testing

The k6 suite in `performance/k6-proxy.js` exercises health and proxy traffic concurrently. Default acceptance thresholds are less than 5% overall HTTP failures, p95 latency below 750 ms, p99 below 1.5 s, and proxy-specific errors below 10%. Run locally against a deployed or Compose endpoint:

```bash
BASE_URL=http://localhost:8080 k6 run performance/k6-proxy.js
```

The GitHub Actions workflow runs the benchmark weekly and on demand. Set the `PERFORMANCE_BASE_URL` repository or environment secret to the stable deployment URL. Treat threshold failures as release-blocking until investigated; compare results against the previous baseline rather than relying on a single run.