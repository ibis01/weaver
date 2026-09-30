# Progress

> Last synced: 2026-09-28.

## Current State
Weaver has transitioned from prototype/feature-building into the
production-candidate phase. The core evidence/security architecture
and the intelligence signal scanner are functional. All automated
test suites are green on CI.

## Completion Estimates (by subsystem)
- **Core Architecture & Security Boundaries** — ~95%
- **Evidence / Provenance Pipeline** — ~90%
- **Intelligence / Signal Pipeline** — ~90%
  PRICE_MOVE scanner v6 production-grade; REGIME_SHIFT and UNLOCK
  producers live; OPPORTUNITY and THESIS_DETERIORATION wired.
- **Track Record** — ~90%
- **Wallet Infrastructure** — ~80%
- **Provider Reliability** — ~90%
  CoinLore → CoinBase → CoinPaprika chain. CI snapshot pipeline
  aligned.
- **Dashboard / UI** — ~85%
  Feature-complete. Manual UI-002 visual pass remains open.
- **Testing / CI** — ~95%
  Unit (538), Integration (28), Security (16), Worker, E2E (30)
  all run on CI and pass.
- **Documentation / Memory Bank** — ~70%
  Provider-chain and E2E-count corrections applied. `data-path-audit.md`
  still describes the pre-migration architecture.

## Test Suite Counts (current)
| Suite | Command | Count |
|---|---|---|
| Unit | `npm run test:unit` | 538 |
| Integration | `npm run test:integration` | 28 |
| Security | `npm run test:security` | 16 |
| E2E | `npm run test:e2e` | 30 |

## Recently Completed
- PRICE_MOVE scanner v6 with major-z-bypass and symbol exclusions.
- Empty-profile signal fix (market-wide baseline relevance).
- PR #21 merged; `feat/drawer-provenance` deleted.
- README provider chain corrected; test counts updated.
- Chart precision fix in explorer.
- CI gating all suites — *completed*. `test-and-build` is a required status check on `main`.
- Playwright test discovery fix.
- Broken merge recovery (revert-forward of `5001479`).
- Root-level `workflows` file removed.

## Active Focus
1. **Portfolio accounting tests** — weighted-average cost basis,
   partial sells, realized/unrealized P&L.
2. **Critical-path E2E** — portfolio add → signal → evidence drawer.
3. **`data-path-audit.md`** — stale CoinGecko-era content.

## Known Gaps (not blocking production)
- Portfolio math unit tests are smoke-level only.
- E2E suite lacks degraded-provider and critical-path coverage.
- CSP inline-style violations at `bundle.js:302` (~40 per render).
- Snapshot schema still validates against a CoinGecko shape.
- Local CORS: Worker rejects `http://localhost:8080`.
