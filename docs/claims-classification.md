# Claim Classification Convention

Status: adopted 2026-11-25 (master plan Workstream A). Applies to every
document in this repository that makes a statement about system or
product state.

## The four classes

| Class | Meaning | Allowed phrasing |
|---|---|---|
| **built** | Code, workflow, or configuration exists in the repository. No evidence of correct behavior is implied. | "implemented", "shipped", "in place" |
| **verified** | Automated or manual evidence exists for a specific claim at a specific time (test run, probe sample, checklist, artifact). Time-stamped. | "verified at <timestamp>", "evidence: <run/artifact>" |
| **passed** | A frozen gate/exit criterion is fully satisfied. Requires verified evidence for every criterion. | "PASSED", only with a link to the frozen criteria + evidence |
| **historical** | Preserved record that is NOT current. Immutable; never silently reinterpreted. | "historical", "superseded", "retained" |

## Rules

1. Infrastructure completion is **built**, never evidence of results.
   Experimental validation claims (phases 2/4) must cite recorded
   evidence, not the existence of pipelines.
2. Every "pass" claim must be traceable to a commit, workflow run,
   artifact, or probe sample. The ledger (`docs/status-ledger.yml`) is
   the index of current claims and their evidence links.
3. Historical failures (aborted/inconclusive/failed windows, incident
   records) remain immutable. A new attempt creates a NEW record; it
   never edits the old one.
4. `docs/status-ledger.yml` is the only current-state document that CI
   checks for freshness (`docs-status-check.yml`). All other status
   documents either (a) live under an explicit "current" header that
   matches the ledger, or (b) are marked historical below their header.
5. Release PRs must link the evidence artifacts that justify the
   release scope claim (beta / production / self-host-only).

## What this prevents

- Reading a stale document (e.g. a runbook describing a broken state
  that was fixed two days earlier) as current operational truth.
- Citing built infrastructure as validated performance.
- Reinterpreting a recorded FAIL as a pass after the fact.
