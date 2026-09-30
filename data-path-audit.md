# Weaver live-data and fallback audit

**Audit scope:** production browser code, proxy integration, local
snapshots, and test fixtures in the current repository state.

**Last verified:** 2026-09-30 against `js/api/prices.js` (provider
chain), `js/features/news.js` (feed list), and `index.html` (CSP
allowlist).

## Executive finding

Weaver is **live-data-first, not live-data-only**. Production paths
request data from external providers and calculate technical analysis
from returned market data. When providers fail, the application
intentionally falls back to browser cache, repository snapshots,
stale in-memory cache, or explicitly marked built-in emergency
values. Test mocks and fixtures are confined to the test suite.

A snapshot or built-in value must never be described as current live
data. `W.api.source` and the data-health panel are the authoritative
labels.

## Provider chain (verified)

Market listings:
  CoinLore → PRIMARY (tickers)
  CoinBase → SECONDARY
  CoinPaprika → TERTIARY (search / trending / coin detail / global)
  data/*.json → last resort, refreshed by .github/workflows/data.yml

OHLCV / chart:
  Binance → PRIMARY (klines endpoint)
  CoinPaprika → fallback for chart data when Binance has no pair
  CoinLore → OHLCV not wired
  CoinBase → OHLCV not wired

Binance is fetched **directly from the browser**, not through the
Worker. Cloudflare Worker egress IPs are rejected by Binance with
403; the browser's own IP is not. `api.binance.com` is in the CSP
`connect-src` allowlist for this reason. See the comments at
`js/api/prices.js:171-174` and `:478-481` for the full rationale.

## Production data-path inventory

| Capability | Primary live source | Cache or fallback | Assessment |
|---|---|---|---|
| Market listings and prices | CoinLore `/api/tickers` → CoinBase → CoinPaprika | Browser `api_cache:*`, one-hour in-memory top cache, `data/top.json` | Live-first; fallback is explicitly marked by `W.api.source`. |
| Coin search | CoinPaprika | `data/top.json` matching by name/symbol | Live-first; fallback has reduced coverage. |
| Coin detail / fundamentals | CoinPaprika | `data/top.json` mapped into a reduced detail object | Fundamental score is a heuristic over provider fields. |
| Global market | CoinPaprika `/global` | `data/global.json`, then built-in `SNAPSHOT_GLOBAL` | Built-in values are emergency defaults, stale by design. |
| Fear and Greed | Alternative.me `/fng/` | `data/fng.json`, then built-in `SNAPSHOT_FNG` | Live-first; fallback must be displayed as snapshot. |
| Historical chart | Binance `/api/v3/klines` | CoinPaprika chart endpoint; sparkline from `data/top.json` | Binance is primary. CoinPaprika is the wired fallback for pairs Binance does not serve as `SYMBOLUSDT`. |
| Multi-timeframe OHLCV | Binance `/api/v3/klines` via `W.api.ohlcv(id, interval, limit)` | No fabricated candle fallback | RSI, EMA, MACD, ATR, BOS/CHOCH, and liquidity are local calculations over returned candles. |
| Crypto news | RSS through the first-party proxy: CoinDesk, Cointelegraph, Decrypt (`js/features/news.js:29-32`) | Embedded news snapshot | RSS is live-first. Snapshot is fallback content. |
| Gem discovery | DEX Screener token boosts, profiles, token pairs | No synthetic Gem candidates | Gem scoring is a local heuristic over returned DEX data. |
| Token Shield | GoPlus token-security APIs (EVM and Solana) | Five-minute Shield cache; error/noData/unsupported states stay explicit | Provider-backed when verified; not a mock safety result. |
| AI insights | Configured LLM path in `js/features/ai.js` | Explicit degraded path | Must not be presented as generated live intelligence when the provider is unavailable. |
| Portfolio and settings | Local browser storage | Local-only by design | Not external market data. |

## Technical-analysis provenance

`js/intelligence/technical-analysis.js` consumes `W.api.ohlcv`. The
canonical adapter preserves timestamp, open, high, low, close, volume,
and quote volume. Binance's klines response is the source for these
candles; the adapter normalizes it to the canonical shape and rejects
rows where timestamp, price, or volume are non-finite.

ATR is calculated from true range; market structure and liquidity
zones are derived locally from those candles. These outputs are
**computed from live or cached candles**, not hardcoded signals. If
the OHLCV call fails, the technical engine falls back to the chart
method; that path is explicitly lower fidelity because it may contain
close-only data.

No algorithm can guarantee 95-100% accuracy. The output is
probabilistic evidence and should remain scenario-oriented.

## Gem → Shield → Analysis → Verdict path

Gem Agent
→ W.gems.checkShield(address, chain, identity)
→ W.shield.check()
→ W.shield.rememberEvidence()
→ W.shield.getEvidence({symbol, coingeckoId})
→ Token Analysis evidenceDomains.security
→ Unified Verdict security domain and provenance

Successful Shield evidence is marked `source: "goplus"`, carries an
observation timestamp, chain, address, risk score, risk reasons, and
Shield score version. Unsupported, failed, and no-data results are not
promoted to verified evidence. The registry is session-memory scoped;
a browser reload requires a new Shield verification.

The Gem card provides a direct `#/token/<symbol>` Analyze route after
the Shield step. Regression test: `test/integration/shield-analysis-verdict.test.js`.

## Test-only mocks and fixtures

- `test/setup.js` mocks store, crypto, api, and a minimal portfolio.
  It loads the real asset, logger, decision-engine, calibration,
  portfolio, shield, gems, and track-record modules.
- Unit tests use deterministic OHLCV, decision, and Unified Verdict
  fixtures.
- Integration tests use controlled provider responses.
- `data/*.json` and the embedded news snapshot are production fallback
  assets, not test mocks, but they are not guaranteed current.

## Remaining operational checks

Before release, inspect `W.api.source` and the data-health panel after
a live request, then force provider failure and confirm the UI labels
the resulting cache/snapshot/fallback state. Run the browser flow:
Gem scan, Shield verification, Analyze link, Unified Verdict security
status, hard refresh, and auto-refresh interval. A reload clears the
in-memory Shield handoff unless Shield is run again.
