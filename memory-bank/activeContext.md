# Active Context — Current Development State

## Repository State
- **Branch:** `main` (assumed — verify with `git branch`)
- **Last Verified Commit:** `dfbd0cb` (feat(ui): implement skeleton loaders & wire intelligence feed)
- **Working Tree Status:** Clean as of last push (verify with `git status`)

⚠️ **VERIFICATION REQUIRED:** Run `git log --oneline -10` and `git status` to confirm current state.

## Recent Development Focus

### Completed Work (verified in conversation)
1. **Shield Risk Score Normalization**
   - Clamped EVM and Solana risk scores to 100 max
   - Fixed LP locked semantics (null = unknown, not unlocked)
   - Added regression tests in `test/unit/shield-risk-score-clamp.test.js`
   
2. **CSP Compliance — Dashboard**
   - Eradicated inline styles from `js/features/dashboard.js` (and `js/ui/dashboard.js`)
   - All dynamic styling via CSS classes and CSS variables
   - Skeleton loading states prevent CLS
   
3. **Honest Data Semantics**
   - Unknown prices render as "—", never "$0.00"
   - Unknown cost basis → P/L = null, not fabricated "+100%"
   - Delta snapshots skipped while any asset unpriced (§6.4)
   - Shared `last_known_prices` cache between Dashboard and WalletSync
   
4. **Wallet Sync Security**
   - Sanitized cache (no plaintext addresses)
   - Masked logging (§2.6)
   - Manual cost basis UI for wallet holdings
   - Password-manager pairing prevention (address and password in separate forms)
   
5. **UI/UX — Command Center Aesthetic**
   - Institutional design system (Calm Fintech v3.0) in `style.css`
   - Tabular numbers for financial data
   - Skeleton loaders, intelligence feed, evidence drawer
   - Zero inline styles, CSP-compliant

6. **Cloudflare Worker Edge Cache**
   - `/proxy` route: 60s fresh, 600s stale-while-error
   - GoPlus 4029 retry with exponential backoff
   - Optional COINGECKO_KEY / GOPLUS_KEY / BITQUERY_KEY injection
   - Host allowlist SSRF protection

7. **Pricing Failover**
   - CoinGecko → Binance → Cache chain
   - Binance fallback for CoinGecko 429/401
   - Removed CSP-blocked Coinbase/CoinCap hops

### Known Issues
1. **Evidence Drawer Unit Tests** — 49 tests failing
   - Cause: Simplified drawer implementation broke tested API
   - Fix: Restore `js/ui/evidence-drawer.js` from commit `8902c01`
   - Status: **PENDING** — requires git restore and rebuild
   
2. **CoinGecko Rate Limiting**
   - Worker proxy returns 429 from Cloudflare egress IPs
   - Workaround: Binance fallback provides core prices
   - Optional: Set valid `COINGECKO_KEY` secret on Worker
   - Status: **WORKING AROUND** — core prices functional via Binance

## Current Development Focus
**Priority:** Fix 49 Evidence Drawer unit test regressions

**Immediate Next Steps:**
1. Restore `js/ui/evidence-drawer.js` from commit `8902c01`
2. Rebuild bundles: `npm run build && npm run minify`
3. Verify: `npm run test:unit` → expect 538 passing, 0 failing
4. Commit and push

## Unresolved Questions
- [ ] What is the actual current HEAD commit? (verify with `git log --oneline -1`)
- [ ] Are there uncommitted changes in working tree? (verify with `git status`)
- [ ] Does `portfolio.js` actually implement weighted-average cost basis? (verify with `grep`)
- [ ] Does `misc.js` actually encrypt AI/Telegram credentials via `W.secureSession`? (verify with `grep`)
- [ ] Is `COINGECKO_KEY` secret set on deployed Worker? (verify with `npx wrangler secret list`)

**Action Required:** Run verification commands to resolve these questions before claiming completion.