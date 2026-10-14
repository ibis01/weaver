# Weaver meme-intelligence efficiency plan

## Current bottleneck

The Gem Agent currently performs live discovery in the browser. Every scan requests DexScreener boosts, profiles, token pairs, and trending-symbol searches, then performs bounded security enrichment. The PEPE historical cohort is now wired as an explicit evidence source, but it remains a validation input rather than a predictive score feature.

The most important immediate optimization is request reuse: repeated scans can ask for the same latest endpoints and the same PEPE token-pair data again. This wastes provider budget, increases latency, and makes rate-limit failures more likely.

## Implemented in this revision

- Added an in-memory TTL cache for successful DexScreener responses.
- Coalesced concurrent requests for the same URL into one in-flight request.
- Used shorter TTLs for latest discovery feeds and a longer TTL for token-pair lookups.
- Kept failures out of the cache so transient errors can recover on the next scan.
- Preserved the existing bounded shield and deployer-enrichment caps.

## Recommended target architecture

1. **Browser:** render, filter, and show freshness; do not own multi-provider polling.
2. **Proxy/worker:** perform discovery on a schedule, enforce provider budgets, validate responses, and persist normalized snapshots.
3. **Redis:** hold the latest normalized candidate snapshot and historical timeline.
4. **Browser API:** request one normalized discovery payload per scan rather than calling multiple providers directly.
5. **Evidence layers:** keep live market evidence, security evidence, and historical validation evidence separate.
6. **Calibration:** only promote a historical cohort into a model feature after pre-registered Stage 1/Stage 2 validation and out-of-sample testing.

## Provider implications

DexScreener documents separate limits for discovery and pair endpoints and supports batch token-pair retrieval. Weaver should use one batch lookup for the deduplicated address set, not one request per candidate. [1]

GeckoTerminal documents approximately 10 public calls per minute and one-minute endpoint caching. It should be a corroboration provider, not the primary high-frequency scanner, unless a paid/API-key tier is configured. [2]

Blockscout documents that its production PRO API provides higher and more predictable limits, with a unified multichain endpoint and API key. Historical wallet validation should use a configured provider adapter with bounded block ranges and fail-closed pagination, rather than depending on an unkeyed public endpoint. [3] [4]

## Next production gates

- Move scheduled discovery and security enrichment behind the proxy/worker.
- Add provider-specific budgets and circuit-breaker state to Redis.
- Store normalized source timestamps and response schema versions.
- Add a candidate-level provenance graph: source, observed time, endpoint, response hash, and validation status.
- Run Stage 1 swap verification on the eight PEPE EOA candidates.
- Build independent negative controls before allowing historical evidence to affect ranking.
- Backtest score versions with walk-forward splits and report precision, recall, false-positive rate, and calibration error.
- Keep all output descriptive and user-controlled; no automatic trading or transaction submission.

## References

[1]: https://docs.dexscreener.com/api/reference "DEX Screener API reference"
[2]: https://api.geckoterminal.com/docs/index.html "GeckoTerminal API documentation"
[3]: https://docs.blockscout.com/devs/apis "Blockscout API usage guidance"
[4]: https://docs.blockscout.com/devs/migrate-from-etherscan "Blockscout PRO API migration guidance"
