# Active Context

> Last synced: 2026-10-01. See `git log --oneline -1` for current
> HEAD. Sync reason: portfolio accounting, critical-path E2E,
> snapshot-chain alignment, CSP inline-style resolution, and
> degraded-provider E2E all completed.

## Current Status
Weaver is in the **production-candidate** phase. Core architecture,
evidence pipeline, security boundaries, and the intelligence signal
scanner are functional. CI is green on all suites. Remaining work is
the manual browser audit and a security audit — neither is blocking.

## Last Verified Commit
Run `git log --oneline -1` for the current HEAD. Recent reference
commits, most recent first:
- `00653d37` — test(e2e): promote boot-time CSP check to a permanent assertion; sync memory bank
- `e19e954` — chore(build): drop duplicate evidence-drawer entry; test degraded-provider labelling
- `0897ad1` — docs(memory-bank): mark CI expansion as completed
- `838b2ac` — security(csp): add SRI hash to Chart.js CDN script
- `ef8c26f` — fix(worker): allow localhost:8080 for Playwright local runs
- `06b89d5` — fix(snapshot): align global snapshot shape with the live provider

CI: `test-and-build.yml` green on every push. Note: there is no
checked-in `pages-build-deployment.yml`; GitHub Pages builds via its
internal workflow. Checked-in workflows are `data.yml`,
`performance.yml`, `test-and-build.yml`.

## Provider Chain (verified against `js/api/prices.js`)
CoinLore → PRIMARY (tickers)
CoinPaprika → secondary + search / detail / global
Coinbase → fallback spot quotes
Binance → OHLCV / chart, browser-direct (Worker 403s Cloudflare egress IPs)
data/*.json → snapshots, refreshed hourly by .github/workflows/data.yml

Note: CoinGecko appears only as an image host for token logos in
`js/api/prices.js`. Market data no longer flows through the CoinGecko API.

## Recently Completed
- **Portfolio accounting** — `sell(id, qty, price)` added using the
  average-cost method; `update()` hardened with an allowlist. 22 tests
  in `test/unit/portfolio.test.js` against the real module. Removed
  the stub in `test/setup.js`; real require added at the bottom after
  JSDOM init.
- **Critical-path E2E** — `test/e2e/critical-path.spec.js` exercises
  portfolio → events → decision → dashboard signal row → click →
  evidence drawer → close. Found and fixed a real namespace bug:
  dashboard checked `W.evidenceDrawer` but the drawer module assigns
  `W.ui.evidenceDrawer`. Every signal click was a silent no-op.
- **Snapshot chain** — `data.yml` now emits wrapped shape
  `{ data: { total_market_cap: { usd }, ... } }` matching the live
  provider. `js/api/snapshot.js` has `normalizeGlobal()` for the
  transition. Schema labels renamed `"CoinGecko markets"` → `"markets"`.
- **Data-path audit** — `data-path-audit.md` VERIFY markers resolved:
  Binance is the OHLCV source; news feeds are CoinDesk / Cointelegraph
  / Decrypt.
- **Worker CORS** — `http://localhost:8080` added to `ALLOWED_ORIGINS`
  in `cf-worker/index.js`, deployed. Local Playwright now exercises
  real fetch paths.
- **Node 20 actions** — `actions/checkout@v5`, `actions/setup-node@v5`.
  Node 20 deprecation warning gone.
- **Chart.js SRI** — `integrity="sha384-9nhczxUqK87bcKHh20fSQcTGD4qq5GhayNYSYWqwBkINBhOfQLg/P5HG5lF1urn4"`.
- **CSP inline-style** — RESOLVED. "Applying inline style" messages
  traced to MetaMask (`contentscript.js:14083`). `grep -rn "inline style" js/ dist/`
  returns only comments. Boot-time `addInitScript` listener captured
  **0 securitypolicyviolation events**. Now a permanent E2E assertion.
- **Degraded-provider E2E** — acceptance test blocks all providers and
  the Worker; asserts render, no throw, and honest snapshot / cache /
  stale labelling.
- **PRICE_MOVE scanner v6** — tiered thresholds (3% major / 6% mid /
  12% small), cross-sectional z gate bypassed for majors, volume
  confirmation, stable/wrapped symbol exclusions, composite score.
- **Empty-profile signals fix** — market-wide signals carry baseline
  relevance. `W.decisionEngine._internal.isMarketWide()` is the
  canonical predicate.
- **PR #21** — merged. Provenance rendering at
  `js/ui/evidence-drawer.js:237`. `feat/drawer-provenance` deleted.
- **README cleanup** — provider chain corrected; test counts updated.
- **Chart precision fix** — `fmtChartPrice()` in
  `js/features/explorer.js`.
- **CI Expansion** — completed. `.github/workflows/test-and-build.yml`
  runs build, unit, integration, security, Worker, and Playwright E2E
  on every push and PR to `main`. `test-and-build` is a required check.
- **Playwright discovery fix** — `testDir` corrected to `./test/e2e`.
- **Root-level `workflows` file removed** — was a CoinGecko-era
  duplicate of `.github/workflows/data.yml`.

## Active Focus
1. **Manual browser audit** — seven journeys against
   `https://ibis01.github.io/weaver/` in an incognito window with
   extensions disabled. See `progress.md` for the checklist.
2. **Security audit** — four areas:
   - **A.** HTTP security headers at the deployment layer
     (GitHub Pages constraint; only the `<meta http-equiv>` CSP at
     `index.html:122`).
   - **B.** Raw `fetch()` calls bypassing `W.requestGuard` — verify
     AbortController timeouts and error handling.
   - **C.** `innerHTML` sinks — confirm the `esc()` pattern is applied
     to untrusted values everywhere.
   - **D.** Deployer-terminology mismatch at
     `js/ui/evidence-drawer.js:353` — trace `deployerSummary` back to
     source; confirm the label matches the data (owner vs
     creator/deployer).

## Known Deferred
- **Real-device mobile pass** — DevTools emulation is close but not
  exact.
- **Signal-transform unit test** — `signal shape → decision engine →
  decision output`, to catch shape bugs at the unit layer rather than
  E2E.

## Guiding Principle
> "Source code is truth."
AI assistance must prioritize the actual state of the repository
over historical assumptions or outdated documentation.