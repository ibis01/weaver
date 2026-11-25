# Deployment Runbook — weaver-proxy Worker

Status: **OPERATIONAL**. The Worker serves script + assets; `methodologyVersion: discovery-v3` verified live at **2026-11-25T08:00:37Z** (and 2026-11-25T00:00:34Z). The 2026-11-22→24 assets-only outage and its repair are preserved in the dated **Incident history** section below and must be read as historical, not current. Deploy procedures and the verification checklist are current.

## Current state (verified live 2026-11-25T08:00:37Z)

| Item | State |
|---|---|
| Repo | `ibis01/weaver`, branch `main` (HEAD `ad3d223` at verification) |
| Worker | `https://weaver-proxy.ibis01-weaver.workers.dev` |
| Serving mode | **script + assets** (script bound) |
| `/discovery/health` | `200`, `ok: true`, `methodologyVersion: discovery-v3`, budgets block, `memeFunnel` block present |
| Script routes (`/discovery/*`, `/meme/*`, `/proxy`, `/goplus/*`, …) | **SERVING** (health `200`; `/meme/alerts?limit=1` `200`) |
| Static assets | `/` and `/dist/bundle.min.js` `200` (~738 KB) |
| CORS | preflight on script routes returns `204` + `Access-Control-Allow-Origin: https://ibis01.github.io` (re-probed every 15 min by the Production Probe workflow) |
| Validation gate | empty payload POSTs rejected `400` (fail-closed) |
| Deploy credentials | `CLOUDFLARE_API_TOKEN` repository secret **absent** — `deploy-production` and rollback jobs fail-closed by design; connector path deployed last production change (2026-11-24T06:41Z) |

Known live condition (not an outage of the Worker itself): upstream
discovery sources can degrade for whole cron cycles, producing a
**zero-token snapshot** with `_meta.errors` recorded — observed
2026-11-25T00:00:31Z and 2026-11-25T08:00:31Z. The worker stays up,
health stays green, and failures are recorded non-silently (Gate 4
compliant). Detection and history: Production Probe workflow (every 15
min) + `docs/status-ledger.yml` `openBlockers: upstream-degraded-cycles`
+ soak annotations in `docs/phase-2/paper-trial-log.md`.

## Deploy procedures

### Path B — token-based permanent path (recommended for the soak-end deploy window)

1. Cloudflare dashboard → My Profile → API Tokens → Create Token →
   template **"Edit Cloudflare Workers"** (includes Workers Scripts:Edit;
   add Account → Workers KV Storage:Edit and D1:Edit if prompted).
   Scope to account `c3c040ca1328e2c00da5cbd878e70408`, zone resources:
   none.
2. GitHub repo → Settings → Secrets and variables → Actions → New
   repository secret: name `CLOUDFLARE_API_TOKEN`, value = the token.
3. Actions → "Deploy Worker (wrangler)" → Run workflow (or push to
   `main`).
4. The workflow dry-runs both configs, deploys via wrangler, then probes
   `/discovery/health`.

Why this is the permanent path: it makes deploys deterministic and
script-inclusive regardless of what the connector does. The connector
can then be left as-is (its assets-only deploys get superseded by the
wrangler deploy) or disabled.

### Path C — dashboard connector fix (fallback)

Workers & Pages → `weaver-proxy` → Settings → Build & deployments:

1. Check **Build configuration**: root directory must be `cf-worker`,
   deploy command must be plain `npx wrangler deploy` (no asset-only
   variants), build command empty/no-op.
2. If the service was created as a **static-assets** Worker, recreate
   the connection as a standard Worker (or use Path B instead).
3. Save → Retry deployment.
4. Inspect the build log "Deploy" step: a healthy run prints the script
   upload ("Uploaded weaver-proxy … Total Upload: …KiB") followed by
   asset upload. An assets-only run shows only asset upload.

### Record — Option A, root `wrangler.jsonc` (the repair that ended the assets-only incident)

Shipped in this repo and used by the connector's pipeline on
2026-11-24T06:41Z to restore script+assets service:

1. **Root-level `wrangler.jsonc`** — full script+assets config with
   root-relative paths; the connector's pipeline picked it up and
   deployed script + assets (discovery-v3 verified live 06:43Z — see
   `docs/phase-2/paper-trial-log.md` §RESOLUTION).
2. **`.github/workflows/deploy-worker.yml`** — dry-run validation on
   every push; real `wrangler deploy` when the repo secret
   `CLOUDFLARE_API_TOKEN` exists.

## Post-deploy verification checklist (all must pass)

```bash
BASE=https://weaver-proxy.ibis01-weaver.workers.dev

# 1. Script live: health with v3 methodology + memeFunnel
curl -s $BASE/discovery/health | tee /tmp/health.json
# expect: ok=true, budgets, memeFunnel object; snapshotMeta absent/empty
#         until first cron run after deploy

# 2. Snapshot (populates on the next */15 cron tick)
curl -s $BASE/discovery/snapshot | head -c 300
# expect: _meta.methodologyVersion = "discovery-v3", sourceCounts object

# 3. Alerts store reachable
curl -s "$BASE/meme/alerts?limit=1" | head -c 200

# 4. CORS on script routes
curl -s -i -X OPTIONS $BASE/discovery/health -H 'Origin: https://ibis01.github.io' | head -5
# expect: 204 with Access-Control-Allow-Origin: https://ibis01.github.io

# 5. Assets still served
curl -s -o /dev/null -w '%{http_code}\n' $BASE/dist/bundle.min.js   # 200

# 6. Hardened write path (should be 400 — invalid address)
curl -s -X POST $BASE/meme/alert -H 'content-type: application/json' \
  -d '{"assessment":{"identity":{"chain":"ethereum","tokenAddress":"0xabc"},"observedAtMs":1},"market":{"priceUsd":1}}'

# 7. Security headers on assets
curl -s -I $BASE/ | grep -iE 'content-security|x-content-type|x-frame'
```

## Hardened deploy pipeline (release determinism)

`deploy-worker.yml` now enforces the following; all gates are
job-failing (no informational warnings, no silent green):

1. **validate/deploy separation** — the `validate-worker` job (dry-run
   of both root and `cf-worker` configs, credential-free) must pass
   before `deploy-production` starts.
2. **Protected environment** — `deploy-production` is bound to the
   GitHub environment `deploy-production`. One-time operator setup
   (REQUIRED before the first real deploy):
   Settings → Environments → `deploy-production` → add required
   reviewer(s) and restrict deployment branches to `main`. Until this
   is configured, the environment is auto-created on first run WITHOUT
   protection.
3. **Fail on missing credentials** — without `CLOUDFLARE_API_TOKEN` the
   deploy job FAILS. It can no longer self-skip and report green for a
   deploy that never happened.
4. **Four mandatory smoke tests** (any failure fails the deploy):
   OPTIONS → 204 + `Access-Control-Allow-Origin` (allowlisted origin),
   invalid payload → 400 (POST /signal `{}`),
   `/discovery/health` → `methodologyVersion: discovery-v3`,
   credentials present.
5. **Release manifest** — commit, bundle digest (sha256 over sorted
   `cf-worker/**` + `wrangler.jsonc` + `_headers` + `.assetsignore`),
   previous + deployed Worker Version ID, methodologyVersion, and
   per-smoke outcomes; uploaded as a 90-day artifact
   (`release-manifest-run-<n>`) and printed to the job summary.

## Window 4 gate (constitution reminder)

Opening Window 4 requires, in order: (1) discovery-v3 verified live via
this checklist, (2) 24h soak with `memeFunnel` populated. The window
clock is **NOT started** and must not be treated as started until both
conditions are recorded in `docs/phase-2/paper-trial-log.md`. Frozen
configuration (threshold ≥ 70, `meme-opportunity-v1`, cohorts, 7-day
window) is unchanged by this runbook.

## Rollback

Fast path: Actions → **"Rollback Worker"** (`rollback-worker.yml`) →
Run workflow:

- `version_id` — optional. Set it to a specific Worker Version ID
  (for example the "Previous Worker Version ID" recorded in the latest
  `release-manifest-run-<n>` artifact). Leave empty to roll back to the
  immediately previous version.
- `reason` — required; recorded in the run summary.

The rollback job runs under the same `deploy-production` environment
gate, fails hard when `CLOUDFLARE_API_TOKEN` is missing, and verifies
`/discovery/health` (discovery-v3) after rolling back.

Slow path (unchanged, no token needed on the machine running it):
deploy an older commit via Path B — `npx wrangler deploy` from
`cf-worker` at the desired commit (e.g., `75d85a1` for the
discovery-v2 era router). The connector-era assets-only state was never
script-inclusive, so it is not a rollback target.

## Incident history (dated, immutable)

### 2026-11-22 → 2026-11-24 — assets-only connector deploys (RESOLVED 2026-11-24T06:41Z)

**Historical record — preserved unmodified; do not read as current.**

During this window the production Worker served static assets only; all
script routes returned empty-body 404s with no CORS headers.

Evidence that the script was NOT bound (collected 2026-11-24):

- `GET /discovery/health` → `404`, `content-length: 0`, **no
  `content-type`**, no CORS headers. The router's fallback (line
  `return jsonResponse({ error: "Not found" }, 404, headers)`) would
  always produce a JSON body with CORS headers — so these responses do
  not come from the script.
- `POST /index.html` → `405` empty. The Cloudflare assets system rejects
  non-GET/HEAD on asset paths itself; with a script bound, POSTs fall
  through to the script (router would answer JSON).
- `.assetsignore` semantics ARE honored (`/docs/phase-status.md` 404
  while `docs/phase-status.md` exists in the repo) — the pipeline reads
  the `[assets]` block / assets directory but never deploys `main`.

Root cause: the Cloudflare connector's deployment pipeline behaved as a
**static-assets deploy rooted at the repo root** and did not run
`wrangler deploy` with `cf-worker/wrangler.toml` (which declares
`main = "index.js"`). Both connector builds (commits `f90b0c3` and
`083c8b7`, Versions `384ccda1` and `e3a4f734`, both "success") produced
assets-only services. The trial-log note recording
"root directory cf-worker, deploy command npx wrangler deploy" reflects
what the dashboard showed, but the effective result contradicted it.

Resolution: Option A (root `wrangler.jsonc`) was picked up by the
connector pipeline at 2026-11-24T06:41Z; discovery-v3 verified live
06:43Z. See "Record — Option A" above.

### 2026-11-25 — upstream degraded discovery cycles (OPEN, under soak observation)

- 2026-11-25T00:00:31Z cron cycle: snapshot generated but contained
  **0 tokens**; `sourceCounts` all zero; `_meta.errors:
  ["token-boosts unavailable", "token-profiles unavailable"]`. Health
  endpoint stayed `ok: true` throughout; failure recorded non-silently
  in the snapshot metadata (Gate 4 compliant — no silent gap).
- 2026-11-25T08:00:31Z cron cycle: same degraded pattern (0 tokens,
  zero sourceCounts, same two `_meta.errors`). Budgets healthy
  (goplus 97/500 used) — **not** a quota-exhaustion event.
- `memeFunnel.latestObservedAt` frozen at 2026-11-25T00:05:56Z through
  at least 08:00Z (~8 h without new funnel observations).
- Independent client-side scan round at ~08:01Z succeeded (30
  candidates, 4 chains, 24 gems ≥ 40, verdicts 22 pass / 1 danger),
  consistent with an upstream fetch failure specific to the worker-cron
  path rather than a total source outage.
- Operator guidance: annotate both cycles in the trial log Day-3 entry;
  no cf-worker changes during soak (HOLD); detection stays with the
  Production Probe stream and the ledger `upstream-degraded-cycles`
  blocker.
