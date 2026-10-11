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

**Verdict:** PASS

Evidence:
- Key-material grep across `js/ server/ scripts/ cf-worker/index.js` returns
  no custody or storage hits. The four matching files are:
  - `js/utils/logger.js:88` — regex masking seed phrases in log output
  - `js/features/ai.js:56-57` — regex masking private keys / seed phrases
    before any AI request is sent
  - `js/features/web3.js:367` — user-facing string: "Weaver never stores
    your private keys or seed phrases."
  - `js/features/learn.js:67,78,146` — educational content about wallets
- Signing path is `js/features/web3.js:238`: Weaver constructs transaction
  params and calls `window.ethereum.request({ method: "eth_sendTransaction",
  params })`. Signing and broadcast happen in the user's injected wallet.
  Weaver never sees a private key, never holds signing authority, never
  broadcasts on its own.
- No `eth_sendRawTransaction`, no direct RPC broadcast, no server-side
  signer.

§2.1 satisfied: non-custodial, user retains keys and signing authority.

---

## Area 2 — Transparency over hype (§2.2)

**Verdict:** PASS

Evidence:
- `js/features/gems.js:1621-1690` builds an explicit `reasons` array from
  real inputs: liquidity quality, volume/liquidity ratio, momentum, pair
  age, buyer activity. Each reason is a human string ("Healthy liquidity
  ($…)", "⚠️ Micro liquidity — rug risk", "Age 12h — past infancy, still
  early"). The array is attached to the analysis and rendered alongside the
  score.
- `js/features/gems.js:1842-1851` composes the alert statement from
  `gem.analysis.reasons` and the score: "Gem Agent alert — score N (version);
  risk X. Not financial advice; log the reasoning, decide for yourself."
- `js/features/gems.js:2163-2165` merges `analysis.reasons` with
  `opportunity.reasons` so both the deterministic and the scored evidence
  are visible.
- `203` reasoning/explanation identifiers across `js/features/` and
  `js/intelligence/`.
- Scoring functions carry an explicit `scoreVersion` field
  (`gems.js:1850`).

§2.2 satisfied: score and reasoning are co-rendered, not number-only.

---

## Area 3 — Track record includes losses (§2.3)

**Verdict:** PASS

Evidence:
- `js/features/track-record.js` is the canonical module.
- `REPORTED_GAIN`, `REPORTED_LOSS`, `REPORTED_FLAT` are all defined
  (lines 50-52), mapped to display classes (945-948), exposed as
  `<select>` options in the outcome UI (1274-1283), and evaluated by
  `evaluateGemOutcomes` (1487-1489).
- The three outcome states are symmetric: a loss is stored, classified,
  and rendered with the same code path as a gain.
- `js/features/track-record.js` records `immutableContentHash` and
  `createdAt` as immutable snapshot fields (enforced by unit tests in
  `test/unit/track-record.test.js`: "immutable snapshot cannot be mutated
  via updateDecision", "immutable createdAt cannot be changed").

§2.3 satisfied: losses are first-class, historical calls are
immutably recorded.

---

## Area 4 — No financial advice (§2.4)

**Verdict:** PARTIAL

Evidence — directive language: none.
- Grep for `"buy now|"sell now|guaranteed profit|100% safe|cannot lose|
  you should buy|last chance` in production `js/` returns zero hits.
- The one `cf-worker` match is `node_modules/loupe` — not production.

Evidence — disclaimer: present at feature surfaces, absent at entry.
- "Not financial advice." appears in:
  - `js/intelligence/opportunities.js:8`
  - `js/features/gems.js:1850`
  - `js/features/smart.js:719`
  - `js/features/optimizer.js:339`
  - `js/features/unlocks.js:328`
- `index.html` contains no disclaimer string. §2.4 requires the disclaimer
  to "remain visible on every meme-coin-facing view." Feature views comply;
  the app shell does not. Whether this constitutes a violation depends on
  whether the shell itself counts as a meme-coin-facing view.

Finding (S2): add the disclaimer to `index.html`, or document that the
shell is not a "meme-coin-facing view" and feature views are the compliance
boundary.

---

## Area 5 — Conflicts of interest (§2.5)

**Verdict:** PASS

Evidence:
- Grep for `sponsored|paid|promoted|boosted|premium.*rank` across `js/`
  and `cf-worker/index.js` returns no ranking logic. The three hits are:
  - `js/lib/crypto/vault.js:245` — code comment
  - `js/data/news-snapshot.js:1` — static news feed, word appears in
    article text
  - `cf-worker/index.js:1096` — comment about Cloudflare plan limits
- No parameter, env var, or external input influences any score outside
  the scoring engine.
- No sponsored-content surface exists in the codebase.

§2.5 satisfied: money cannot buy a better score.

---

## Area 6 — Privacy first (§2.6)

**Verdict:** PASS

Evidence — outbound fetch census (18 production sites):
- `js/features/walletsync.js:67,108,114` — destination is
  `https://weaver-proxy.ibis01-weaver.workers.dev/proxy?url=…`, Weaver's
  own Cloudflare Worker. RPC bodies (`js/features/walletsync.js:159,208,254`)
  are sent to Weaver's worker, not a third party.
- `js/intelligence/smart-money/wallet-history.js:27,137,143` — destination
  is `eth.blockscout.com/api/v2`, public on-chain data. Address is a
  request parameter, not user-identifying payload.
- `js/api/prices.js`, `js/features/news.js`, `js/features/smart.js`,
  `js/features/shield.js`, `js/features/track-record.js`,
  `js/features/evidence-card.js`, `js/features/telegram.js` — all target
  public market/news/security providers. No user payload.
- `js/features/gems.js:1922` and `js/features/smart-radar-auto.js:264` —
  POST to `workerBase + "/meme/alert"`, Weaver's own worker.
- `js/utils/format.js:91`, `js/ai/providers.js:226` — FX rates and user-
  supplied AI endpoints. AI endpoints are validated against a hardened
  URL filter (`js/features/ai.js` rejects private/localhost/credentials).

Evidence — guard coverage:
- The 18 bare `fetch` sites split into three groups: static JSON snapshot
  loads (`snapshot.js`, `format.js` FX), user-configured AI endpoints
  (validated separately), and `W.requestGuard ? await W.requestGuard.fetch(…)
  : await fetch(…)` fallbacks (prices, news, smart, walletsync, ai,
  wallet-history). The bare-fetch fallback exists only when the guard
  module is unavailable.

No third-party transmission of holdings, watchlists, wallet addresses,
portfolio activity, or journal data identified.

Finding (S3): the guard-fallback pattern relies on the guard being loaded
before any sensitive path runs. Add a test asserting no new bare `fetch`
call is introduced in a sensitive module without a corresponding guard
check. Not a current violation; a forward-looking invariant.

§2.6 satisfied: user data remains local or is transmitted only to Weaver's
own infrastructure.

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
- Gem Agent `CHAINS` allowlist is defined at `js/features/gems.js:720`
  with 7 entries: solana, ethereum, base, bsc, arbitrum, polygon,
  avalanche.
- **Correction (2026-10-11):** the audit initially claimed a behavioral
  test existed at `test/unit/gems-chain-filter.test.js`. That file does
  not exist. The S1 finding is therefore stronger than first recorded:
  the §3.3 invariant is entirely untested. This is closed in the same
  commit by adding `test/unit/chain-parity.test.js`.
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
