# Phase Status — as of 2026-11-08T18:30:00Z

Current HEAD at update: `16815e6` (merge of PR #28). Baseline doc lineage:
this file supersedes the 2026-10-22 summary below; all historical dated
sections are preserved unmodified.

Infrastructure vs validation — read this first: everything marked
"infrastructure" below describes BUILT capability, not validated results.
Experimental validation (phases 2/4) is only as strong as its recorded
evidence; do not cite infrastructure completion as a performance claim.

## Phase 0 — Foundation: PARTIAL (re-verified 2026-11-08, evidence explicit)
- aw-nic-verify-v11.js at HEAD 16815e6 (Node 22.23.3): **406 checks
  passed / 10 DIFF, exit 1**. All 10 DIFFs are `legacy:` v1.0-table
  comparisons — the documented, expected deltas of the v1.1 amendment
  chain. The v1.1 artifact itself PASSES (verdict line: `P4 v1.1 PASS`,
  min IQR_w 0.2 ≥ 0.10 gate; amendment-chain hash checks pass).
- The historical "416 checks / 0 DIFF" result is NOT reproducible
  post-amendment and must not be cited as current.
- aw-nic-verify-frozen.js reports FAIL/exit 1 on the superseded v1.0
  artifact — expected.
- Follow-up (not done): classify documented amendment deltas separately
  in the verifier so exit code matches the verdict line.

## Phase 1 — Trustworthy signals: PARTIAL
- Unchanged from the 2026-10-22 assessment; not independently audited.
  NOT marked PASS.

## Phase 2 — Paper trial: ACTIVE — Window 3 (protect until close)
- Window 3 STARTED 2026-11-08T13:16:47Z, closes 2026-11-15T13:16:47Z.
  Baseline e7afc81. Threshold 70. Automated scans: cron every 2h
  (even hours UTC); round 1 (14:00 UTC) recorded 0 in-window alerts.
- Prior windows: window 1 ABORTED (persistence-gate defect, see
  2026-10-23 sections), window 2 INCONCLUSIVE (PR #25).
- Do NOT lower the threshold or touch scan configuration before close.

## Phase 3 — Smart-money: PARTIAL
- Unchanged: Gate 0B evidence, reproducible candidate discovery,
  attribution validation against known examples, and convergence
  independence remain to be documented as verified.

## Phase 4 — Predictive validation: BLOCKED (mechanical root cause FOUND + fix shipped 2026-11-08)
- The Gate 0d outcome pool could never resolve: the only price history
  ended at the freeze moment, `unresolved` was terminal in the scorer,
  and no pipeline step refreshed prices. See
  docs/audits/gate-0d-reconciliation-2026-11-08.md (§3 RC-3/RC-4).
- Fixed in this branch: scorer retry-eligible-unresolved ledger,
  price-history refresh step in gate-0d-collect.yml, historical data
  reconciled (17→10 buys, 4→3 outcomes, counter 16→10, originals
  archived + hashed). All 3 unresolved outcomes are resolvable at the
  next weekly run (2026-11-15) — through the workflow, not by hand.
- No pre-registered baseline, no walk-forward evaluation, no
  negative-outcome accounting yet. No performance claim is made.

## Phase 5 — Reasoning layer: PARTIAL
- Unchanged: evidence synthesizer wired (c07d617); completion criteria
  (uncertainty explicit, conflicting evidence reported,
  replay-from-evidence, AI cannot bypass deterministic checks) not yet
  verified.

## Phase 6 — Continuous learning: NOT STARTED

## Gate status (2026-11-08)
- **Gate 0b** — PARTIAL: reproducible candidate discovery, known-example
  attribution validation and convergence-independence evidence still
  required.
- **Gate 0c** — OPEN: PR #23 awaits external-auditor acknowledgment. Do
  not treat as passed.
- **Gate 0d** — CORRECTED 2026-11-08: collector dedupe (PR #24,
  prospective-only) + historical reconciliation (this branch) + scorer
  ledger fix + price pipeline. Residual: outcome resolution now resumes
  via the weekly workflow; next evidence at the 2026-11-15 run.

## Known deviations
- Branch protection on refs/heads/main was bypassed on pushes from
  f2fcc79 through 7d975ed (2026-10-22 era). RESTORED IN PRACTICE:
  PRs #24, #25, #26, #27, #28 all merged through PRs with green CI
  (through 2026-11-08). Historical note preserved below.

## Phase 4 — pre-registration interpretation note (2026-10-22)

The pre-registration's unit ("one alert = one observation") is
unambiguous for deduplication, but ambiguous for cohort analysis when
the scanner re-fires on the same token within a short window. Observed
in the 2026-10-05 batch: token
`12xjqnGsRxQHwWiTDETQxzUmrBgp4ARqWDKXQfjvpump` appears 6 times within
40 minutes. Two interpretations are possible; the evaluation report
must declare which it used:

  (A) Strict: each alertId is one observation.
  (B) Per-token-per-window: same token within 1 hour = one observation.

Also noted: the KV store currently contains 100 alerts from
2026-10-05, all of which predate the trial start (2026-10-22T19:07:44Z).
Whether they count toward the trial population is a similar open
question and must be declared in the evaluation report.

## Commit hygiene note — 2026-10-22
- Commit `cc1b797` was intended to remove js/features/shield.min.js and
  classify two Worker-only modules in the guard-fallback invariant, but
  it committed neither change. It included unrelated `assets/` edits and
  the (non-functional) reset additions to gems.js and test/setup.js.
- History is preserved per roadmap discipline; the actual fixes land in
  the follow-up commit.
- Once follow-up lands and `npm test` is green, branch protection can be
  re-enabled in the repository settings so this cannot recur.

## Phase 4 — persistence gate discovery (2026-10-23)
- `persistMemeAlert(g)` fires only inside the smart-money notification gate
  in `gems.js:_scanImpl`. Non-converged alerts are never persisted.
- Pre-registration §Control definition requires both converged and
  non-converged alerts to be recorded for the cohort comparison.
- Without non-converged alerts, Phase 4 has no control cohort and the
  pre-registered Mann-Whitney U test (Issue D) cannot be run honestly.
- Deferred to after the trial closes (2026-10-29T19:07:44Z) to preserve
  trial data consistency. Fix will split the persistence path from the
  notification path and be committed as:
    fix(phase-4): persist non-converged alerts to enable control cohort

## Test hygiene note — 2026-10-23
- `test/setup.js` still contains a dead `beforeEach` that calls
  `resetDeployerBackoff()`. It is a no-op (the per-file `beforeEach`
  in gems-deployer.test.js is what actually resets the backoff between
  tests), but should be removed in a future cleanup commit. Not removed
  during the current Phase 2 window to avoid re-testing a green state.

## Phase 2 — trial aborted (2026-10-23)
- Trial window 2026-10-22T19:07:44Z → 2026-10-29T19:07:44Z produced zero
  usable observations due to the persistence-gate defect.
- The trial was aborted, not failed. It will be restarted after the
  persistence gate is fixed and a new baseline is committed.
- A new 7-day window will be recorded with fresh start/end timestamps.
## Phase 4 — persistence gate fix (2026-10-23)
- Persistence gate moved outside the smart-money notification gate in
  `gems.js:_scanImpl`. Non-converged alerts are now persisted, enabling
  the control cohort required by pre-registration §Control definition.
- This unblocks Phase 4's eventual cohort comparison. Prior trial window
  2026-10-22T19:07:44Z → 2026-10-29T19:07:44Z was ABORTED because it
  produced only converged observations (0 data, no control cohort).
- New trial window to be recorded after this fix is committed.

## Phase 4 — persistence gate fix (2026-10-23)
- Persistence gate moved outside the smart-money notification gate in
  `gems.js:_scanImpl`. Non-converged alerts are now persisted, enabling
  the control cohort required by pre-registration §Control definition.
- Prior trial window 2026-10-22T19:07:44Z → 2026-10-29T19:07:44Z was
  ABORTED because it produced only converged observations (0 usable
  data, no control cohort).
- New trial window to be recorded after this fix is committed.

## Commit hygiene note — 2026-10-23
- Commit `76e71f7` is titled "docs(phase-4)…" but also contains the rebuilt
  `dist/bundle.js` and `dist/bundle.min.js`. This is what resolved the
  `dist/ is stale` CI failures for all subsequent commits. Going forward:
  any commit that touches `js/` MUST include the rebuilt `dist/` in the
  same commit. Consider a pre-commit hook to enforce this.

  ## Phase 4 — persistence fix is insufficient without cohort marking (2026-10-23)
- `persistMemeAlert` now fires for both converged and non-converged alerts
  (window 2 fix), but the persisted `assessment` payload does not include a
  `cohort` field or `hasConvergence` marker.
- The pre-registration §Control definition requires the control cohort to
  be identifiable from the record. Without a cohort marker, the eventual
  Mann-Whitney U comparison (Issue D) cannot split observations into
  treatment/control without re-running smart-money evaluation retroactively
  against historical state — which is not reproducible.
- Fix required before window 3 starts: `persistMemeAlert` must include
  `cohort: sm.hasConvergence ? "treatment" : "control"` (or equivalent) in
  the payload. This is a small change in `js/features/gems.js` at the point
  the payload is constructed.

## Session record — 2026-11-08
- PR #24 (gate-0d collector tx-hash dedupe + honest partial-run status)
  MERGED after green CI.
- PR #25 (window 2 closeout, INCONCLUSIVE, window 3 restart declared)
  MERGED.
- PR #26 (premium Linear-dark CSS polish) MERGED — live on Pages.
- PR #27 (shield tri-state LP-lock + defensive flag coercion) opened:
  GoPlus is_locked/is_contract arrive as number or string depending on
  endpoint/version; strict numeric compare could misreport a locked LP
  as unlocked. Now tri-state with unknown-degradation, unit-tested.
- Branch cleanup: 10 stale branches deleted (superseded or
  already-merged content), 161 stale bot/news-snapshot-* branches
  deleted. Remaining: fix/gate-0c-restore-and-sidecar (PR #23, still
  gated on external auditor acknowledgment).
- Window 3 activation preconditions (a) and (b) VERIFIED — evidence in
  paper-trial-log.md (2026-11-08 entry). (c)/(d) remain for window
  start. Clock NOT started.
- Known CI observation: Playwright critical-path E2E depends on live
  upstream providers; a provider outage can fail CI on main (observed
  2026-11-08T12:44Z on the premium-dark merge). Test-infra follow-up:
  route-mock provider calls in E2E so CI is hermetic.

## Session record — 2026-11-08 (premium follow-ups)
- Window 3 STARTED — baseline e7afc81, start timestamp
  2026-11-08T13:16:47Z recorded in paper-trial-log.md (preconditions
  (c) and (d) satisfied). Day-1 scan pass executed.
- Premium follow-ups shipped on feat/premium-followups-2026-11-08:
  wrapped-token index coverage (prices.js), /etherscan/deployer 24h
  KV cache (cf-worker, cache reads precede the budget check, only
  successes cached), test hygiene (dead global beforeEach removed).
- Telegram alert wiring completed: smart-radar-auto.js now notifies
  (opt-in, fire-and-forget) on the same eligibility gate as
  persistence (ok === true && SMART_MONEY_ENTRY). Dedup key is
  per-token-per-session, matching the gems.js precedent. Message
  bodies are HTML-escaped. 11 new unit tests (eligibility gate,
  escaping, fallbacks, hostile-input safety, runCycle wiring both
  ways). Suite: 728 unit / 30 integration / 16 security, run under
  pinned Node 22.23.3; dist/ rebuilt with the same pin.
- Remaining known gap: Playwright E2E still depends on live
  upstreams (see 2026-11-08 session record) — hermetic route-mock
  conversion pending.
- Playwright E2E converted to hermetic CI (closes the 2026-11-08 CI
  observation): test/e2e/fixtures.js installs a page-level route
  interceptor that serves deterministic vendor-shaped payloads
  (CoinLore, CoinPaprika, Coinbase, Alternative.me, Binance) for
  both the worker /proxy walk and direct DIRECT_ONLY hits, answers
  worker-native endpoints with deterministic 502 (exercising the
  documented refusal-fallthrough and error paths), and aborts every
  other non-localhost request so no test traffic reaches the live
  internet. Interception is at the network edge only: the app runs
  its real fetch path (proxy walk, cache, schema validation,
  normalization). Per-test route overrides still win (Playwright
  LIFO) — dashboard-acceptance offline-resilience cases unchanged.
  Escape hatch: WEAVER_E2E_LIVE=1 skips mock installation for
  explicit live smoke runs; never set in CI. All 6 specs now import
  the fixture. 36/36 E2E green twice consecutively.

## Session record — 2026-11-08 (Gate 0d reconciliation)

Independent audit finding accepted and corrected on
fix/gate-0d-reconciliation-2026-11-08. Full narrative + hashes:
docs/audits/gate-0d-reconciliation-2026-11-08.md.

- **Verified the finding first**: 17 buy rows / 10 unique txHash / 7
  dupes; 4 outcome rows / 3 unique; counter 16; all outcomes unresolved.
- **Forensics**: 11-08 weekly collection ran ~8h BEFORE PR #24 merged —
  its 6 duplicates are pre-fix contamination; the counter equation is
  exact (2+1+6+7=16; the 10-24 local-run row never touched state.json).
- **Correction**: originals archived byte-exact
  (data/prospective/archive/2026-11-08-pre-reconciliation/ + SHA256SUMS);
  canonical datasets written by committed, idempotency-guarded script;
  buys_collected 16→10; state.json carries a machine-readable
  reconciliation block.
- **Scorer fixed** (RC: `unresolved` was terminal): outcomes.jsonl is now
  formally an append-only attempt ledger, latest row per txHash wins,
  resolved is terminal, unresolved is retry-eligible, one attempt per
  tx per run. 9 new unit tests. Suite 737/30/16 under Node 22.23.3.
- **Price pipeline added** (RC: series frozen at freeze moment, never
  refreshed): scripts/oneoff/fetch-pepe-prices.js + workflow step
  (continue-on-error). Validated: 366 pts, 2025-11-09 → 2026-11-08.
- **Outcome recovery**: all 3 unresolved outcomes verified resolvable
  (read-only check) at the next weekly run 2026-11-15. NOT hand-resolved.
- **Phase 0 re-verified**: aw-nic-verify-v11.js = 406/416 + 10 DIFF
  (legacy v1.0 comparisons, expected post-amendment), exit 1; v1.1
  artifact verdict PASS. Historical 416/0 claim retired.
- **Untouched**: Phase 2 Window 3 config + scan data, thresholds, PR #23,
  all freeze-pinned artifacts.
