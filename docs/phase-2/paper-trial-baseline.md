# Phase 2 — Paper Trial Baseline

## Identity
- Baseline code commit: c07d617
- Baseline doc commit: 742ed9d
- Pre-flight decision commit: f2fcc79 (commit message contained a placeholder
  "<specific reason>"; actual decision is recorded in this file — see
  §Pre-flight decision)
- Repo: git@github.com:ibis01/weaver.git
- Baseline recorded at (UTC): 2026-10-22T<HH:MM>Z
- Recorded by: Ibismuh

## Deviations carried into the baseline
- 35ee644 → f2fcc79: branch protection bypassed on push (pull-request-required
  and test-and-build status check not satisfied). Recorded; no rule change made.
- f2fcc79 commit subject contained a literal `<specific reason>` placeholder.
  History preserved; the real reason is the Decision below.

## Trial window
- Planned window (roadmap): 2026-10-21 → 2026-10-28
- Actual start (UTC): TBD — to be filled at the moment of START decision
- Actual end (UTC): TBD — start + 7 days
- Shift reason: baseline not frozen until 2026-10-22; a trial cannot begin
  without a documented baseline.

## Active configuration (freeze — no changes permitted mid-trial)
- Chains enabled: <list>
- Min score threshold(s): <values>
- Risk verdict gates: pass / caution / danger / unknown (as coded)
- Smart-money thresholds: <as coded>
- Wallet-graph CONF: STRONG 0.85 / MEDIUM 0.60 / WEAK 0.35
- Deployer store max: 500
- Shield cache TTL: 300 s
- Auto-scan interval: 5 min (if armed)

## Data providers enabled
- DEX Screener (boosts, profiles, pairs)
- CoinPaprika trending
- GoPlus (EVM) / RugCheck (Solana)
- honeypot.is (EVM excluding Base)
- Worker /discovery/snapshot (primary when available)
- D1 price_snapshots (Worker cron, 15 min)
- Helius (Solana fee-payer extraction)
- <any others>

## Meaning of every recorded signal status
- DIRECT_ORIGINATOR — evidence supports the wallet as the direct transaction originator.
- TRACED_ECONOMIC_RECIPIENT — evidence supports the wallet as economic recipient
  after tracing relevant flows.
- INTERMEDIARY — appears in the transaction path but is not established as the buyer.
- UNRESOLVED — available evidence cannot establish the role.
- REJECTED — evidence supports excluding the candidate under documented rules.
- ERROR — verification could not complete (technical or provider failure).

## Logging and failure handling
- Provider failures MUST produce ERROR/UNRESOLVED, never a silent negative.
- Token Shield rejections take precedence over positive signals.
- Duplicate alerts deduplicated via localStorage `gems.recent.v1` and seen map.
- Alerts persisted to Worker `/meme/alert`.
- Reconstructability: every alert record must contain token + chain + assessment
  + market snapshot + timestamp sufficient to replay.

## Rules for evaluating the trial
- The trial measures operational reliability, NOT predictive ability.
- No threshold changes are permitted mid-trial.
- If a critical defect invalidates the data, record the interruption and the
  affected time range; determine whether it must be repeated. Do not combine
  incompatible configurations.
- Final report must identify: total alerts, unique tokens, provider failures,
  duplicates, missing-evidence cases, misclassified attributions,
  system interruptions, reconstructability rate.
- Exit rule: results are NOT evidence of trading skill.

## Pre-flight decision
- Pre-flight report: docs/phase-2/preflight-<UTC>.md
- Check 1 (REJECTED attribution): <PASS|BLOCKED> — <evidence line or reason>
- Check 2 (silent catches): <PASS|BLOCKED> — <evidence line or reason>
- Check 3 (/meme/alert reconstructability): <PASS|BLOCKED> — <evidence line or reason>
- Decision: <START|BLOCKED>
- If START — actual start timestamp (UTC): 2026-10-22T<HH:MM>Z
- If BLOCKED — in-phase fix required before start: <one sentence naming the
  check that failed and the file that must change>