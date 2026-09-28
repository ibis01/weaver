# Progress

> Last synced: 2026-09-28.

## Current State
Weaver has transitioned from the prototype/feature-building phase into
the integration hardening and production-candidate phase. The core
evidence/security architecture is substantially built and functional.
All automated test suites are green on CI.

## Completion Estimates (by subsystem)
- **Core Architecture & Security Boundaries** — ~95%
  Non-custodial rules enforced; Worker SSRF protected; CSP strict.
- **Evidence / Provenance Pipeline** — ~90%
  Unified verdict versioning; canonical `computeConfidence`;
  provenance fields flowing through to the drawer.
- **Track Record** — ~90%
  Immutable snapshots, decision/outcome separation, migration.
- **Wallet Infrastructure** — ~80%
  Multi-chain sync functional; CORS/RPC fallbacks hardened.
- **Provider Reliability** — ~90%
  Migrated from CoinGecko to CoinLore → CoinPaprika → Coinbase.
  CI snapshot pipeline aligned with the live provider chain.
- **Dashboard / UI** — ~85%
  Feature-complete. Visual acceptance (UI-002) pending.
- **Testing / CI** — ~95%
  Unit (538), Integration (16), Security (16), Worker tests, and
  Playwright E2E (11) all run on CI and pass. Deeper coverage for
  portfolio math and critical-path flows remains a listed gap.

## Recently Completed
- **CI Expansion** — root `test:unit`, `test:integration`,
  `test:security`, Worker tests, and Playwright E2E are all gated in
  `.github/workflows/test-and-build.yml`.
- **E2E discovery fix** — was discovering 3 of 11 tests; now
  discovers and runs all 11.
- **Broken merge recovery** — revert-forward of `5001479`; `main`
  is clean and CI is green.
- **Reconciled `.github/workflows/data.yml`** with the live
  CoinLore/CoinPaprika provider architecture.
- **Resolved Evidence Drawer CSP and unit test regressions**.
- **Implemented Helius RPC key injection via Cloudflare Worker**.

## Active Focus
1. **UI-002 acceptance** — browser-based Dashboard verification.
2. **PR #21 reconciliation** — the branch state was disturbed by the
   merge recovery. Close as superseded or restore the original commit
   (`e4428b5`) and rebase against current `main`.
3. **README + memory-bank hygiene** — replace stale provider references
   and outdated test-status claims.

## Known Gaps (not blocking production)
- Portfolio math unit tests (weighted-average cost basis, realized/
  unrealized P&L) are smoke-level only.
- E2E suite is smoke + acceptance. No browser coverage for wallet-sync
  failure paths, degraded-provider behavior, or the end-to-end
  intelligence → evidence → verdict → drawer flow.
- `systemPatterns.md` was corrupted in a previous edit (contained an
  embedded copy of `techContext.md` behind a stray header). Fixed in
  the same sync as this file.
