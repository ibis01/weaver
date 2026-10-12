# PEPE Stage 1 historical window

## Recommended dates

Use **2026-08-19 UTC as the pump onset** and **2026-08-12 through 2026-08-19 UTC as the primary pre-pump window**.

The verifier treats `windowEnd`/`pumpDay` as exclusive, so a transfer at or after `2026-08-19T00:00:00Z` is not counted as an early entry in the primary audit.

```bash
node scripts/pattern-check-v2.js \
  --window-start 2026-08-12 \
  --pump-day 2026-08-19 \
  --output gold-pattern-check-v2.json
```

## Why these dates

Binance PEPE/USDT daily candles show a quiet baseline on August 15–18, followed by the first clear breakout on August 19. The close moved from approximately `0.00000258` on August 18 to `0.00000287` on August 19, then to `0.00000321` on August 20 and `0.00000412` on August 21. The August 21 close was approximately 43.6% above the August 18 close, and the August 22 candle reached an intraday high near `0.00000456`.

Contemporary reporting on August 21 described two consecutive double-digit gain days and a roughly 25% weekly gain, consistent with August 19 being the start of the acceleration rather than August 22 being the start. [1]

The August 22 date is still important as the **climax/peak-day sensitivity window**, not as the primary onset date. For comparison, rerun with:

```bash
node scripts/pattern-check-v2.js \
  --window-start 2026-08-15 \
  --pump-day 2026-08-22 \
  --output gold-pattern-check-v2-peak-window.json
```

This secondary run answers a different question: which wallets entered before the peak-day climax, including entries during the August 19–21 acceleration.

## Interpretation rule

- **Primary causal-pre-entry test:** `2026-08-12` inclusive through `2026-08-19` exclusive.
- **Short sensitivity test:** `2026-08-15` inclusive through `2026-08-19` exclusive.
- **Peak-day sensitivity test:** `2026-08-15` inclusive through `2026-08-22` exclusive.

Do not combine these windows into one result. Report them separately because the peak-day window can include wallets that entered after the rally had already become visible.

## Important caveat

This is the correct window for the **August 2026 rally** supported by the current wallet-analysis context. PEPE also had major historical moves in other periods. CoinMarketCap describes the original launch-era surge as late April to May 2023, and CoinGecko reports a later all-time high in December 2024. Those are separate events and require separate wallet cohorts and windows. [2] [3]

## References

[1]: https://www.fxstreet.com/cryptocurrencies/news/pepe-price-forecast-whale-activity-retail-speculation-fuel-fresh-pepe-rally-202608210525 "FXStreet: Pepe price forecast and August 21, 2026 rally report"
[2]: https://coinmarketcap.com/currencies/pepe/ "CoinMarketCap: Pepe overview and historical surge context"
[3]: https://www.coingecko.com/en/coins/pepe "CoinGecko: Pepe price page and all-time-high context"
[4]: https://api.binance.com/api/v3/klines?symbol=PEPEUSDT&interval=1d&startTime=1786752000000&endTime=1788134400000&limit=100 "Binance: PEPE/USDT daily candles for August 15–31, 2026"
