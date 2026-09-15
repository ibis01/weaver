# Weaver live-data and fallback audit

**Audit scope:** production browser code, proxy integration, local snapshots, and test fixtures in the current repository state.

## Executive finding

Weaver is **live-data-first, not live-data-only**. Production paths request data from external providers and calculate technical analysis from returned market data. When providers fail, the application intentionally falls back to browser cache, repository snapshots, stale in-memory cache, or explicitly marked built-in emergency values. Test mocks and fixtures are confined to the test suite.

The UI and health metadata should distinguish `proxy`, `direct`, `coingecko`, `binance`, `cache`, `snapshot`, `local-cache`, `topcache`, `topcache (stale)`, and `built-in-fallback`. A snapshot or built-in value must never be described as current live data.

## Production data-path inventory

| Capability | Primary live source | Cache or fallback | Assessment |
|---|---|---|---|
| Market listings and prices | CoinGecko `/api/v3/coins/markets`; Binance `/api/v3/ticker/24hr` failover | Browser `api_cache:*`, one-hour in-memory top cache, `data/top.json`, local snapshot cache | Live-first; fallback is explicitly marked by `W.api.source` and data health. |
| Coin search | CoinGecko `/api/v3/search` | `data/top.json` matching by name/symbol | Live-first; fallback has reduced coverage. |
| Coin detail/fundamentals | CoinGecko `/api/v3/coins/{id}` | `data/top.json` mapped into a reduced detail object | Fundamental score is a heuristic over provider fields, not independent fundamental research. |
| Global market | CoinGecko `/api/v3/global` | `data/global.json`, then built-in `SNAPSHOT_GLOBAL` | Built-in values are emergency defaults and stale by design. |
| Fear and Greed | Alternative.me `/fng/` | `data/fng.json`, then built-in `SNAPSHOT_FNG` | Live-first; fallback must be displayed as snapshot/fallback. |
| Historical chart | Binance klines for the chart adapter; CoinGecko market chart in provider implementation | Sparkline from `data/top.json` | Binance OHLCV is canonical for technical analysis; sparkline fallback is close-only and degraded. |
| Multi-timeframe OHLCV | Binance `/api/v3/klines` for `1d`, `4h`, `1h`, and `15m` | No fabricated candle fallback; analysis may degrade to the single chart path | RSI, EMA, MACD, ATR, BOS/CHOCH, and liquidity calculations are local calculations over returned candles. |
| Crypto news | CoinDesk, Cointelegraph, and Decrypt RSS through the first-party proxy | Embedded `data/news.json` / `js/data/news-snapshot.js`, then fixed snapshot URLs | RSS is live-first. The repository news snapshot is fallback content and was dated September 12–14, 2026 at audit time. |
| Gem discovery | DEX Screener token boosts, profiles, and token pairs | No synthetic Gem candidates; UI reports provider failure or no candidates | Gem scoring is local heuristic analysis of returned DEX data. |
| Token Shield | GoPlus token-security APIs for EVM and Solana | Five-minute Shield cache; missing/error/unsupported states remain explicit | Security assessment is provider-backed when verified; it is not a mock safety result. |
| AI insights | Configured LLM path in `js/features/ai.js` | Explicit degraded LLM fallback/error path | Must not be presented as generated live intelligence when the provider is unavailable. |
| Portfolio and settings | Local browser storage | Local-only by design | Not external market data. |

## Technical-analysis provenance

`js/intelligence/technical-analysis.js` consumes `W.api.ohlcv`. The canonical adapter preserves timestamp, open, high, low, close, volume, and quote volume. ATR is calculated from true range, and market structure/liquidity zones are derived locally from those candles. These outputs are **computed from live or cached candles**, not hardcoded signals. If OHLCV fails, the engine falls back to the chart method; that path is explicitly lower fidelity because it may contain close-only data.

No algorithm can guarantee 95–100% accuracy. The output is probabilistic evidence and should remain scenario-oriented.

## Gem → Shield → Analysis → Verdict path

The integration now uses a shared in-memory Shield evidence registry:

```text
Gem Agent
  → W.gems.checkShield(address, chain, identity)
  → W.shield.check()
  → W.shield.rememberEvidence()
  → W.shield.getEvidence({symbol, coingeckoId})
  → Token Analysis evidenceDomains.security
  → Unified Verdict security domain and provenance
```

Successful Shield evidence is marked `source: "goplus"`, carries an observation timestamp, chain, address, risk score, risk reasons, and Shield score version. Unsupported, failed, and no-data results are not promoted to verified evidence. The registry is session-memory scoped; a browser reload requires a new Shield verification.

The Gem card now provides a direct `#/token/<symbol>` Analyze route after the Shield step, making the handoff discoverable. The end-to-end regression test is `test/integration/shield-analysis-verdict.test.js`.

## Test-only mocks and fixtures

The following are intentionally non-production and must not be used as evidence of live connectivity:

- `test/setup.js` mocked store, API, evidence, portfolio, and intelligence helpers.
- Unit tests use deterministic OHLCV, decision, and Unified Verdict fixtures.
- Integration tests use controlled provider responses.
- `data/*.json` and the embedded news snapshot are production fallback assets, not test mocks, but they are not guaranteed current.

## Remaining operational checks

Before release, inspect `W.api.source` and the data-health panel after a live request, then force provider failure and confirm the UI labels the resulting cache/snapshot/fallback state. Run the browser flow: Gem scan, Shield verification, Analyze link, Unified Verdict security status, hard refresh, and auto-refresh interval. A reload intentionally clears the in-memory Shield handoff unless Shield is run again or a persistent, expiry-aware evidence store is added later. 