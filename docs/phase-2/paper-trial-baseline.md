# Phase 2 — Paper Trial Baseline

## Identity
- Baseline commit: c07d617
- Commit subject: feat(phase-5): wire evidence synthesizer into gem thesis generation (text only, no decision-logic change)
- Repo: git@github.com:ibis01/weaver.git
- Baseline recorded at (UTC): YYYY-MM-DDTHH:MM:SSZ
- Recorded by: Ibismuh

## Deviations from prior baseline (d58d43c → c07d617)
- Phase 5 narrow wiring of W.evidenceSynthesizer.synthesize() into autoCreateThesis.
- Removed two dead placeholder comments in _scanImpl.
- Added a null-guard around W.predictiveValidator in the #g-validate handler.
- No changes to: thresholds, scoring weights, Token Shield, evidence-sufficiency rules,
  wallet attribution, or decision engine.
- Note: branch protection rule ("pull request required" + "test-and-build" status
  check) was bypassed on push. Recorded as a deviation; no rule change was made.

## Trial window
- Planned window (roadmap): 2026-10-21 → 2026-10-28
- Actual start (UTC): YYYY-MM-DDTHH:MM:SSZ
- Actual end (UTC): YYYY-MM-DDTHH:MM:SSZ (to be filled at close)
- Reason for shift: baseline not frozen until 2026-10-22; trial cannot begin without
  a documented baseline.

## Active configuration (freeze — no changes permitted mid-trial)
- Chains enabled: <list>
- Min score threshold(s): <values>
- Risk verdict gates: pass / caution / danger / unknown (as coded)
- Smart-money thresholds: <values as coded>
- Wallet-graph thresholds (CONF.STRONG / MEDIUM / WEAK): 0.85 / 0.60 / 0.35
- Deployer store max: 500
- Shield cache TTL: 300 s
- Auto-scan interval: 5 min (if armed)

## Data providers enabled
- DEX Screener (boosts, profiles, pairs)
- CoinPaprika trending (via W.api.trending)
- GoPlus (EVM) / RugCheck (Solana)
- honeypot.is (EVM excluding Base)
- Worker snapshot (/discovery/snapshot) as primary when available
- D1 price_snapshots (Worker cron every 15 min)
- Helius (Solana fee-payer extraction)
- <any others: list>

## Meaning of every recorded signal status
- DIRECT_ORIGINATOR — evidence supports the wallet as the direct transaction originator.
- TRACED_ECONOMIC_RECIPIENT — evidence supports the wallet as economic recipient
  after tracing relevant flows.
- INTERMEDIARY — appears in the transaction path but is not established as the buyer.
- UNRESOLVED — available evidence cannot establish the role.
- REJECTED — evidence supports excluding the candidate under documented rules.
- ERROR — verification could not complete (technical or provider failure).

## Logging and failure handling
- Provider failures MUST produce ERROR / unresolved states, never a silent negative.
- Token Shield rejections take precedence over positive signals.
- Duplicate alerts deduplicated via localStorage `gems.recent.v1` and seen map.
- Alerts persisted to Worker `/meme/alert` (payload contains assessment + market snapshot).
- Reconstructability: every alert record must contain enough to replay the assessment
  against its original inputs.

## Rules for evaluating the trial
- The trial measures operational reliability, NOT predictive ability.
- No threshold changes are permitted mid-trial.
- If a critical defect invalidates the data, record the interruption and the affected
  time range; determine whether that range must be repeated. Do not combine
  incompatible configurations.
- Final report must identify: total alerts, unique tokens, provider failures,
  duplicate signals, missing-evidence cases, incorrect classifications,
  system interruptions, reconstructability rate.
- Exit rule: results are NOT evidence of trading skill. Any such claim is forbidden.
## Pre-flight decision
- Pre-flight report: <paste the preflight filename>
- Check 1 (REJECTED attribution): PASS
- Check 2 (silent catches):   PASS
- Check 3 (reconstructability): PASS
- Window: 2026-10-22T__:__Z → 2026-10-29T__:__Z (Option A — shifted one day,
  baseline not frozen until 2026-10-22; reason documented)
- Decision: **START**
