# Active Context

## Current Status
Weaver is in the **integration hardening** phase. The focus is on correctness, CI completeness, provider stabilization, and UI acceptance, rather than new feature development.

## Last Verified Commit
`5cb894f` (walletsync v3.4: Helius keyed Solana RPC via Worker injection) - September 27, 2026.

## Current Active Tasks
1. **CI Expansion**: Update `.github/workflows/test-and-build.yml` to run root application tests (`test:unit`, `test:integration`, `test:security`) alongside Worker tests.
2. **UI-002 Acceptance**: Refine Dashboard visual hierarchy (reduce card uniformity), remove non-institutional emojis, and verify strict CSP compliance (zero inline styles).
3. **PR #21 Reconciliation**: Evaluate and rebase/implement the "surface provenance in Why? modal" feature against the current `main` branch without regressing the fixed Evidence Drawer API.

## Resolved Issues
- Evidence Drawer unit test regressions (49 failing tests) are **resolved**. The module is fully functional and CSP-compliant.
- Market data provider divergence between live app and CI snapshot pipeline is **resolved** (both now use CoinLore → CoinPaprika).
- Solana RPC CORS and 403 Forbidden errors are **resolved** via Worker proxy routing and Helius key injection.

## Guiding Principle
> "Source code is truth." 
All AI assistance must prioritize the actual state of the repository over historical assumptions or outdated documentation.