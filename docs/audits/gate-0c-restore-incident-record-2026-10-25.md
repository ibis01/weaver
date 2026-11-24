# Gate 0c — Restore Incident Record (2026-10-25)

Status: ACTIVE RECORD (append-only; corrections are added as new dated
sections, never by editing this file's existing text)

Author: Ibismuh (prepared with AI assistance; every hash below was
independently re-measured from git object storage, not from working files)

## 1. Purpose and rule basis

Between 2026-10-21 and 2026-10-23 the Gate 0c frozen artifact set was
mutated in place: reconciliation/execution-status banners were written
into two hash-anchored documents, the v1.1 result JSON was re-anchored,
and the frozen verifier's anchor literal was edited to match. This
record documents that incident, restores the canonical frozen bytes,
and preserves the superseded text here so that no information is lost.

This repair implements the repository's own amendment-chain rule
(`docs/experiments/gate-0c-amendment-v1.1-draft-2026-10-21.md`, §3–7):
inline status lines are superseded by an addendum, **not by editing
frozen bytes**. It is also the norm in regulated data-integrity practice
(ALCOA+ "Original": corrections never overwrite the original record)
and open-science preregistration practice (OSF: registered files are
immutable; updates are new timestamped records).

## 2. Verified byte map at the frozen state (commit 6ea2fd0)

All values below were measured with
`git show 6ea2fd0:<path> | sha256sum` and are cross-anchored by the
external audit report (which independently records the verifier hash
`84bc0953…` and result-JSON hash `3986e710…`).

| # | Path | Role | SHA-256 @ 6ea2fd0 |
|---|------|------|-------------------|
| 1 | `docs/experiments/gate-0c-skill-test-preregistration-v1.md` | canonical prereg = AMENDED v1.1 | `36201d78c588b9523c5ece3e38cd22ddb5da18ad969379da891c7e2247db7fc7` |
| 2 | `docs/experiments/gate-0c-skill-test-preregistration-v1.baseline-85468ac7.md` | preserved PRE-amendment draft | `85468ac76b37c20b0db53581abc0ae395e93dd1730f19d43a05ed9051a04b6f1` |
| 3 | `docs/experiments/gate-0c-amendment-v1.1-draft-2026-10-21.md` | amendment record | `7964e7ae1d358843b20e90c14614072500942670d9c12df03dbe47b284418e30` |
| 4 | `docs/experiments/gate-0c-amendment-v1.1-draft-2026-10-21.patch` | amendment patch | `200531e9001958ae4bebbdbfaa3b4b6c1864e17a52e2c63c24467a5d09572592` |
| 5 | `docs/experiments/gate-0c-nic-2026-10-21-v1.1.json` | result JSON | `3986e710ca892ba20279c7c89a5e7c4b899647b26cfc02a68268c8542a1f6a35` |
| 6 | `docs/experiments/gate-0c-nic-2026-10-21-v1.1.md` | result MD | `6383e81be1ee46e2ee55932ef2e4f054756e2ba049d12920db58516103c0f583` |
| 7 | `scripts/aw-nic-verify-v11.js` | frozen verifier | `84bc0953e147169412c7d520bf99b6c6c3cd6f2ee8d8a7d8f95f26d90eef1c8e` |

Chain identities (machine-checked by `scripts/aw-nic-verify-v12.js`):

- `sha256(baseline 85468ac7 + patch 200531e9) = 36201d78` (amended prereg)
- prereg `36201d78` + execution → result JSON `3986e710` / result MD `6383e81b`
- `85468ac…` and `36201d…` are two different links of one chain (draft
  vs amended), not competing candidates for the same file.

## 3. Incident timeline (all commits verifiable in history)

1. `6ea2fd0` (2026-10-21, merge of PR #22) — last intact frozen state;
   verifier v11 = 416/0, EXIT 0 at this commit (reproduced on a fresh
   clone and in a detached worktree).
2. `816b740` (2026-10-21, direct push, no PR) — reconciliation/execution
   banners written INTO prereg and amendment record (#1, #3). Verifier
   breaks: 414/2, EXIT 1 (prereg `98f733d5…` ≠ `36201d78…`; record
   `67c8b3ea…` ≠ `7964e7ae…`).
3. `16418bb`, `61ce633` (direct pushes) — further banner edits; banner
   block grows to 13 lines vs the historical bytes (Appendix A/B).
4. `ddc6b6c` (direct push) — verifier v11's anchor literal changed from
   `36201d78…` to the mutated bytes `0b5eaa6e…` (verifier hash
   `84bc0953…` → `c16b7c05…`; Appendix C). The gate now proves the
   current bytes against an anchor chosen after the mutation.
5. `e4107dd` (direct push) — v1.1 result JSON re-anchored:
   `record.sha256` `7964e7ae…` → `284a852d…` and prereg reference
   `36201d78…` → `0b5eaa6e…` (JSON hash `3986e710…` → `f792d4ff…`).
   Substantive delta = exactly these two fields; the remainder of the
   JSON diff is unicode-escape re-serialization noise (em-dash/§/Σ).
   Historical hashes remain preserved in the JSON's prose field
   ("Executed under amended prereg v1.1 (36201d78…)…record 7964e7ae…").
6. Net effect at tip `0e23278`: verifier = 416/0, EXIT 0 again, but only
   against the re-anchored set. The intact result MD (`6383e81b…`)
   cites `36201d78…`/`7964e7ae…`, which matched no current file — a
   standing cross-artifact contradiction. Anchor continuity was kept
   only in prose, not in any machine-checkable assertion.

## 4. This repair (what the PR does)

1. **Restore** rows 1, 3, 5, 7 to the exact bytes measured at `6ea2fd0`
   (rows 2, 4, 6 were never mutated and are untouched).
2. **Preserve** the superseded reconciled texts in this record
   (Appendices A–C) and in git history (`16418bb`…`0e23278` remain
   reachable; nothing is rewritten or force-pushed).
3. **Add** `scripts/aw-nic-verify-v12.js` as a NEW file (v11 is never
   edited again). v12 wraps v11: pins v11's bytes, executes it and
   requires 416/0, pins the five canonical frozen hashes, re-derives
   the reconstruction identity from in-repo materials, and pins this
   record's own hash.
4. **Post-restore gate (executed before commit)**: all seven hashes
   re-measured; v11 = 416/0, EXIT 0 at the restored set.

## 5. Supersession register (Gate 0c)

| ID | Superseded artifact (mutated state) | Superseded by | Text preserved at |
|----|--------------------------------------|---------------|-------------------|
| G0C-S1 | prereg with banners `0b5eaa6e…` | restore to `36201d78…` | Appendix A; git `0e23278` |
| G0C-S2 | amendment record with banners `284a852d…` | restore to `7964e7ae…` | Appendix B; git `0e23278` |
| G0C-S3 | re-anchored result JSON `f792d4ff…` | restore to `3986e710…` | §3 step 5 (field deltas); git `e4107dd` |
| G0C-S4 | verifier `c16b7c05…` (anchor literal moved) | restore to `84bc0953…` | Appendix C; git `ddc6b6c` |

No preregistration history is removed: the pre-amendment draft remains
at its own path (`…baseline-85468ac7.md`, row 2) and every superseded
state remains reachable in git history.

## 6. Forward rules (binding from this record onward)

1. Rows 1–7 are byte-frozen. Any future change is a NEW file
   (v1.2, v2.0, …) plus a dated record here; never an in-place edit.
2. `scripts/aw-nic-verify-v11.js` is never edited again. Verifier
   evolution = new versioned files (v12 done; v13+ later), each
   pinning its predecessor's hash.
3. Verifier and artifact hashes are mirrored out-of-band (external
   audit thread / docs outside this repository). A signed tag is an
   integrity checkpoint, not independence — the same party controls
   this repository and any key used in it, so out-of-band mirroring
   is the actual control.
4. The merge commit of the repair PR gets a signed annotated tag
   (e.g. `gate-0c-v1.1-restored`); tag ID + merge commit ID are then
   recorded out-of-band.

## 7. Reviewer verification commands

```bash
# 1. Byte-level confirmation (from git objects, independent of checkout)
git show 6ea2fd0:docs/experiments/gate-0c-skill-test-preregistration-v1.md | sha256sum   # 36201d78…
git show 6ea2fd0:docs/experiments/gate-0c-skill-test-preregistration-v1.baseline-85468ac7.md | sha256sum   # 85468ac7…
git show 6ea2fd0:scripts/aw-nic-verify-v11.js | sha256sum                                # 84bc0953…

# 2. Reconstruction identity (in-repo materials only)
cp docs/experiments/gate-0c-skill-test-preregistration-v1.baseline-85468ac7.md /tmp/recon.md
patch -s /tmp/recon.md < docs/experiments/gate-0c-amendment-v1.1-draft-2026-10-21.patch
sha256sum /tmp/recon.md    # = 36201d78…

# 3. Frozen verifier at the restored set
node scripts/aw-nic-verify-v11.js .            # checks passed: 416 | DIFF: 0, EXIT 0

# 4. Chain wrapper (pins v11 bytes, canonical set, reconstruction, this record)
node scripts/aw-nic-verify-v12.js .            # all chain checks passed, EXIT 0
```

## Appendix A — superseded prereg delta (36201d78 → 0b5eaa6e, banner block)

```diff
+> **RECONCILIATION UPDATE — 2026-10-21.** This review was authored before
+> the recovery commit (f86d19f). The artifacts it describes as missing
+> were subsequently recovered. The verifier confirms 416/416 checks.
+> **EXECUTION STATUS UPDATE — 2026-10-21.** The "DRAFT — NOT APPLIED —
+> NOT EXECUTED" wording above was accurate at the time this file was
+> committed. The amendment was subsequently applied and executed, and
+> the results were committed in `gate-0c-nic-2026-10-21-v1.1.json` and
+> `.md`. The recovery commit (f86d19f) restored those artifacts after
+> they were omitted from a prior commit. The independent verifier now
+> confirms 416/416 checks against the committed bytes.
```

(a blank separator line and a `---` rule follow the block; total delta
13 lines, purely additive — the historical body is untouched.)

## Appendix B — superseded amendment-record delta (7964e7ae → 284a852d)

Identical 13-line banner block as Appendix A, inserted at line 1 of the
amendment record. No other content change.

## Appendix C — superseded verifier delta (84bc0953 → c16b7c05)

```diff
 eq('chain: amended prereg sha256', sha256(ROOT + '/docs/experiments/gate-0c-skill-test-preregistration-v1.md'),
-  A.amendment && '36201d78c588b9523c5ece3e38cd22ddb5da18ad969379da891c7e2247db7fc7');
+// Post-amendment reconciliation (2026-10-21): prereg file was edited to
+// add execution-status notes after the amendment was executed. The hash
+// below reflects the reconciled file, not the pre-reconciliation version.
+// The historical hash (36201d78…) is preserved in the JSON amendment record.
+
+  '0b5eaa6e07d531d3f5d49e61d40e85c6d1222143a3073c086c880671bb5ce576');
```

(exactly one assertion line changed; all other 415 checks identical.)

## Appendix D — superseded result-JSON field deltas (3986e710 → f792d4ff)

```diff
-  "prereg": "docs/experiments/gate-0c-skill-test-preregistration-v1.md (amended v1.1, 2026-10-21; sha256 36201d78c588b9523c5ece3e38cd22ddb5da18ad969379da891c7e2247db7fc7)",
+  "prereg": "docs/experiments/gate-0c-skill-test-preregistration-v1.md (amended v1.1, 2026-10-21; sha256 0b5eaa6e07d531d3f5d49e61d40e85c6d1222143a3073c086c880671bb5ce576)",
-      "sha256": "7964e7ae1d358843b20e90c14614072500942670d9c12df03dbe47b284418e30"
+      "sha256": "284a852d0666230382aa760e9ebb7c9427a0346276cba111465076a4dae0de7c"
```

(plus unicode-escape re-serialization of `—`, `§`, `Σ` throughout —
no other substantive change.)
