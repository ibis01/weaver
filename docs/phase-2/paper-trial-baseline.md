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
- Actual start (UTC): 2026-10-22T19:07:44Z
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
- Pre-flight evidence:
  - Check 1 (REJECTED attribution): PASS at 9c18b9b — three emit sites
    in wallet-history.js (mint branch, CEX inbound branch, wallet-level
    exclusion); empty-array caching removed; cache key bumped v2 → v3
    at b45db6a.
  - Check 2 (silent catches): PASS at b45db6a — deployer-graph.js:255
    is a structuredClone/JSON fallback chain, not a provider swallow;
    deployer-graph.js:406 now records highRiskUnknown and qualifies the
    summary; wallet-history.js and predictive-validator.js carry no
    silent provider catches.
  - Check 3 (/meme/alert reconstructability): PASS at 9c18b9b —
    handler persists assessment + market{priceUsd, liquidityUsd,
    observedAt} + pairAddress + symbol + receivedAt; KV key encodes
    chain + tokenAddress + observedAtMs.
- Decision: START
- Actual start timestamp (UTC): 2026-10-22T19:07:44Z
- Planned end timestamp (UTC): 2026-10-29T19:07:44Z
- Window shift note: roadmap window was 2026-10-21 → 2026-10-28;
  baseline was not frozen until 2026-10-22, so the trial is shifted
  one day. Duration remains seven full days.

## Deviations carried into this baseline
- Branch protection on refs/heads/main has been bypassed on multiple
  pushes during the pre-flight phase (pull-request-required and
  test-and-build status check not satisfied). Recorded here; no rule
  change was made. Once threshold changes begin in Phase 6, PR
  discipline must be restored.
- f2fcc79 commit subject contained a literal `<specific reason>`
  placeholder. History preserved. The real reason is this section.
## Additional deviations (recorded 2026-10-22)
- Two commits in the pre-flight history carry literal placeholder subjects
  and record no specific reason:
    * f2fcc79 — "pre-flight BLOCKED — <specific reason>"
    * 4376551 — "BLOCKED — <check name> failed; in-phase fix required before start"
  History preserved per roadmap Phase 0 rule. The actual blockers that
  prompted those commits — and their fixes — are recorded in
  §Pre-flight decision above and in commits 9c18b9b and b45db6a.

## Trial restart — window 2

### Previous window (ABORTED, preserved as audit record)
- Window: 2026-10-22T19:07:44Z → 2026-10-29T19:07:44Z
- Status: **ABORTED**
- Reason: `persistMemeAlert` fired only inside the smart-money notification
  gate, so only converged alerts could ever reach the KV store. Zero
  non-converged alerts were recorded during the window. The pre-registration
  §Control definition requires a non-converged control cohort; without one,
  the eventual Mann-Whitney U comparison (Issue D) is not computable.
- Fix landed: `fix(phase-4): persist non-converged alerts to enable control
  cohort` — the persistence call was moved outside the notification gate.
  `test/unit/gems-persist.test.js` asserts that a non-converged alert with
  score >= 70 is persisted.
- The window is not being extended or merged with the new window.

### New window (ACTIVE)
- Baseline code commit: 76e71f7
- Baseline is CI-green (`Test and Build` run 39980710999, 2m58s)
- Start (UTC): 2026-10-23T15:55:17Z
- Planned end (UTC): 2026-10-30T15:55:17Z
- Duration: 7 days
- Config freeze: identical to the previous window — no threshold changes
  permitted mid-trial.
- Restart condition verified: persistence gate fixed; new test passes;
  full suite green at 706 + 30 + 16 passing, 0 failing.

### What "restart" means here
- The trial clock is real from 2026-10-23T15:55:17Z.
- Day entries are recorded honestly, one per calendar day, from that point.
- A day that produces zero alerts is not edited to look like a day that
  produced alerts. If the persistence fix does not produce non-converged
  alerts within 24h, the log must say so and that is a Phase 4 defect to
  investigate — not a day to fabricate.
- The trial exit rule remains: results are NOT evidence of predictive
  ability. Operational reliability only.
