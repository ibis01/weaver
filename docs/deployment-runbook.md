# Deployment Runbook — weaver-proxy Worker

Status: **RESOLVED 2026-11-24 06:41Z via Option A** (root
`wrangler.jsonc` — the connector pipeline picked it up and deployed
script + assets; discovery-v3 verified live 06:43Z, see
`docs/phase-2/paper-trial-log.md` §RESOLUTION). Options B/C remain
documented as permanent/fallback paths.

## Current state (facts, verified live)

| Item | State |
|---|---|
| Repo | `ibis01/weaver`, branch `main` |
| Worker | `https://weaver-proxy.ibis01-weaver.workers.dev` |
| Static assets on worker | OK — `/`, `/dist/bundle.min.js` 200 |
| Script routes (`/discovery/*`, `/meme/*`, `/proxy`, `/goplus/*`, …) | **BROKEN — empty-body 404, no CORS headers** |
| Serving mode | **assets-only** (script not bound) |
| Expected healthy mode | script + assets (`methodologyVersion: discovery-v3`, `memeFunnel` in `/discovery/health`) |

Evidence that the script is NOT bound (collected 2026-11-24):

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

Root cause: the Cloudflare connector's deployment pipeline behaves as a
**static-assets deploy rooted at the repo root** and does not run
`wrangler deploy` with `cf-worker/wrangler.toml` (which declares
`main = "index.js"`). Both connector builds (commits `f90b0c3` and
`083c8b7`, Versions `384ccda1` and `e3a4f734`, both "success") produced
assets-only services. The trial-log note recording
"root directory cf-worker, deploy command npx wrangler deploy" reflects
what the dashboard showed, but the effective result contradicts it.

## Fix paths (any ONE of these is sufficient)

### Option A — repo-side (already shipped, zero dashboard action needed)

Shipped in this repo:

1. **Root-level `wrangler.jsonc`** — full script+assets config with
   root-relative paths. If the connector's pipeline executes
   `wrangler deploy` from the repo root (or picks up a root config),
   the next build deploys script + assets correctly.
2. **`.github/workflows/deploy-worker.yml`** — dry-run validation on
   every push; real `wrangler deploy` when the repo secret
   `CLOUDFLARE_API_TOKEN` exists.

→ Try first: push to `main` (or re-run the "Deploy Worker (wrangler)"
workflow), wait for the build, then run the verification checklist
below. If `/discovery/health` answers with
`methodologyVersion: discovery-v3`, done — no dashboard work needed.

### Option B — one Cloudflare token (recommended permanent path)

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

### Option C — dashboard connector fix

Workers & Pages → `weaver-proxy` → Settings → Build & deployments:

1. Check **Build configuration**: root directory must be `cf-worker`,
   deploy command must be plain `npx wrangler deploy` (no asset-only
   variants), build command empty/no-op.
2. If the service was created as a **static-assets** Worker, recreate
   the connection as a standard Worker (or use Option B instead).
3. Save → Retry deployment (use commit `083c8b7` or later).
4. Inspect the build log "Deploy" step: a healthy run prints the script
   upload ("Uploaded weaver-proxy … Total Upload: …KiB") followed by
   asset upload. An assets-only run shows only asset upload.

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
deploy an older commit via Option B — `npx wrangler deploy` from
`cf-worker` at the desired commit (e.g., `75d85a1` for the
discovery-v2 era router). The connector-era assets-only state was never
script-inclusive, so it is not a rollback target.
