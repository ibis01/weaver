// ===============================================================
// Technical Analysis — deterministic market-derived indicators
// ===============================================================
window.W = window.W || {};

W.technicalAnalysis = (() => {
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const round = (n, digits = 2) => Number(Number(n).toFixed(digits));

  function ema(values, period) {
    if (!values.length) return null;
    const k = 2 / (period + 1);
    let value =
      values
        .slice(0, Math.min(period, values.length))
        .reduce((a, b) => a + b, 0) / Math.min(period, values.length);
    for (let i = Math.min(period, values.length); i < values.length; i++)
      value = values[i] * k + value * (1 - k);
    return value;
  }

  function rsi(values, period = 14) {
    if (values.length <= period) return null;
    let gains = 0,
      losses = 0;
    for (let i = 1; i <= period; i++) {
      const delta = values[i] - values[i - 1];
      if (delta >= 0) gains += delta;
      else losses -= delta;
    }
    let avgGain = gains / period,
      avgLoss = losses / period;
    for (let i = period + 1; i < values.length; i++) {
      const delta = values[i] - values[i - 1];
      avgGain = (avgGain * (period - 1) + Math.max(delta, 0)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.max(-delta, 0)) / period;
    }
    if (avgLoss === 0) return 100;
    return 100 - 100 / (1 + avgGain / avgLoss);
  }

  function stddev(values) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(
      values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
        values.length,
    );
  }

  function swings(values, lookback = 2) {
    const highs = [],
      lows = [];
    for (let i = lookback; i < values.length - lookback; i++) {
      const left = values.slice(i - lookback, i),
        right = values.slice(i + 1, i + lookback + 1);
      if (values[i] > Math.max(...left, ...right))
        highs.push({ index: i, value: values[i] });
      if (values[i] < Math.min(...left, ...right))
        lows.push({ index: i, value: values[i] });
    }
    return { highs, lows };
  }

  function structure(values, swingData) {
    const { highs, lows } = swingData;
    const lastHighs = highs.slice(-2),
      lastLows = lows.slice(-2);
    const higherHigh =
      lastHighs.length === 2 && lastHighs[1].value > lastHighs[0].value;
    const higherLow =
      lastLows.length === 2 && lastLows[1].value > lastLows[0].value;
    const lowerHigh =
      lastHighs.length === 2 && lastHighs[1].value < lastHighs[0].value;
    const lowerLow =
      lastLows.length === 2 && lastLows[1].value < lastLows[0].value;
    const bullish = higherHigh && higherLow;
    const bearish = lowerHigh && lowerLow;
    const last = values[values.length - 1];
    const priorHigh = highs.length ? highs[highs.length - 1].value : last;
    const priorLow = lows.length ? lows[lows.length - 1].value : last;
    return {
      label: bullish
        ? "Bullish structure (HH + HL)"
        : bearish
          ? "Bearish structure (LH + LL)"
          : "Range / mixed structure",
      bias: bullish ? "bullish" : bearish ? "bearish" : "neutral",
      breakOfStructure:
        last > priorHigh
          ? "Bullish break of structure"
          : last < priorLow
            ? "Bearish break of structure"
            : "No confirmed break of structure",
      higherHigh,
      higherLow,
      lowerHigh,
      lowerLow,
    };
  }

  function analyzeSeries(series) {
    const values = series
      .map((point) => (Array.isArray(point) ? Number(point[1]) : Number(point)))
      .filter(Number.isFinite);
    if (values.length < 20)
      throw new Error(
        "At least 20 price points are required for technical analysis",
      );
    const current = values[values.length - 1];
    const ema20 = ema(values, 20),
      ema50 = ema(values, 50);
    const rsiValue = rsi(values);
    const ema12 = ema(values, 12),
      ema26 = ema(values, 26);
    const macd = ema12 - ema26;
    const bandValues = values.slice(-20);
    const bandMid = bandValues.reduce((a, b) => a + b, 0) / bandValues.length;
    const bandWidth = stddev(bandValues) * 2;
    const bollingerPosition = bandWidth
      ? (current - (bandMid - bandWidth)) / (bandWidth * 2)
      : 0.5;
    const returns = values
      .slice(1)
      .map((value, i) => (value - values[i]) / values[i]);
    const volatility = stddev(returns) * Math.sqrt(365) * 100;
    const swingData = swings(values);
    const marketStructure = structure(values, swingData);
    const recent = values.slice(-20);
    const rangeHigh = Math.max(...recent),
      rangeLow = Math.min(...recent);
    const displacement =
      ((current - values[Math.max(0, values.length - 6)]) /
        values[Math.max(0, values.length - 6)]) *
      100;
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
    const nearestSupport =
      swingData.lows.filter((x) => x.value < current).slice(-1)[0]?.value ??
      rangeLow;
    const nearestResistance =
      swingData.highs.filter((x) => x.value > current).slice(-1)[0]?.value ??
      rangeHigh;
    const sweptHigh = current > rangeHigh * 0.998 && displacement < 0;
    const sweptLow = current < rangeLow * 1.002 && displacement > 0;
    const smc = {
      bias: marketStructure.bias,
      orderBlock:
        marketStructure.bias === "bullish"
          ? `Demand zone near ${round(nearestSupport)}`
          : marketStructure.bias === "bearish"
            ? `Supply zone near ${round(nearestResistance)}`
            : "No high-confidence order block from close-only data",
      liquidity: sweptHigh
        ? "Possible buy-side liquidity sweep"
        : sweptLow
          ? "Possible sell-side liquidity sweep"
          : "No confirmed liquidity sweep",
      displacement: round(displacement),
      limitation:
        "SMC zones are inferred from swing closes; true candle order blocks require OHLC volume data.",
    };
    const macdBias = macd > 0 ? 1 : -1;
    const bandBias =
      bollingerPosition > 0.8 ? -1 : bollingerPosition < 0.2 ? 1 : 0;
    const confluence =
      (trend === "uptrend" ? 1 : trend === "downtrend" ? -1 : 0) +
      (rsiValue >= 50 ? 1 : -1) +
      macdBias +
      (marketStructure.bias === "bullish"
        ? 1
        : marketStructure.bias === "bearish"
          ? -1
          : 0) +
      bandBias;
    const score = clamp(50 + confluence * 10, 0, 100);
    return {
      points: values.length,
      current: round(current),
      rsi: round(rsiValue),
      rsiBias,
      ema20: round(ema20),
      ema50: ema50 == null ? null : round(ema50),
      trend,
      macd: round(macd),
      bollingerPosition: round(bollingerPosition * 100),
      volatility: round(volatility),
      confluence: `${Math.abs(confluence)}/5 independent close-price signals agree`,
      structure: marketStructure,
      smc,
      support: round(nearestSupport),
      resistance: round(nearestResistance),
      bias: score >= 60 ? "bullish" : score <= 40 ? "bearish" : "neutral",
      score: round(score),
      confidence: round(
        clamp(45 + Math.min(35, values.length / 4) + (ema50 ? 10 : 0), 0, 90),
      ),
    };
  }

  async function analyze(assetId, days = 90) {
    if (!W.api?.chart) throw new Error("Market chart API unavailable");
    const series = await W.api.chart(assetId, days);
    return analyzeSeries(series);
  }
  return { analyze, analyzeSeries, rsi, ema };
})();
console.log(
  "[TechnicalAnalysis] RSI, trend, structure, and SMC engine loaded.",
);
