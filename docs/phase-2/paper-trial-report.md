# Phase 2 — Paper Trial Report

- Baseline commit: 76e71f7 (window 2 restart baseline)
- Start (UTC): 2026-10-23T15:55:17Z
- End (UTC): 2026-10-30T15:55:17Z
- Duration: 7 days (window ran to completion; no extension)
- Verification boundary: 1792775127260 (bundle ?v=20261023d; unchanged for
  the entire window — dist/ byte-identical across the window's commits)
- Outcome: **INCONCLUSIVE** (minimum-observations gate not met: 0 cohort
  observations of the required 10 per cohort)

## Outcome statement
The trial clock ran to completion, but the provider outage that began
before the window started never lifted: every shield check in the window
returned GoPlus HTTP 429 (keyless-access throttling). The pipeline behaved
as designed — verdict UNKNOWN → score < 70 → persistence gate stayed
silent — so no cohort observation was produced. Per the pre-registration
(Issue D, MIN_OBSERVATIONS_PER_COHORT = 10), a window that ends below the
gate is INCONCLUSIVE. This is an operational-reliability result, reported
as such.

## Completion checklist (roadmap Phase 2)
- [x] Trial duration and baseline are documented. (paper-trial-baseline.md
      window 2 §; log Day 1 entries; this report)
- [x] Signals are recorded consistently. (buys collector ran throughout;
      the outcome-recording pipeline was verified end-to-end on Day 1 but
      produced zero records due to the provider outage)
- [x] Failed requests and incomplete data are visible. (429 documented in
      the log from 2026-10-24; root cause diagnosed 2026-10-25; the
      2026-10-25 → 2026-11-01 gap reconstructed and recorded 2026-11-01)
- [x] Critical failure paths behaved correctly. (persistence gate stayed
      silent rather than persisting unverified verdicts; no fabricated
      day entries)
- [x] Trial records can be independently reviewed. (every claim carries a
      commit SHA, timestamp, or file reference)
- [x] Data-quality problems and operational limitations identified.
      (see Failure-mode summary)

## Failure-mode summary
- Provider failures: GoPlus API 429 for the entire window (keyless access
  deliberately throttled by the provider; cf-worker/index.js sent no
  Authorization header). Secondary: Worker `/etherscan/deployer` 502
  (known defect, unrelated to cohorts).
- Missing evidence: 0 cohort observations (control and treatment).
  In-window buys (exposure signals, not outcomes): 4 —
  2026-10-26T02:07:35Z, 2026-10-29T23:32:11Z, 2026-10-30T04:48:59Z,
  2026-10-30T13:23:59Z (data/prospective/buys.jsonl @ 28b6c24).
- Duplicates: 1 apparent duplicate pair (identical timestamp
  2026-10-23T12:53:11Z; bot and local collector logged the same buy).
  Pre-window and excluded; dedupe by tx identifier remains mandatory for
  any future analysis.
- Classification defects: 0 (no outcome records were produced; the 176
  historical KV alerts predate the verification boundary, show
  `cohort: MISSING`, and remain excluded).

## Operator gap (recorded honestly)
The root cause was diagnosed on 2026-10-25 and a verified fix (bearer
auth + daily budget guard + stale-on-error fallback; patch sha256
239f9bfd…) existed 5 days before the window closed. It was not deployed.
The execution gap 2026-10-25 → 2026-11-01 is an operator failure and is
recorded here as such. The fix itself is instrumentation-only: no
scoring, threshold, cohort, or persistence-gate change; no bundle change
(verification boundary preserved).

## Reconstructability
- Sampled: 0; reconstructed: 0; rate: n/a.
- Method: outcome reconstruction remains available via replay of stored
  assessment + market data, but there are no in-window outcome records to
  sample. Buys rows carry collector state and are committed
  (0e23278, aef49bc, 28b6c24).

## Limitations and exclusions
- Single-operator dependency: the log has no entries for 2026-10-25 →
  2026-10-30; the gap entry reconstructs those days from committed
  evidence, not contemporaneous notes.
- All pre-boundary alerts (176 in KV + 17 boundary-straddling) are
  excluded per the window 2 restart record.
- The GoPlus enrichment path in js/features/gems.js (browser-side,
  keyless) was out of scope and unchanged; it does not gate persistence.

## Disposition
Window 2 is closed as INCONCLUSIVE. The report template sanctions
"the repeated window if a blocker occurred", and the baseline carries the
window 1 → window 2 restart precedent. A window 3 restart is declared in
paper-trial-baseline.md (§Trial restart — window 3) with activation
preconditions: the GoPlus fix deployed and probe-verified, in-app shield
verdicts confirmed non-UNKNOWN, new baseline commit hash recorded, and a
fresh start timestamp recorded before the first scan. Window 2 is not
extended or merged with window 3.

## Explicit statement
This report establishes operational reliability, not predictive ability.
No performance claim is made. Predictive validation is Phase 4 and
remains BLOCKED pending the D1 horizon data and a pre-registered experiment.
