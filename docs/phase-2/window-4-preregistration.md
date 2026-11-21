# Window 4 — Pre-Registration Protocol

- **Status**: PRE-REGISTERED 2026-11-21, **before** discovery-v3 deployment.
  As of this recording the live worker still reports
  `_meta.methodologyVersion = "discovery-v2"` (live probe
  2026-11-21T22:23Z). No v3 data exists; nothing in this document was
  written with knowledge of post-deploy outcomes.
- **Deviation policy**: any change to this protocol must be logged as a
  dated amendment in §Amendment log BELOW the original text, **before**
  the affected analysis is run. Post-hoc changes without a logged
  amendment invalidate the window.
- **Supersedes nothing; extends** the Window 4 gate defined in
  `paper-trial-log.md` §"Window 3 — CLOSEOUT" → §"Decision — Window 4
  gate".

## 1. Purpose (unchanged from prior windows)

Operational reliability of the alert pipeline under the repaired feed.
Trial exit rule unchanged: **results are NOT evidence of predictive
ability** — operational reliability only.

## 2. Preconditions to open (exactly the closeout gate)

Window 4 opens ONLY after all of the following are recorded in the trial
log:

1. **discovery-v3 verified live**: `GET /discovery/snapshot` shows
   `_meta.methodologyVersion = "discovery-v3"`, ~40 tokens with real
   `volume24h` / `pairCreatedAt` / `priceChange`, and per-token
   `sources` + `sourceCounts` present in `_meta`.
2. **24h soak**: `GET /discovery/health` shows the `memeFunnel` block
   populated (v3-only field), and at least one COMPLETED automated scan
   round ran against the live v3 feed.
3. **Deploy timestamp recorded**: the actual first v3 deploy time + build
   ID recorded in the trial log (resolves the Day-3 discontiguity
   placeholder).

## 3. Frozen configuration (carried unchanged)

- Persistence gate: score ≥ 70 (unchanged since window 1).
- Scoring: `meme-opportunity-v1` untouched.
- Cohort definition: treatment = smart-money convergence at alert time;
  control = non-converged alert (written by the post-fix persistence
  path). Unchanged.
- Store: KV `MEME_ALERTS`, record type `meme-alert-v2`.
- Worker cron: `*/15` snapshot refresh; scan rounds on the documented
  2-hour cadence; any observer gap ≥ 24h requires an outage note.

## 4. Window mechanics

- **T0** (fresh start timestamp, epoch ms) is recorded in the trial log
  BEFORE the first scan of the window. Window = T0 → T0 + 7 days.
- **Baseline commit hash** recorded at open (must include this
  pre-registration and the deploy-time trial-log fill; Pages/worker at
  the verified deploy).
- Pre-window KV baseline re-measured at T0 by full-store pagination
  (expected ≥ 933 records; latest pre-window receivedAt expected
  2026-10-23T16:54:00.509Z unless store mutates before T0 — any
  unexpected mutation before T0 must be investigated and logged BEFORE
  opening).
- In-window population: all alerts with `receivedAt ≥ T0`. All are
  post-fix (carry cohort) and post-repair (discovery-v3 candidate pool);
  no pre-repair contamination is possible because v3 deploys before T0.
  Window 3's population (empty) is not merged into this window.

## 5. Pre-registered analysis plan

- **Primary — alert production** (same criterion as Window 3's verdict):
  Window 4 PASSES alert production iff **≥ 1 in-window alert** is
  persisted during the 7 days. Zero → FAIL, with the live-feed health
  evidence required to distinguish "empty funnel again" from "funnel
  populated but gate never fired".
- **Secondary — persistence integrity**: every in-window row carries
  `assessment.cohort ∈ {treatment, control}`; record type
  `meme-alert-v2`; store total = pre-window baseline + N (no loss, no
  schema drift). Any row missing cohort → integrity FAIL (write-path
  regression), reported separately from alert production.
- **Exploratory — cohort distribution** (descriptive only, NO
  performance claim): treatment/control split of in-window alerts.
  Outcome analysis of alerts is out of scope for this window (the Gate
  0d outcome machinery applies to the `prospective/buys` ledger, not to
  meme alerts; wiring it is a separate pre-registration).
- **Scan-round ledger**: appended per the 2-hour cadence, batched daily,
  same table format as the Window 3 closeout.

## 6. Abort / invalidation conditions (any one closes the window as INVALID)

1. `_meta.methodologyVersion` observed as anything other than
   `discovery-v3` at any mid-window probe.
2. Any change to threshold, scoring, cohort definition, or store schema
   mid-window.
3. KV anomaly: missing cohort fields on in-window rows, unexplained
   total-count drift, or loss of pre-window records.
4. Failure to record an observer gap ≥ 24h (undocumented silence
   discovered at closeout invalidates the ledger, hence the window).

Note: deploying additional non-discovery code mid-window does NOT abort
the window, but the baseline note must be appended with the new commit
hash — silent drift is what invalidates, documented drift does not.

## 7. Closeout evidence queries (identical to Window 3 closeout)

- `GET /meme/alerts?since={T0ms}` → in-window rows.
- `GET /meme/alerts?limit=2000` → full-store count + latest receivedAt.
- `GET /discovery/snapshot` → methodologyVersion + sourceCounts (v3
  health of the feed through the whole window).
- `GET /discovery/health` → memeFunnel stats.
- Scan-round ledger vs. 2-hour cadence → observer-gap accounting.

## 8. Status vocabulary

Verdicts use the established vocabulary: PASS / PARTIAL / FAIL /
BLOCKED / NOT VERIFIED. Window 4 cannot be judged "PASS" on efficacy —
only on operational reliability (alert production + persistence
integrity). Phase 2 as a whole remains NOT PASSED regardless of this
window's outcome; efficacy claims require a separate pre-registered
evaluation.

## Amendment log

(empty — no amendments as of pre-registration)
