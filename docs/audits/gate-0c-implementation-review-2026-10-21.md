> **RECONCILIATION UPDATE — 2026-10-21.** This review was authored before
> the recovery commit (f86d19f). The artifacts it describes as missing
> (the amended P4 v1.1 JSON and Markdown) were subsequently recovered and
> committed. The independent verifier (`scripts/aw-nic-verify-v11.js`)
> now reports 416/416 checks passed against the recovered bytes.
>
> **What remains valid from this review:** The finding that the amendment
> was not present at the time of review. The requirement for an
> independent verifier. The HOLD status as of the earlier timestamp.
>
> **What is now superseded:** The specific claims that the amended
> artifact is missing, that the patch is absent, and that P4 FAIL is the
> only verifiable state. Those conditions have been resolved by the
> recovery commit.

---

# Gate 0c — Independent Implementation Review (2026-10-21)

**Scope:** verification of the reported "Amendment v1.1" implementation (F6 reclassification of G1
as descriptive; F7 Branch-P selection; P4 re-execution PASS under amended rules; frozen FAIL
preserved; 245-line patch). This review executes Checks A/B/C from the Gate 0c review directive
using on-disk and upstream evidence only.

**Method.** Inspected: sandbox worktree (every gate-0c file, all scripts, download copies, file
mtimes), sandbox git state (status, log, stash), upstream `origin/main` fetched read-only
(`11d99d2..d4c91b0`, 17 commits), pickaxe searches over the **full** upstream history, all four
frozen input anchors recomputed, and a fresh independent reimplementation of every recorded P4
assertion (`scripts/aw-nic-verify-frozen.js`, 188 assertions, read-only). Not inspected: the
user-machine working tree and the protected `stash@{0}` (unreachable from here; safe inspection
commands in §4.6).

## Verdict

**The reported implementation is NOT certifiable: none of its artifacts exist — not in the
worktree, not in scripts, not in download copies, not in any commit, not in any reachable stash.
The frozen P4 FAIL baseline, by contrast, is fully verified (188/188 independent recomputation,
all input anchors intact locally and upstream). The gate remains HELD. Nothing is authorized.**

| Review object (as reported) | Existence checked | Result |
|---|---|---|
| Amendment v1.1 applied to the prereg | worktree, mtimes, upstream pickaxe | **absent** |
| 245-line patch | glob `**/*.{patch,diff}`, prereg diff-state | **absent** |
| Branch P anti-degeneracy guard (binding text) | grep docs/experiments, upstream pickaxe | **absent** |
| Branch Q documentation | grep docs/experiments, upstream pickaxe | **absent** |
| Two binding qualifications on `0.10` | grep docs/experiments, upstream pickaxe | **absent** |
| New P4 artifact (amended PASS, dated) | worktree, download, upstream tree | **absent** |
| Frozen P4 FAIL artifact unchanged | sha256 + independent recomputation | **verified intact** |
| Computation machinery reproduces | 188-assertion fresh reimplementation | **verified 188/188** |
| Git: no commit made | sandbox log + upstream log | **confirmed** |

## 1. Check A — amendment and patch: FAILS (nothing to inspect)

The sandbox prereg is byte-identical to its Task-15 state (571 lines; mtime 2026-10-20 13:31 UTC;
sha256 `85468ac7…` recorded in §6). It contains zero occurrences of "Amendment v1.1", "Branch P",
or "Branch Q". §4.4 still registers F6 (options i/ii/iii) and F7 (options a/b/c) as **open flags
without disposition**, exactly as left before the implementation report. No `*.patch` or `*.diff`
file exists anywhere in the project. Upstream, `docs/experiments/` contains only the gate-0b
preregistration and the gate-0d prospective preregistration; pickaxe searches for "Branch P" and
"Amendment v1.1" return **zero commits** across the entire history of `origin/main`.

Consequently the three Check-A requirements cannot even be evaluated: there is no approved wording
to match, no Branch Q record, and no `0.10` qualification text — binding or otherwise. A report
that describes "the applied specification" as containing these elements describes a state that has
no persisted existence. For gate purposes: **reported-but-unpersisted work is work not done.**

## 2. Check B — P4 artifacts: vacuous for the amended artifact; the frozen FAIL verifies

**Amended artifact.** The only NIC artifacts on disk are the frozen FAIL pair
(`gate-0c-nic-2026-10-20.md` / `.json`, verdict `P4 FAIL`, passing pairs `[]`). No amended or
v1.1 P4 artifact exists in the worktree, in download copies, or upstream. The Check-B bullets
about the new artifact (spec version + execution date recorded; 49-wallet population consistent;
G1 descriptive and non-eligibility-affecting; PASS per amended logic) are therefore **vacuous**.

**Frozen FAIL artifact — verified.** Fingerprints (sha256, tamper-evidence baseline):

| File | sha256 (first 16) |
|---|---|
| docs/experiments/gate-0c-nic-2026-10-20.json | `e064f625bb8efefa` |
| docs/experiments/gate-0c-nic-2026-10-20.md | `07cb0ffcd25ce446` |
| docs/experiments/gate-0c-skill-test-preregistration-v1.md | `85468ac76b37c20b` |
| docs/experiments/gate-0c-redline-review-package-2026-10-20.md | `501eae9154cd2add` |

All four input anchors re-verified: v2.json git blob recomputed `73024f5f5e4b6dc6…` = recorded =
**blob at `origin/main`** (the gate-0d population freeze, `7428395`, used separate files and did
not touch this anchor); `pepe-buyer-audit-v5.jsonl` = `3ab1a0a3…`; `entry-blocks/v1.json` =
`6b4f2535…`; `pepe-usd-daily-365d.json` = `ae47b4e7…` — each matching the recorded sidecar values.

**Independent recomputation — 188/188 assertions reproduce.** A fresh implementation (linear-scan
inverse CDF, RNG re-derived from the canonical xorshift128+ spec, integer-accumulated G1 counts)
reproduces, under the sidecar's recorded conventions and the frozen inputs: 65 confirmed
acquisitions; 49 eligible wallets; per-wallet k_w equal to `v2.json buyers[].confirmed` (0
mismatches, 0 absent); day mass 08-12..18 = 5/10/4/6/15/9/16, all inside `A_w`; window edges
2026-08-08..23; anchors 27/27 on d_det..d_det+15; the 4 midnight-boundary transactions; G1 pooled
frac_up (excl/incl) 3d = 0.0000/0.0000, 7d = 0.0000/0.0000, 14d = 0.0538/0.0400, all outside
[0.20, 0.80]; G2 per-wallet null IQR for **all 49 wallets** (min 0.0778, median 0.2670, max
0.3333; ESS 6.04–6.45; fallback fired 0); horizon coverage 7d/30d; and the verdict logic →
**P4 FAIL**, consistent with prereg-as-written (§7 G1 ∈ [0.20, 0.80] with P90 trailing-90d
threshold; G2 IQR ≥ 0.10; §4.2 rule 5 N ≥ 15). This is computational fidelity with independent
verification of inputs and assertions — for the **FAIL** artifact.

**Statistical-boundary correction (material).** The review directive states "The minimum exact
marginal IQR exceeds the specified floor," supporting a G2 pass for the reported population. On
present evidence that premise is unsupported: the only IQR values that exist are the frozen
FAIL's (min **0.0778 < 0.10** under the disclosed min-reading; median 0.267). Any claim that a
floor is met belongs to the missing amended artifact and cannot be certified. Likewise "P4 PASS
under Amendment v1.1" is not recognized as an existing result.

## 3. Check C — hold: CONFIRMED, and now mandatory

Sandbox HEAD remains `11d99d2`; no commit was made (correct). Sandbox `git stash list` is empty.
The confirmatory run stays blocked — and the block now extends further: the P4 re-execution under
Amendment v1.1 must be treated as **not having happened**. The last verifiable state of the
program is: **P4 FAIL under prereg v1 (Option-A redline), artifacts frozen and independently
verified.** Until a real amendment exists, any downstream step that assumes PASS (freeze, LOCK_SHA,
sham-run, confirmatory run) is unauthorized.

## 4. Upstream reconciliation register (updated by this review)

Upstream `main` is **17 commits ahead** of the sandbox mirror (`11d99d2..d4c91b0`). Findings:

1. **12m JSON inclusion fix — CLOSED.** `5ffc0f3` (2026-10-19 17:39 +0100) committed
   `data/experiments/availability-treatment-12m-2026-10-17.json`; its blob at origin/main is
   **exactly the attested recovery object** `64df6b71919286a24ed13707e3e4abafb6d0d2d8`
   (45,722 bytes). `d2e5d8b` then added the verification txt, whose placeholders (16/49, 5/49)
   are **already filled** in the committed version. Task 12's commit-scope anomaly is resolved as
   a two-commit recovery; the Task-12 "amend (unpushed)" guidance is obsolete — `d2e5d8b` is
   pushed, and no further action is required for this item.
2. **Gate 0c docs commit — still outstanding.** No commit touches `docs/experiments/gate-0c*`.
   The Option-A redline prereg, the redline package, and the frozen NIC artifacts exist only in
   the sandbox worktree.
3. **New upstream track — Gate 0d (prospective validation), all committed:** `7428395` v2
   population freeze for prospective tracking (separate files; no conflict with the gate-0c
   anchor), `f46b8cf` preregistration + collection pipeline, `20e74eb` stopping-rule/verdict
   clarification (**v1.1 — this is gate-0d's own versioning, unrelated to any gate-0c
   amendment**), `1131f43` weekly collection CI, `50f0354` Blockscout empty-success fix,
   `94c4a32` first successful scan (state advanced to block 26220773), `d4c91b0` outcomes
   baseline (`data/prospective/outcomes.jsonl`).
4. **Earlier upstream gate-0c artifacts** (commit `05fea61`, 2026-10-18): `gate-0c-checks-bc`,
   `gate-0c-check-d`, `gate-0c-skill-permutation` JSONs — exploratory phase (built on
   `pepe-365d.json`, 366 raw points, disclosed exploratory statistic), predating the Option-A
   redline and the frozen 365-row typed price series. Distinct evidence layers, no conflict; the
   future docs commit must cross-reference them.
5. **Mirror staleness.** Before the eventual docs commit, the worktree must be brought onto
   current `main` (rebase/merge `11d99d2..d4c91b0`). Upstream `.gitignore` adds only
   `data/prospective/collection.log` (no conflict with gate-0c paths). Upstream `data/prices/`
   holds `pepe-365d.json` (exploratory); the sandbox's untracked `pepe-usd-daily-365d.json`
   (+ raw + provenance) remains subject to the r7 duplicate-copy/prices decision at commit time.
6. **Stash.** Sandbox: empty; nothing dropped or modified. The protected `stash@{0}` is on the
   user machine; review-safe inspection there (never `drop`/`pop`/`apply` during review):
   `git stash list`, `git stash show -p 'stash@{0}' > /tmp/stash0.patch`, `git stash show --stat 'stash@{0}'`.

## 5. Required remediation sequence (before anything proceeds)

1. **Owner re-supplies the approved Amendment v1.1 text** (exact wording of the two `0.10`
   qualifications, the Branch-P guard, and the Branch-Q record), or authorizes re-derivation from
   the redline package — in which case the derived text is **new draft material for review**,
   never "the approved text".
2. **Apply as real artifacts**: patch file preserved in the review record; amended prereg; **new,
   separately dated P4 artifact**; frozen FAIL pair untouched (fingerprints above must still hold).
3. **Independent verification re-run** against the new artifact (extend
   `scripts/aw-nic-verify-frozen.js`; the verifier never writes to artifact paths).
4. Only then: docs commit (on current `main`, per §4.2/4.5), freeze review, LOCK_SHA, §11
   sham-run, and — only after the freeze review passes — the confirmatory run.

## 6. Baseline fingerprints (recap)

Frozen FAIL json `e064f625…`, md `07cb0ffc…`, prereg `85468ac7…`, package `501eae91…`;
verifier `scripts/aw-nic-verify-frozen.js` (exit 0, 188/188); input anchors
`73024f5f` (v2 blob) / `3ab1a0a3` (v5 jsonl) / `6b4f2535` (entry-blocks) / `ae47b4e7` (price).
