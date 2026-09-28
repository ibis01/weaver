# Active Context

> Last synced: 2026-09-28. See `git log --oneline -1` for current
> HEAD. Sync reason: intelligence scanner v6 shipped, CI green,
> provider-chain and E2E-count corrections applied.

## Current Status
Weaver is in the **production-candidate** phase. Core architecture,
evidence pipeline, security boundaries, and the intelligence signal
scanner are functional. CI is green on all suites. Remaining work is
repository truth sync (docs vs code), portfolio-math test coverage,
and critical-path E2E — none of it blocking.

## Last Verified Commit
Run `git log --oneline -1` for the current HEAD. Recent reference
commits, most recent first:
- `85264f6` — fix(intelligence): majors bypass z gate; exclude stables and wrapped tokens
- `3a456d3` — feat(intelligence): production-grade PRICE_MOVE scanner
- `df4cb58` — fix(intelligence): baseline relevance for market-wide signals
- `9f74590` — test(e2e): remove stylesheet readiness probe from overflow tests

CI: `Run Test and Build (36416209168)` — success.

## Provider Chain (verified against `js/api/prices.js`)
CoinLore → PRIMARY (tickers)
CoinBase → SECONDARY
CoinPaprika → TERTIARY (chart / search / trending / coin detail)
data/*.json → last resort, refreshed by .github/workflows/data.yml

Note: the module banner at `js/api/prices.js:988` reads
`CoinLore → CoinBase → CoinPaprika → Cache` and matches the code.

## Recently Completed
- **PRICE_MOVE scanner v6** — tiered thresholds (3% major / 6% mid /
  12% small), cross-sectional z gate bypassed for majors, volume
  confirmation, stable/wrapped symbol exclusions, composite score.
  Produces real signals from real market data.
- **Empty-profile signals fix** — market-wide signals carry baseline
  relevance; regime shifts and major-cap price moves surface for
  users with no holdings. `W.decisionEngine._internal.isMarketWide()`
  is the canonical predicate.
- **PR #21** — merged. Provenance rendering at
  `js/ui/evidence-drawer.js:237`. `feat/drawer-provenance` deleted.
- **README cleanup** — provider chain corrected; test counts updated.
- **Chart precision fix** — `fmtChartPrice()` in
  `js/features/explorer.js`.
- **CI Expansion** — `.github/workflows/test-and-build.yml` runs
  unit (538), integration (28), security (16), Worker, and
  Playwright E2E (30).
- **Playwright discovery fix** — `testDir` corrected to `./test/e2e`.
- **Root-level `workflows` file removed** — was a CoinGecko-era
  duplicate of `.github/workflows/data.yml`.

## Active Focus
1. **Portfolio accounting tests** — weighted-average cost basis,
   partial sells, realized/unrealized P&L, zero/negative rejection.
2. **Critical-path E2E** — portfolio add → signal → evidence drawer.
3. **CSP inline-style cleanup** — ~40 warnings per dashboard render
   at `bundle.js:302`. Three call sites. Warnings only.

## Known Deferred
- Snapshot schema still validates against a CoinGecko shape
  (`SchemaValidationError: CoinGecko global: data must be an object`).
  Prices work via the fallback patch; the validator is stale.
- Local CORS: the Worker rejects `http://localhost:8080` with
  `Access-Control-Allow-Origin: null`, so local Playwright exercises
  only snapshot fallbacks. Production Pages origin is allowed.

## Guiding Principle
> "Source code is truth."
AI assistance must prioritize the actual state of the repository
over historical assumptions or outdated documentation.
