# Active Context

> Last synced: 2026-09-28. See `git log --oneline -1` for the current
> HEAD. Sync reason: CI Expansion is complete and the earlier memory
> bank described a state the repository has moved past.

## Current Status
Weaver is in the **integration hardening** phase. The core architecture,
evidence pipeline, and security boundaries are substantially built and
functional. Remaining work is browser-level acceptance, memory-bank and
documentation hygiene, and open-PR reconciliation — not new feature
development.

## Last Verified Commit
The current HEAD (run `git log --oneline -1`). Previous reference
commit was `5cb894f` (Sep 27, 2026); `main` has since moved through
`f83e168` and the E2E discovery fix.

## Current Active Tasks
1. **UI-002 Acceptance** — browser pass on the Dashboard: visual
   hierarchy, emoji removal, CSP console cleanliness, mobile/responsive
   layout, keyboard navigation, focus states, touch-target sizing,
   loading and error states. Feature-complete; acceptance not done.
2. **PR #21 Reconciliation** — `feat/drawer-provenance` currently points
   at the recovery commit `f83e168`. The original provenance work is at
   `e4428b5`. Decide: close as superseded, or restore the branch and
   rebase against current `main`.
3. **Documentation hygiene** — README still names CoinGecko as the
   primary market-data provider. The code uses CoinLore → CoinPaprika
   → Coinbase (fallback). Correct the provider story in README and
   any lingering doc references.

## Recently Completed (since last sync)
- **CI Expansion** — `.github/workflows/test-and-build.yml` now runs
  root `test:unit`, `test:integration`, `test:security`, Worker tests,
  and Playwright E2E. No further gating work required.
- **Playwright test discovery fix** — `playwright.config.js` pointed at
  `./tests/e2e` (one file, three tests). Consolidated to `./test/e2e`
  (four files, eleven tests). Three spec files were silently skipped
  on every previous CI run.
- **Broken merge recovery** — `5001479` accidentally merged
  `feat/drawer-provenance` into `main` with conflict markers in
  `js/ui/evidence-drawer.js`, `js/features/token-analysis.js`, and
  `dist/bundle*.js`. Reverted forward via `f83e168`; `main` is clean.
- **E2E flake fix** — `weaver.spec.js` was selecting the wrong `+ Add`
  button (`has-text("+ Add")` matched `+ Add to Watchlist` earlier in
  the DOM). Fixed with an anchored accessible-name regex. All eleven
  tests pass on CI (run 36394740700).

## Resolved Issues (previously listed)
- Evidence Drawer unit test regressions: resolved.
- Market-data provider divergence between live app and CI snapshot
  pipeline: resolved (CoinLore → CoinPaprika chain in both).
- Solana RPC CORS and 403 errors: resolved via Worker proxy + Helius
  key injection.

## Guiding Principle
> "Source code is truth."
AI assistance must prioritize the actual state of the repository over
historical assumptions or outdated documentation.
