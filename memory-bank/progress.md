# Progress

> Last synced: 2026-10-01.

## Current State
Weaver has transitioned from prototype/feature-building into the
production-candidate phase. The core evidence/security architecture,
the intelligence signal scanner, portfolio accounting, and
critical-path E2E coverage are functional. All automated test suites
are green on CI.

## Completion Estimates (by subsystem)
- **Core Architecture & Security Boundaries** — ~95%
- **Evidence / Provenance Pipeline** — ~90%
- **Intelligence / Signal Pipeline** — ~90%
  PRICE_MOVE scanner v6 production-grade; REGIME_SHIFT and UNLOCK
  producers live; OPPORTUNITY and THESIS_DETERIORATION wired.
- **Track Record** — ~90%
- **Wallet Infrastructure** — ~80%
- **Provider Reliability** — ~90%
  CoinLore → CoinPaprika → Coinbase chain. CI snapshot pipeline
  aligned.
- **Dashboard / UI** — ~85%
  Feature-complete. Manual UI-002 visual pass remains open.
- **Testing / CI** — ~95%
  Unit (564), Integration (29), Security (16), Worker, E2E (35)
  all run on CI and pass.
- **Documentation / Memory Bank** — ~85%
  Full sync applied 2026-10-01.

## Test Suite Counts (current)
| Suite | Command | Count |
|---|---|---|
| Unit | `npm run test:unit` | 564 |
| Integration | `npm run test:integration` | 29 |
| Security | `npm run test:security` | 16 |
| E2E | `npm run test:e2e` | 35 |

## Recently Completed
- Portfolio accounting: `sell(id, qty, price)`, average-cost basis,
  partial sells, full liquidation, realized P&L accumulation, and
  invalid-input rejection — 22 tests against the real module.
- Critical-path E2E; fixed `W.ui.evidenceDrawer` namespace bug.
- Snapshot chain aligned with live provider; `normalizeGlobal()` in
  `js/api/snapshot.js`; schema labels renamed.
- CSP inline-style audit RESOLVED — MetaMask, not app code; boot-time
  assertion is now permanent.
- Degraded-provider E2E added.
- Worker CORS allows `http://localhost:8080`.
- Node 20 actions; Chart.js SRI.
- PRICE_MOVE scanner v6 with major-z-bypass and symbol exclusions.
- Empty-profile signal fix (market-wide baseline relevance).
- PR #21 merged; `feat/drawer-provenance` deleted.
- README provider chain corrected; test counts updated.
- Chart precision fix in explorer.
- CI gating all suites — completed. `test-and-build` is a required
  status check on `main`.
- Playwright test discovery fix.
- Broken merge recovery (revert-forward of `5001479`).
- Root-level `workflows` file removed.

## Active Focus
1. **Manual browser audit** — seven journeys:
   first load, gem scan, evidence drawer, provider failure,
   accessibility, mobile, data integrity.
2. **Security audit** — headers, raw `fetch()` bypassing
   `W.requestGuard`, `innerHTML` sinks, deployer terminology at
   `js/ui/evidence-drawer.js:353`.

## Known Gaps (not blocking production)
- Real-device mobile pass (DevTools emulation is not exact).
- Signal-transform unit test (`signal shape → decision engine →
  decision output`) — optional follow-up.