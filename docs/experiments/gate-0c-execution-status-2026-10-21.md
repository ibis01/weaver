# Gate 0c — execution status addendum (2026-10-21)

This document records the operative status of the Gate 0c P4 NIC test after
amendment v1.1. The amendment-chain documents are frozen byte-for-byte at
their review-time hashes and therefore retain review-time language; their
inline status lines are superseded by this addendum, not by editing frozen
bytes.

## Amendment chain (sha-256)
- baseline prereg 85468ac76b37c20b0db53581abc0ae395e93dd1730f19d43a05ed9051a04b6f1
  (preserved as gate-0c-skill-test-preregistration-v1.baseline-85468ac7.md)
- amendment record (Q1/Q2 review gate) 7964e7ae1d358843b20e90c14614072500942670d9c12df03dbe47b284418e30
- patch (+123/-27, 6 hunks) 200531e9001958ae4bebbdbfaa3b4b6c1864e17a52e2c63c24467a5d09572592
- amended prereg 36201d78c588b9523c5ece3e38cd22ddb5da18ad969379da891c7e2247db7fc7
  (= baseline + patch, applied 2026-10-21; rollback: git apply -R the patch)

Status note: the amended prereg bytes were authored before application and
contain review-time status language ("DRAFT — NOT APPLIED"). That language
describes the authoring-time state, frozen by design. The amendment was
applied and executed on 2026-10-21 as recorded here and in the artifacts.

## Execution (2026-10-21)
- producer scripts/aw-nic-p4-v11.js
  0223b7eb0a2ac6e4ca2c74bc531b5c00509f571333e435e6aed9efac9dab23f2
- anchor gate: all green (prereg 36201d78, record 7964e7ae, patch 200531e9,
  frozen pair e064f625bb8efefa3f3e90f9c05c587643e8360ba6f824de3e26ad91882402b7/07cb0ffcd25ce4465b36d491500d817dc409f52a6d2937b312ad5889ebbfb2f0, price input ae47b4e74167259b75a6d6e589e30fc608d19e6bc30ae72c168c35dea5c0100c,
  entry-blocks 6b4f25350793216d4f7240be553f09a7d6f6f1585ffedb34c2ade0f10cf4face, v5 jsonl 3ab1a0a3a571423290145a66a8e97c62c0409dda8c45f047ac5a8706089b20bc, v2 blob 73024f5f5e4b6dc67125fd674e30c9c1b8499c40)
- incident rules satisfied: D1 reproduces frozen G1 exactly; legacy k-draw
  column reproduces frozen g2.perWallet exactly (min 0.0778)
- G2-P exact marginal null: min marginal IQR_w = 0.2 >= 0.10 (N=49, 0 fallbacks)
- verdict: P4 v1.1 PASS
- artifacts:
  gate-0c-nic-2026-10-21-v1.1.json 3986e710ca892ba20279c7c89a5e7c4b899647b26cfc02a68268c8542a1f6a35
  gate-0c-nic-2026-10-21-v1.1.md   6383e81be1ee46e2ee55932ef2e4f054756e2ba049d12920db58516103c0f583
  (byte-deterministic; byte-identical across two independent machines)

## Independent verification
- verifier scripts/aw-nic-verify-v11.js
  84bc0953e147169412c7d520bf99b6c6c3cd6f2ee8d8a7d8f95f26d90eef1c8e
- result: checks passed 416 | checks DIFF 0 | exit 0
- reproduction: node scripts/aw-nic-verify-v11.js <repo-root>
  (read-only; re-hashes the full chain and artifacts; aborts on any mismatch)

## Provenance of the historical result
The original P4 FAIL (gate-0c-nic-2026-10-20.{json,md}, e064f625/07cb0ffc)
remains the historical baseline result, preserved unmodified. The v1.1
verdict does not replace it retroactively; it supersedes it prospectively
under the amended, documented convention.

## Commit-reconciliation note
Commit 91e002e ("gate-0c: amended v1.1 P4 NIC execution") staged 12 of its
intended 14 files: the v1.1 result pair was omitted from the staging list.
The artifacts were executed and hash-verified locally before that commit
existed; this commit repairs the omission and records the operative status.
