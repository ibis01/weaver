# Gate 0d — Data Reconciliation & Pipeline Integrity Correction

**Date:** 2026-11-08
**Trigger:** Independent audit finding (2026-11-08): buys.jsonl contains 17 rows
with only 10 unique transaction hashes; state.json counter says 16; all four
outcome rows are `unresolved`; PR #24's collector fix is prospective-only and
does not clean historical data.
**Basis branch:** main @ `16815e6` (merge of PR #28)
**Branch:** `fix/gate-0d-reconciliation-2026-11-08`

---

## 1. Audit findings — independently re-verified

Every number in the audit finding was re-derived from the committed files
before any correction was made:

| Metric | Audit claim | Re-verified |
|---|---|---|
| Buy rows | 17 | 17 ✓ |
| Unique buy txHashes | 10 | 10 ✓ |
| Duplicate buy rows | 7 | 7 ✓ |
| Outcome rows | 4 | 4 ✓ |
| Unique outcome txHashes | 3 | 3 ✓ |
| Resolved outcomes | 0 | 0 ✓ |
| `state.buys_collected` | 16 | 16 ✓ |

The seven duplicate buy txHashes (each ×2):
`0xc3f588fc8c…`, `0x3985574a4e…`, `0xc393ddc7dd…`, `0x9102c4410e…`,
`0x18886d84d3…`, `0xa3cf4e081b…`, `0xefb203f8c9…`.
The duplicate outcome row: `0xc3f588fc8c…` (×2, rows byte-identical).

## 2. Forensic timeline (commit archaeology)

Reconstructed from per-commit diffs of `data/prospective/` and
`data/prospective/state.json`:

| Commit (UTC) | Buy rows added | Counter after | Notes |
|---|---|---|---|
| `83309a7` 10-21 17:21 | +2 (rows 1–2, unique) | 2 | clean |
| `0e23278` 10-25 03:12 | +1 (`0xc3f588fc…`, weekly re-collection) | 3 | first duplicate |
| `aef49bc` 10-25 15:51 | +1 (`0xc3f588fc…` 23:00Z local-run row) | **unchanged** | local run never wrote state.json → counter/file drift begins |
| `28b6c24` 11-01 04:24 | +6 (rows 5–10, unique) | 9 | clean |
| `ffdbe2e` 11-08 04:28 | +7 (6 duplicates + 1 genuinely new: `0xc57f6a85…`) | 16 | pre-fix collector run |

**Counter equation:** 2 + 1 + 6 + 7 = 16 counter-updating rows; the local
run's row (`aef49bc`) added a 17th file row with no counter increment —
exactly the 17-vs-16 discrepancy.

**The decisive ordering fact:** the 11-08 weekly collection
(`ffdbe2e`, 04:28 UTC) ran **~8 hours BEFORE** PR #24's merge
(`315baea`, 12:41 UTC). The six 11-08 duplicates are therefore pre-fix
contamination, not evidence that the merged fix is broken. The auditor's
verification that the collector now loads existing txHashes before
appending is confirmed by code inspection
(`scripts/oneoff/prospective-collect.js`: `seen` set loaded from
buys.jsonl, lines 156–166).

## 3. Root causes

**RC-1 — Historical duplicate buys (pre-PR #24 collector).** Runs before
the fix had no cross-run txHash dedupe, and re-scan windows re-collected
known transactions. Additionally, the manual 10-24 local run appended a
row without updating state.json, creating the counter/file divergence.

**RC-2 — Scorer intra-run duplication.** `prospective-score.js` loaded
its `existing` txHash set once at startup and never updated it while
writing. The duplicated `0xc3f588fc…` buy row therefore produced two
identical outcome rows in one run. (Fixed: per-run `attempted` set.)

**RC-3 — `unresolved` was terminal (the critical defect).** A buy scored
while price coverage was insufficient was recorded `unresolved` and then
skipped forever (`existing.has(txHash) → continue`). Even with perfect
prices later, the outcome could never resolve. This is the mechanical
root cause of the Phase 4 blocker ("insufficient resolved outcomes").

**RC-4 — Price series frozen at the freeze moment.** The only price
history (`data/prices/pepe-usd-daily-365d.json`, manual CoinGecko fetch
taken 2026-10-19T04:35Z) ends at `2026-10-18T01:31:10Z` — the Gate 0d
freeze. Every prospective buy occurs after the freeze, so
`priceAt(buy.timestamp)` always exceeded the 2-day tolerance → every due
buy became `unresolved` (RC-3 then made it permanent). The weekly
workflow (`gate-0d-collect.yml`) refreshed prices **never**; it also
commits only `data/prospective/`, not `data/prices/`.

**Resolution of the "why are all four outcomes unresolved" question:**
RC-4 made all three due buys (10-20 ×2, 10-23 ×1; +14d horizons 11-03,
11-03, 11-06 — all past) fail price lookups at the 11-08 run; RC-3 froze
them; RC-2 duplicated one of them.

## 4. Corrections applied

### 4.1 Immutable preservation (no silent overwrite)

`data/prospective/archive/2026-11-08-pre-reconciliation/` holds byte-exact
copies of the pre-correction evidence plus a SHA256SUMS.txt manifest:

```
24af58f45fdb56d6e3e5cffcbd53fc2a46fec69932a67e3d835d05e7e3e48fba  buys.jsonl
d0d39f1b9512ebf6af61fcf0441cc4cc808b877d0f19f747b2713a1b1dd4c585  outcomes.jsonl
eecad3447f20b608a2949a2a1f4de1d16abf7e0296ffcfd535cebbc59df8b228  state.json
ee157a46dd8d85083c37847be921783fb9afb0d717ab44d8c2e31fbd018dfba1  freeze-hashes.txt
```

### 4.2 Canonical datasets (dedupe by txHash, first occurrence wins)

Produced by `scripts/oneoff/reconcile-gate0d-2026-11-08.js` (committed;
idempotency-guarded; validates that the canonical txHash universe equals
the original before writing anything):

| File | Before | After | SHA256 (canonical) |
|---|---|---|---|
| `data/prospective/buys.jsonl` | 17 rows | 10 rows | `b9767db21f7be5b6ca0ff414aa15242aa4157e0367a9757ee0b966daf0e69f11` |
| `data/prospective/outcomes.jsonl` | 4 rows | 3 rows | `257bab9d12b74e567122788761c3ab8334c37c21bd16a228ea2f155e6313944a` |
| `data/prospective/state.json` | `buys_collected: 16` | `buys_collected: 10` + reconciliation block | `b1177f178366b0f2be498e0b4dfb5aefa7a06249da077ee73f5f09e26e5c12ba` |

Counter semantics: `buys_collected` now equals the canonical unique
transaction count, matching post-fix collector behavior (it can no longer
append a duplicate). The reconciliation block inside state.json records
before/after numbers, the rule used, and the archive path.

### 4.3 Scorer integrity fix (`scripts/oneoff/prospective-score.js`)

Rewritten around an explicit, tested ledger contract
(`test/unit/prospective-score.test.js`, 9 tests):

- `outcomes.jsonl` is an **append-only attempt ledger**; the **latest row
  per txHash is canonical**. Consumers must not count raw rows.
- `resolved` is terminal; `unresolved` is **retry-eligible** (re-attempted
  every run until prices cover the horizon).
- One attempt per txHash per run (intra-run dedupe).
- Unresolved rows carry `attemptedAt` for the audit trail.
- Running totals are computed latest-wins (legacy duplicate rows no
  longer double-count).
- Loud diagnostic when price coverage is insufficient, naming the fix.

Behavioral compat: resolved-row schema, 14d horizon, 0.20 early threshold
(inclusive), 2-day price tolerance, and exit-0-on-run semantics are all
unchanged.

### 4.4 Price-history pipeline (`scripts/oneoff/fetch-pepe-prices.js`, new)

- Refreshes both `data/prices/pepe-365d.json` (compact) and
  `data/prices/pepe-usd-daily-365d.json` (metadata schema preserved) from
  the CoinGecko public daily `market_chart` endpoint — the same provider
  as the original 10-19 snapshot. Research-pipeline use only.
- Validates before writing (≥300 points, ≥300-day span), atomic
  tmp+rename writes, 429 backoff, optional `COINGECKO_API_KEY`.
- Wired into `gate-0d-collect.yml` as "Refresh price history" with
  `continue-on-error: true` so a price failure can never block collection;
  uncovered outcomes simply stay `unresolved` (retry-eligible) until the
  next successful refresh.

**Validation run (sandbox, 2026-11-08T18:14Z):** 366 points,
2025-11-09 → 2026-11-08.
`pepe-365d.json` → `54a480b644abbba3fb2ef89ea9f7625ab277b0cf10b9c83bc86c5dddaa1573c1`
`pepe-usd-daily-365d.json` → `1251696df414c3683553ad8c7ea509178b0f8a962347cd78b2a45bb22fd1cba9`

## 5. Recovery path for the outcome pool (verification, read-only)

Against the refreshed series, using the scorer's own `priceAt`, the three
canonical unresolved outcomes are **all resolvable** at the next weekly
run (p0/p14 coverage confirmed; fwd returns intentionally NOT recorded
here — resolution must happen through the audited workflow, not by
hand-editing evidence):

| txHash | due | p0 | p14 | status |
|---|---|---|---|---|
| `0x8f8cfb96…` | yes | 4.154e-6 | 4.769e-6 | RESOLVABLE at next run |
| `0xe9e411de…` | yes | 4.154e-6 | 4.769e-6 | RESOLVABLE at next run |
| `0xc3f588fc…` | yes | 4.389e-6 | 4.788e-6 | RESOLVABLE at next run |

The remaining 7 canonical buys are correctly `not-yet-window`
(horizons land 2026-11-12 → 2026-11-21). Next Sunday run: 2026-11-15
00:00 UTC (plus runner queue delay).

**Deliberately NOT done:** no outcome row was resolved by hand, no
thresholds were touched, Phase 2 Window 3 configuration and scan data are
untouched, and none of the freeze-pinned artifacts
(`freeze-hashes.txt` set) were modified.

## 6. Phase 0 re-verification (audit follow-up item 3)

`scripts/aw-nic-verify-v11.js` at HEAD `16815e6` (Node 22.23.3):

```
checks passed: 406 | checks DIFF: 10
artifact verdict: P4 v1.1 PASS | g2p min IQR_w: 0.2 (gate >= 0.10: true)
exit code: 1 (nDIFF > 0)
```

All 10 DIFFs are `legacy:` checks comparing the **v1.0 legacy per-wallet
table** against the corrected integer-arithmetic recomputation — i.e. the
exact discrepancies that motivated the v1.1 amendment. They are expected
to DIFF forever, by design of the amendment chain. Consequences:

- The historical "416 checks passed / 0 DIFF" record is **not
  reproducible post-amendment** and must no longer be cited as current.
- The v1.1 artifact itself verifies: every non-legacy check passes, the
  gate holds (min IQR_w 0.2 ≥ 0.10), and the amendment-chain hashes
  (`chain:*` checks) pass.
- `scripts/aw-nic-verify-frozen.js` reports FAIL / exit 1 on the
  superseded v1.0 artifact — expected and consistent with the above.
- Verifier hygiene (follow-up, not done here): the v11 script should
  classify documented amendment deltas separately from real failures so
  its exit code matches its verdict line. Not changed in this PR to avoid
  touching Gate 0c verification machinery without independent review.

## 7. Test evidence

Node 22.23.3 (pinned):

| Suite | Result |
|---|---|
| Unit (`test:unit`) | **737 passing**, 2 pending (was 728 +2) |
| Integration | **30 passing** |
| Security | **16 passing** |

+9 unit tests pin the new scorer ledger contract (retry semantics,
terminal resolved, intra-run dedupe, latest-wins totals, threshold
boundary, `attemptedAt` presence).

## 8. Residual risks / open items

1. **Gate 0c / PR #23** — unchanged, still gated on external auditor
   acknowledgment. Untouched here.
2. **Phase 2 Window 3** — closes 2026-11-15T13:16:47Z. Untouched here.
3. **Counter semantics note** — any external tooling that assumed
   `buys_collected` counts raw rows must switch to canonical-unique
   semantics (nothing in-repo does).
4. **CoinGecko rate limits** — public endpoint 429s are handled with
   backoff; the optional `COINGECKO_API_KEY` secret removes the risk if
   configured. A failed refresh never blocks collection.
5. **Scorer consumers** — `outcomes.jsonl` now formally has latest-wins
   ledger semantics; any future Phase 4 validator reading this file must
   use `canonicalOutcomes()` (exported for exactly this purpose).
