# Weaver Constitution Compliance Audit

**Date:** 2026-10-11
**Scope:** Every module against WEAVER_CONSTITUTION.md v2.0
**Status:** In progress — 4 of 10 areas audited, 6 pending

This audit verifies that Weaver's code and behavior comply with the
Constitution. Each area gets a verdict: PASS, FAIL, or PARTIAL, with
evidence. Findings become a remediation queue, not a rewrite.

No feature work proceeds until findings are categorized.

---

## Area 1 — Non-custodial guarantees (§2.1)

**Verdict:** PENDING

Checks:
- Does any module request, store, or transmit private keys or seed phrases?
- Does any module sign transactions on behalf of the user?
- Does any module execute trades?

---

## Area 2 — Transparency over hype (§2.2)

**Verdict:** PENDING

Checks:
- Does every user-facing score/verdict expose reasoning?
- Are confidence and uncertainty visible?
- Are risk factors listed separately from positive factors?

---

## Area 3 — Track record includes losses (§2.3)

**Verdict:** PENDING

Checks:
- Does any public track record, leaderboard, or call history exist?
- Are losses shown with the same prominence as wins?
- Can historical calls be edited or deleted post-hoc?

---

## Area 4 — No financial advice (§2.4)

**Verdict:** PENDING

Checks:
- Any directive language in user-facing strings?
- Any guaranteed-return or FOMO framing?
- Is the disclaimer present on relevant surfaces?

---

## Area 5 — Conflicts of interest (§2.5)

**Verdict:** PENDING

Checks:
- Can any input influence a score outside the scoring engine?
- Are sponsored surfaces separated from organic rankings?

---

## Area 6 — Privacy first (§2.6)

**Verdict:** PENDING

Checks:
- Does any module transmit holdings, watchlists, addresses, or journal data externally?
- Is that transmission gated on explicit, separate opt-in?

---

## Area 7 — Evidence provenance (§2.7)

**Verdict:** PASS (partial)

Evidence:
- Every material claim in the smart-money pipeline is traceable to a raw
  observation via `sm.provenance.v1:*` records and the `provenance-store`
  writer.
- The wallet-history module returns trades with `{side, amount, at, txHash}`
  — every trade has a transaction hash.
- Missing evidence is represented as `null` or `UNKNOWN`, never fabricated.
  Verified across 118 wallets / 2997 priced buys in the calibration audit.
- `docs/audits/smart-money-early-entry-2026-10-11.md` documents the
  provenance chain explicitly.

Residual: the audit only covers the smart-money pipeline. `gems.js`,
`shield.js`, `thesisHealth.js`, and the AI-explanation path are not yet
audited against §2.7.

---

## Area 8 — AI is an interpreter, not an authority (§2.8)

**Verdict:** PASS (partial)

Evidence:
- `js/features/ai.js` restricts endpoints to HTTPS, rejects private and
  local addresses, rejects credentials-in-URL, and enforces a size cap.
- Deterministic security checks (`shield.js`, `gems.js` vetoes) run before
  any AI surface.
- No AI module writes to `W.store` or overrides score components.
- `W.intelligence.computeConfidence` is the single canonical confidence
  function — AI does not compute its own.

Residual: no test enforces that AI output cannot modify a signal. AI is
architecturally separated but not contractually restricted by an invariant
test.

---

## Area 9 — Deterministic safety logic (§3.7)

**Verdict:** PASS

Evidence:
- `shield.js` uses deterministic adapters: GoPlus, RugCheck, honeypot.is.
  No LLM in the risk path.
- `memeOpportunity.securityVetoes` hard-rejects honeypots, active mint
  authority, active freeze authority, owner blacklist, unbounded tax,
  removable liquidity — before any score is computed.
- `convergenceDetector` and `walletProfiler` compute early-entry rates from
  raw on-chain data with no model inference.
- Tests cover the veto path: `test/unit/gems-shield-filter.test.js` asserts
  fresh high-risk results are hidden when `hideRisk=true`.

---

## Area 10 — Graceful degradation & chain parity (§3.4, §3.3)

**Verdict:** PARTIAL

Evidence for §3.4 (graceful degradation):
- `prices.js` failover chain (CoinGecko → Binance → CoinLore → CoinBase →
  CoinPaprika → Cache) returns honest errors when every provider fails;
  the user-facing message is "Market data temporarily unavailable."
- `walletHistory.fetchTrades` returns `{trades: [], reason: "fetch-failed"}`
  on network failure — no fabrication.
- `observations.js`, `deployerGraph.js`, `ownerAssociations.js` all
  documented to return `null`/`false` without throwing on failure.
- `snapshot` module loads `data/top.json`, `data/global.json`,
  `data/fng.json` as fallback and marks them stale.

Evidence for §3.3 (chain parity):
- Gem Agent `CHAINS` allowlist is enforced by a behavioral test
  (`test/unit/gems-chain-filter.test.js`).
- Token Shield supports EVM (GoPlus + honeypot.is) and Solana (RugCheck).
- Smart Money is explicitly ETH-only (`walletHistory.fetchTrades` refuses
  non-`ethereum` chains with `unsupported-chain`).

Residual — FAIL candidate:
- The chain filter test asserts excluded chains don't leak into scan results,
  but there is no test asserting the invariant `DISCOVERABLE_CHAINS ⊆
  VERIFIED_CHAINS` for the currently-enabled chains. Section 3.3 is stated
  as a formal requirement with no corresponding test.

---

## Remediation queue

To be produced after all ten areas are audited. Findings will be ranked by
severity, not by audit order.

## Methodology

- Read source, do not infer from documentation.
- Each finding must cite a file path and a symbol or line.
- PASS requires positive evidence, not absence of counter-evidence.
- PARTIAL means the requirement holds in the audited path but is not
  enforced by test or is not verified across every module in scope.
