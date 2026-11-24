# Restore Drill Runbook

Status: normative procedure. Run this drill **quarterly** and after any
change to backup tooling, the compose topology, or Redis configuration.
A restore that has never been rehearsed is not a backup; until the drill
passes, the honest claim is "backups exist", not "recovery works".

## 1. What is backed up, and what is not

| State | Persisted where | Backed up? | Restorable? |
|---|---|---|---|
| Rate-limiter state (Node proxy) | Redis | yes (RDB) | yes — and safe to lose (see §5) |
| Signals / alert store payloads sent by clients | Redis (self-hosted mode) | yes (RDB) | yes |
| Worker KV state (budgets, limiter, `signals:v1:*`) | Cloudflare KV | no (platform-managed) | n/a — ephemeral by design |
| Worker D1 state | Cloudflare D1 | no (platform-managed) | use `wrangler d1 export` separately if introduced |
| Provider API keys | env/secret manager | out of scope | re-enter from the secret manager |
| Static app + Worker code | git | yes (repo) | redeploy from `main` / release manifest |

The RDB therefore contains **limiter and signal state only** — no user
identity documents (see `docs/product-boundary.md` §5).

## 2. Prerequisites

- `docker compose -f docker-compose.prod.yml` stack (or an equivalent
  host with `redis-cli`, `redis-check-rdb`, and `redis-server` of the
  same major version as the source).
- The backup artifacts: `$BACKUP_DIR/redis-<STAMP>.rdb` plus
  `redis-<STAMP>.rdb.sha256` (produced by `scripts/backup-redis.sh`,
  retained 7 snapshots by default).
- A **non-production** restore target. Never rehearse the first restore
  against the live service.

## 3. Drill procedure

```bash
# 1. Pick the newest artifact and verify integrity FIRST.
ART=backups/redis-20261124T120000Z.rdb          # example
sha256sum -c "$ART.sha256"                      # must print OK
redis-check-rdb "$ART"                          # must exit 0, no errors

# 2. Bring up a throwaway Redis on a scratch port with swap-in of the RDB.
redis-server --port 6399 --dir "$(dirname "$ART")" \
  --dbfilename "$(basename "$ART")" --appendonly no &
sleep 2

# 3. Prove the data is really there (not just a server that starts).
redis-cli -p 6399 DBSIZE                        # expect > 0 (limiter/budget/signal keys)
redis-cli -p 6399 --scan --pattern 'signals:v1:*' | head -3
redis-cli -p 6399 GET "budget:goplus:$(date -u +%F)" || true

# 4. Prove the app layer accepts the restored state.
#    Point a scratch proxy instance at redis://127.0.0.1:6399 and issue
#    one request through it; the limiter must behave normally
#    (allow under the limit, 429 at the limit).

# 5. Tear down.
kill %1
```

**Pass criteria**: checksum OK, `redis-check-rdb` clean, `DBSIZE > 0`
with expected key families present, and a scratch proxy session working
against the restored instance with no manual surgery.

## 4. Real restore (incident path)

1. Stop the `proxy` service (not `redis`) to freeze writes.
2. Copy the chosen RDB + checksum to the host, verify (§3 step 1).
3. Stop `redis`, replace its dump file (`/data/dump.rdb` in the
   container volume), fix ownership/permissions, start `redis`, start
   `proxy`.
4. Re-verify health end-to-end: proxy `/health` (Node) and Worker
   `/discovery/health` both answering, limiter allowing normal traffic.
5. Record the incident entry: stamp used, gap between last snapshot and
   incident (data-loss window ≤ backup interval; 6h cadence by default
   in the prod compose file), and any anomalies.

## 5. What a restore does NOT recover (accept in advance)

- **Ephemeral correctness state**: limiter windows and today's provider
  budget counters may be older than reality. After a restore, budgets
  may under- or over-count vs Cloudflare's KV view; the safe posture is
  to treat the Worker KV budget as authoritative for the Worker and the
  Redis budget as authoritative for the proxy — they are independent.
- **TTLs**: RDB preserves TTLs at snapshot time; keys whose TTL expired
  between snapshot and restore come back as gone (correct behavior).
- **Anything that was never written to Redis** (KV-only signal store,
  client-side caches, user-local Track Record data — that lives in the
  user's browser and is out of operator scope).

## 6. Drill log

Record every drill (append-only, one line per run):

| Date | Artifact | Checksum OK | DBSIZE > 0 | App accepts state | Notes |
|---|---|---|---|---|---|
| — | — | — | — | — | no drill recorded yet |

The next drill is due within 90 days of the last recorded row. When a
row is added, this table is the proof; "it worked last time" without a
row does not count.
