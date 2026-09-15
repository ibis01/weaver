// ===============================================================
// Technical Analysis — OHLCV indicators and market structure
// ===============================================================
window.W = window.W || {};

W.technicalAnalysis = (() => {
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const round = (n, digits = 2) => Number(Number(n).toFixed(digits));

  function normalizeCandles(input) {
    return (Array.isArray(input) ? input : [])
      .map((candle) => {
        if (Array.isArray(candle)) {
          return {
            timestamp: Number(candle[0]),
            open: Number(candle[1]),
            high: Number(candle[2] ?? candle[1]),
            low: Number(candle[3] ?? candle[1]),
            close: Number(candle[4] ?? candle[1]),
            volume: Number(candle[5] ?? 0),
            quoteVolume: Number(candle[7] ?? 0),
          };
        }
        return {
          timestamp: Number(candle.timestamp),
          open: Number(candle.open),
          high: Number(candle.high),
          low: Number(candle.low),
          close: Number(candle.close),
          volume: Number(candle.volume ?? 0),
          quoteVolume: Number(candle.quoteVolume ?? 0),
        };
      })
      .filter(
        (c) =>
          [c.timestamp, c.open, c.high, c.low, c.close].every(
            Number.isFinite,
          ) &&
          c.high >= c.low &&
          c.volume >= 0,
      );
  }

  function ema(values, period) {
    if (!values.length) return null;
    const seedLength = Math.min(period, values.length);
    let value =
      values.slice(0, seedLength).reduce((a, b) => a + b, 0) / seedLength;
    const k = 2 / (period + 1);
    for (let i = seedLength; i < values.length; i++)
      value = values[i] * k + value * (1 - k);
    return value;
  }

  function rsi(values, period = 14) {
    if (values.length <= period) return null;
    let gains = 0,
      losses = 0;
    for (let i = 1; i <= period; i++) {
      const d = values[i] - values[i - 1];
      if (d >= 0) gains += d;
      else losses -= d;
    }
    let gain = gains / period,
      loss = losses / period;
    for (let i = period + 1; i < values.length; i++) {
      const d = values[i] - values[i - 1];
      gain = (gain * (period - 1) + Math.max(d, 0)) / period;
      loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    }
    return loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }

  function atr(candles, period = 14) {
    if (candles.length <= period) return null;
    const ranges = candles
      .slice(1)
      .map((c, i) =>
        Math.max(
          c.high - c.low,
          Math.abs(c.high - candles[i].close),
          Math.abs(c.low - candles[i].close),
        ),
      );
    let value = ranges.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < ranges.length; i++)
      value = (value * (period - 1) + ranges[i]) / period;
    return value;
  }

  function stddev(values) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(
      values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length,
    );
  }

  function detectSwingPoints(candles, lookback = 2) {
    const highs = [],
      lows = [];
    for (let i = lookback; i < candles.length - lookback; i++) {
      const left = candles.slice(i - lookback, i),
        right = candles.slice(i + 1, i + lookback + 1);
      if (
        candles[i].high >
        Math.max(...left.map((c) => c.high), ...right.map((c) => c.high))
      )
        highs.push({
          index: i,
          price: candles[i].high,
          timestamp: candles[i].timestamp,
        });
      if (
        candles[i].low <
        Math.min(...left.map((c) => c.low), ...right.map((c) => c.low))
      )
        lows.push({
          index: i,
          price: candles[i].low,
          timestamp: candles[i].timestamp,
        });
    }
    return { highs, lows };
  }

  function marketStructure(candles, points, atrValue = 0) {
    const highs = points.highs,
      lows = points.lows;
    const lastHighs = highs.slice(-2),
      lastLows = lows.slice(-2);
    const higherHigh =
      lastHighs.length === 2 && lastHighs[1].price > lastHighs[0].price;
    const higherLow =
      lastLows.length === 2 && lastLows[1].price > lastLows[0].price;
    const lowerHigh =
      lastHighs.length === 2 && lastHighs[1].price < lastHighs[0].price;
    const lowerLow =
      lastLows.length === 2 && lastLows[1].price < lastLows[0].price;
    const bias =
      higherHigh && higherLow
        ? "bullish"
        : lowerHigh && lowerLow
          ? "bearish"
          : "neutral";
    const last = candles[candles.length - 1];
    const recentHigh = highs[highs.length - 1],
      recentLow = lows[lows.length - 1];
    const threshold = atrValue * 0.1;
    const bullishBreak =
      recentHigh && last.close > recentHigh.price + threshold;
    const bearishBreak = recentLow && last.close < recentLow.price - threshold;
    const priorBias =
      higherHigh || higherLow
        ? "bullish"
        : lowerHigh || lowerLow
          ? "bearish"
          : "neutral";
    const choch =
      bullishBreak && priorBias === "bearish"
        ? "bullish"
        : bearishBreak && priorBias === "bullish"
          ? "bearish"
          : null;
    return {
      bias,
      label:
        bias === "bullish"
          ? "Bullish structure (HH + HL)"
          : bias === "bearish"
            ? "Bearish structure (LH + LL)"
            : "Range / mixed structure",
      higherHigh,
      higherLow,
      lowerHigh,
      lowerLow,
      bos: bullishBreak
        ? {
            direction: "bullish",
            level: recentHigh.price,
            timestamp: last.timestamp,
          }
        : bearishBreak
          ? {
              direction: "bearish",
              level: recentLow.price,
              timestamp: last.timestamp,
            }
          : null,
      choch: choch ? { direction: choch, timestamp: last.timestamp } : null,
      breakOfStructure: bullishBreak
        ? "Bullish break of structure"
        : bearishBreak
          ? "Bearish break of structure"
          : "No confirmed break of structure",
    };
  }

  function liquidityZones(input, timeframe) {
    const candles = normalizeCandles(input),
      points = detectSwingPoints(candles),
      atrValue = atr(candles) || 0;
    const tolerance = Math.max(
      atrValue * 0.2,
      (candles[candles.length - 1]?.close || 0) * 0.001,
    );
    const zones = [];
    function cluster(items, type) {
      items.forEach((item) => {
        const zone = zones.find(
          (z) => Math.abs(z.level - item.price) <= tolerance && z.type === type,
        );
        if (zone) {
          zone.touches += 1;
          zone.level =
            (zone.level * (zone.touches - 1) + item.price) / zone.touches;
          zone.strength = clamp(50 + zone.touches * 12, 0, 95);
        } else
          zones.push({
            type,
            timeframe,
            level: item.price,
            range: [item.price - tolerance, item.price + tolerance],
            touches: 1,
            strength: 62,
          });
      });
    }
    cluster(points.highs.slice(-12), "buy-side-liquidity");
    cluster(points.lows.slice(-12), "sell-side-liquidity");
    const last = candles[candles.length - 1];
    zones.forEach((zone) => {
      zone.swept =
        zone.type === "buy-side-liquidity"
          ? last.high > zone.range[1] && last.close < zone.level
          : last.low < zone.range[0] && last.close > zone.level;
      zone.level = round(zone.level);
      zone.range = zone.range.map((n) => round(n));
    });
    return zones.sort((a, b) => b.strength - a.strength).slice(0, 20);
  }

  function aggregateLiquidity(timeframeResults) {
    const combined = Object.entries(timeframeResults).flatMap(
      ([timeframe, result]) =>
        (result.liquidityZones || []).map((zone) => ({ ...zone, timeframe })),
    );
    const tolerance = combined.length
      ? Math.max(...combined.map((z) => Math.abs(z.range[1] - z.range[0])))
      : 0;
    const merged = [];
    combined.forEach((zone) => {
      const match = merged.find(
        (z) =>
          z.type === zone.type && Math.abs(z.level - zone.level) <= tolerance,
      );
      if (match) {
        match.timeframes = [...new Set([...match.timeframes, zone.timeframe])];
        match.touches += zone.touches;
        match.strength = clamp(match.strength + zone.strength * 0.15, 0, 100);
        match.swept ||= zone.swept;
      } else merged.push({ ...zone, timeframes: [zone.timeframe] });
    });
    return merged.sort((a, b) => b.strength - a.strength);
  }

  function analyzeCandles(input) {
    const candles = normalizeCandles(input);
    if (candles.length < 20)
      throw new Error(
        "At least 20 OHLCV candles are required for technical analysis",
      );
    const closes = candles.map((c) => c.close),
      current = candles[candles.length - 1].close;
    const atrValue = atr(candles),
      ema20 = ema(closes, 20),
      ema50 = ema(closes, 50),
      rsiValue = rsi(closes);
    const ema12 = ema(closes, 12),
      ema26 = ema(closes, 26),
      macd = ema12 - ema26;
    const bands = closes.slice(-20),
      mid = bands.reduce((a, b) => a + b, 0) / bands.length,
      width = stddev(bands) * 2;
    const bollingerPosition = width
      ? (current - (mid - width)) / (width * 2)
      : 0.5;
    const points = detectSwingPoints(candles),
      structure = marketStructure(candles, points, atrValue || 0);
    const trend =
      current > ema20 && ema20 > (ema50 ?? ema20)
        ? "uptrend"
        : current < ema20 && ema20 < (ema50 ?? ema20)
          ? "downtrend"
          : "sideways / transition";
    const rsiBias =
      rsiValue >= 70
        ? "overbought"
        : rsiValue <= 30
          ? "oversold"
          : rsiValue >= 50
            ? "bullish momentum"
            : "bearish momentum";
    const recent = candles.slice(-20),
      rangeHigh = Math.max(...recent.map((c) => c.high)),
      rangeLow = Math.min(...recent.map((c) => c.low));
    const displacement =
      ((current - closes[Math.max(0, closes.length - 6)]) /
        closes[Math.max(0, closes.length - 6)]) *
      100;
    const volumeAvg =
      candles.slice(-21, -1).reduce((s, c) => s + c.volume, 0) /
      Math.max(1, Math.min(20, candles.length - 1));
    const relativeVolume = volumeAvg
      ? candles[candles.length - 1].volume / volumeAvg
      : null;
    const support =
      points.lows.filter((x) => x.price < current).slice(-1)[0]?.price ??
      rangeLow;
    const resistance =
      points.highs.filter((x) => x.price > current).slice(-1)[0]?.price ??
      rangeHigh;
    const sweptHigh =
      candles[candles.length - 1].high > rangeHigh &&
      current < rangeHigh &&
      displacement < 0;
    const sweptLow =
      candles[candles.length - 1].low < rangeLow &&
      current > rangeLow &&
      displacement > 0;
    const smc = {
      bias: structure.bias,
      orderBlock:
        structure.bias === "bullish"
          ? `Demand zone near ${round(support)}`
          : structure.bias === "bearish"
            ? `Supply zone near ${round(resistance)}`
            : "No high-confidence order block",
      liquidity: sweptHigh
        ? "Buy-side liquidity sweep"
        : sweptLow
          ? "Sell-side liquidity sweep"
          : "No confirmed liquidity sweep",
      displacement: round(displacement),
      relativeVolume: relativeVolume == null ? null : round(relativeVolume),
      limitation:
        "Order-block classification is simplified; validate with full multi-timeframe context.",
    };
    const confluence =
      (trend === "uptrend" ? 1 : trend === "downtrend" ? -1 : 0) +
      (rsiValue >= 50 ? 1 : -1) +
      (macd > 0 ? 1 : -1) +
      (structure.bias === "bullish"
        ? 1
        : structure.bias === "bearish"
          ? -1
          : 0) +
      (bollingerPosition > 0.8 ? -1 : bollingerPosition < 0.2 ? 1 : 0);
    const score = clamp(50 + confluence * 10, 0, 100);
    return {
      source: "ohlcv",
      points: candles.length,
      current: round(current),
      atr: round(atrValue),
      rsi: round(rsiValue),
      rsiBias,
      ema20: round(ema20),
      ema50: ema50 == null ? null : round(ema50),
      trend,
      macd: round(macd),
      bollingerPosition: round(bollingerPosition * 100),
      volatility: round(
        stddev(closes.slice(1).map((v, i) => (v - closes[i]) / closes[i])) *
          Math.sqrt(365) *
          100,
      ),
      relativeVolume: relativeVolume == null ? null : round(relativeVolume),
      swingPoints: points,
      structure,
      smc,
      liquidityZones: liquidityZones(candles, "1h"),
      support: round(support),
      resistance: round(resistance),
      confluence: `${Math.abs(confluence)}/5 signals agree`,
      bias: score >= 60 ? "bullish" : score <= 40 ? "bearish" : "neutral",
      score: round(score),
      confidence: round(
        clamp(45 + Math.min(35, candles.length / 4) + (ema50 ? 10 : 0), 0, 90),
      ),
    };
  }

  function analyzeSeries(series) {
    return analyzeCandles(series);
  }
  async function analyzeMultiTimeframe(assetId) {
    if (!W.api?.ohlcv) throw new Error("OHLCV market API unavailable");
    const configs = { "1d": 300, "4h": 500, "1h": 500, "15m": 500 };
    const entries = await Promise.all(
      Object.entries(configs).map(async ([timeframe, limit]) => {
        const candles = await W.api.ohlcv(assetId, timeframe, limit);
        return [timeframe, candles, analyzeCandles(candles)];
      }),
    );
    const timeframes = Object.fromEntries(
      entries.map(([timeframe, , result]) => [timeframe, result]),
    );
    entries.forEach(([timeframe, candles, result]) => {
      result.liquidityZones = liquidityZones(candles, timeframe);
    });
    return {
      primary: timeframes["1h"],
      timeframes,
      liquidityZones: aggregateLiquidity(timeframes),
      timeframeAlignment:
        Object.values(timeframes).filter(
          (r) => r.bias === timeframes["1h"].bias,
        ).length + "/4",
    };
  }
  async function analyze(assetId, days = 90) {
    if (W.api?.ohlcv) {
      try {
        const multi = await analyzeMultiTimeframe(assetId);
        return {
          ...multi.primary,
          multiTimeframe: {
            timeframes: multi.timeframes,
            liquidityZones: multi.liquidityZones,
            timeframeAlignment: multi.timeframeAlignment,
          },
        };
      } catch (e) {
        console.warn(
          "[TechnicalAnalysis] Multi-timeframe OHLCV unavailable, using single timeframe:",
          e.message,
        );
      }
    }
    if (!W.api?.chart) throw new Error("Market chart API unavailable");
    return analyzeCandles(await W.api.chart(assetId, days));
  }
  return {
    analyze,
    analyzeMultiTimeframe,
    analyzeCandles,
    analyzeSeries,
    normalizeCandles,
    atr,
    detectSwingPoints,
    marketStructure,
    liquidityZones,
    aggregateLiquidity,
    rsi,
    ema,
  };
})();
console.log(
  "[TechnicalAnalysis] OHLCV, ATR, RSI, BOS/CHOCH, and SMC engine loaded.",
);
