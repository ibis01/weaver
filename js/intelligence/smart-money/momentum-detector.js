// js/intelligence/smart-money/momentum-detector.js
//
// Classifies a token's current momentum state on three levels:
//
//   PRE_MOMENTUM       — price flat / volume normal / no confirmation
//   MOMENTUM_EMERGING  — early signals, no broad confirmation
//   MOMENTUM_CONFIRMED — price and volume have both moved
//
// The radar's entire value proposition is detecting the first state.
// A signal that fires during the third state is late, not early.
//
// DESIGN NOTES:
//   - Trailing-only windows. Every input is behind asOf.
//   - Thresholds are exposed via _internal for calibration.
//   - Failure returns momentumState:"unknown" with a named reason.
//     It never silently defaults to PRE_MOMENTUM. A silent default
//     would make every offline token look pre-momentum, which is
//     the exact opposite of honest.
//   - Never throws.

window.W = window.W || {};
window.W.smartMoney = window.W.smartMoney || {};

W.smartMoney.momentumDetector = (() => {
  "use strict";

  const MODULE_VERSION = "momentum-detector-v3";

  // Thresholds. Deliberately conservative for v1: PRE_MOMENTUM is
  // the narrow band. Calibration target: widen or narrow based on
  // the first backtest's false-positive rate.
  const PRICE_FLAT_PCT = 5;          // |1h return| below this = flat
  const PRICE_EMERGING_PCT = 15;     // 5 <= |1h| < 15 = emerging
  const VOLUME_Z_EMERGING = 1.5;     // 1h volume z >= this = emerging
  const VOLUME_Z_CONFIRMED = 2.5;    // 1h volume z >= this AND price >= emerging = confirmed
  const LOOKBACK_CANDLES = 24;       // 24 hourly candles
  const INTERVAL = "1h";
  // Providers in the W.api.ohlcv chain fall back through wildly
  // different cadences. CoinPaprika in particular ignores the
  // interval argument and returns daily candles. We refuse to
  // classify when the median gap between candles is not roughly
  // hourly, because the labels (return1h, return6h, volumeZ on
  // 1h volume) would all be lying about their cadence.
  const MIN_MEDIAN_GAP_MS = 30 * 60 * 1000;    // 30 min
  const MAX_MEDIAN_GAP_MS = 2 * 60 * 60 * 1000; // 2 h

  function emptyResult(input, reason) {
    const asOf =
      input && Number.isFinite(input.asOf) && input.asOf > 0
        ? input.asOf
        : Date.now();
    return {
      tokenAddress:
        input && typeof input.tokenAddress === "string"
          ? input.tokenAddress
          : null,
      asOf,
      momentumState: "unknown",
      reason,
      signals: null,
      _limitations: {
        ohlcvSource:
          "momentum state is derived from public OHLCV. When the OHLCV " +
          "provider chain is unreachable, state is 'unknown' — never " +
          "silently assumed PRE_MOMENTUM.",
      },
    };
  }

  // Pure. Median gap in ms between consecutive candle timestamps.
  // Returns null when there are fewer than 2 timestamped candles.
  // Median is robust to a single misfiled candle.
  function medianGapMs(candles) {
    if (!Array.isArray(candles) || candles.length < 2) return null;
    const ts = candles
      .map((c) => (c && Number.isFinite(c.timestamp) ? c.timestamp : null))
      .filter((t) => t !== null)
      .sort((a, b) => a - b);
    if (ts.length < 2) return null;
    const gaps = [];
    for (let i = 1; i < ts.length; i++) {
      const d = ts[i] - ts[i - 1];
      if (d > 0) gaps.push(d);
    }
    if (!gaps.length) return null;
    gaps.sort((a, b) => a - b);
    const mid = Math.floor(gaps.length / 2);
    return gaps.length % 2 === 0
      ? (gaps[mid - 1] + gaps[mid]) / 2
      : gaps[mid];
  }

  // Pure. Given an OHLCV array (oldest-first) and asOf, returns
  // { return1h, return6h, return24h, volumeZ } — each either a
  // finite number or null. Malformed candles are dropped, not
  // coerced.
  function computeSignals(candles, asOf) {
    if (!Array.isArray(candles) || candles.length < 2) return null;
    if (!Number.isFinite(asOf)) return null;

    // Trailing only. Drop anything after asOf.
    const c = candles.filter(
      (x) =>
        x &&
        Number.isFinite(x.timestamp) &&
        x.timestamp <= asOf &&
        Number.isFinite(x.close) &&
        x.close > 0,
    );
    if (c.length < 2) return null;

    const last = c[c.length - 1].close;

    const changeSince = (candlesBack) => {
      const idx = c.length - 1 - candlesBack;
      if (idx < 0) return null;
      const p = c[idx].close;
      if (!Number.isFinite(p) || p <= 0) return null;
      return ((last - p) / p) * 100;
    };

    const return1h = changeSince(1);
    const return6h = changeSince(6);
    const return24h = changeSince(23);

    // Volume z-score on the last candle vs the previous candles.
    const vols = c
      .slice(0, c.length - 1)
      .map((x) => x.volume)
      .filter((v) => Number.isFinite(v) && v >= 0);
    let volumeZ = null;
    if (vols.length >= 5) {
      const mean = vols.reduce((s, v) => s + v, 0) / vols.length;
      const variance =
        vols.reduce((s, v) => s + (v - mean) * (v - mean), 0) / vols.length;
      const sd = Math.sqrt(variance);
      const lastVol = c[c.length - 1].volume;
      if (
        Number.isFinite(lastVol) &&
        Number.isFinite(sd) &&
        sd > 0
      ) {
        volumeZ = (lastVol - mean) / sd;
      }
    }

    return { return1h, return6h, return24h, volumeZ };
  }

  // Pure. Given signals, returns one of the three states.
  // Missing signals do not default to PRE_MOMENTUM — the caller
  // treats null signals as 'unknown'.
  function classify(signals) {
    if (!signals) return null;
    const r1 = signals.return1h;
    const r6 = signals.return6h;
    const vz = signals.volumeZ;

    const priceMagnitude =
      Number.isFinite(r1) && Number.isFinite(r6)
        ? Math.max(Math.abs(r1), Math.abs(r6))
        : Number.isFinite(r1)
          ? Math.abs(r1)
          : Number.isFinite(r6)
            ? Math.abs(r6)
            : null;

    if (priceMagnitude === null) return null;

    if (
      priceMagnitude >= PRICE_EMERGING_PCT &&
      Number.isFinite(vz) &&
      vz >= VOLUME_Z_CONFIRMED
    ) {
      return "MOMENTUM_CONFIRMED";
    }
    if (
      priceMagnitude >= PRICE_EMERGING_PCT ||
      (Number.isFinite(vz) && vz >= VOLUME_Z_EMERGING)
    ) {
      return "MOMENTUM_EMERGING";
    }
    if (priceMagnitude < PRICE_FLAT_PCT) {
      return "PRE_MOMENTUM";
    }
    return "MOMENTUM_EMERGING"; // 5 <= magnitude < 15 falls here
  }

  // Pure. Runs normalization + cadence guard + signal computation
  // + classification on a supplied candle array. This is the exact
  // path production detect() runs; exposing it here is what lets us
  // test the guard deterministically without monkey-patching the
  // frozen W.api object.
  //
  // Returns { state, reason, signals } — state may be "unknown"
  // with a named reason. Never throws.
  function classifyFromCandles(candles, asOf) {
    if (!Number.isFinite(asOf)) {
      return { state: "unknown", reason: "invalid-asof", signals: null };
    }
    if (!Array.isArray(candles) || candles.length < 2) {
      return { state: "unknown", reason: "ohlcv-malformed", signals: null };
    }
    const norm = candles
      .map((c) => {
        if (!c || typeof c !== "object") return null;
        const ts = Number(c.timestamp);
        const close = Number(c.close);
        const volume = Number(c.volume);
        if (!Number.isFinite(ts) || !Number.isFinite(close)) return null;
        return {
          timestamp: ts,
          close,
          volume: Number.isFinite(volume) && volume >= 0 ? volume : 0,
        };
      })
      .filter(Boolean);
    if (norm.length < 2) {
      return { state: "unknown", reason: "ohlcv-malformed", signals: null };
    }

    const gapMs = medianGapMs(norm);
    if (
      !Number.isFinite(gapMs) ||
      gapMs < MIN_MEDIAN_GAP_MS ||
      gapMs > MAX_MEDIAN_GAP_MS
    ) {
      return {
        state: "unknown",
        reason: "unexpected-candle-interval",
        signals: null,
        medianGapMs: gapMs,
      };
    }

    const signals = computeSignals(norm, asOf);
    if (!signals) {
      return {
        state: "unknown",
        reason: "signals-computation-failed",
        signals: null,
      };
    }
    const state = classify(signals);
    if (!state) {
      return {
        state: "unknown",
        reason: "classification-failed",
        signals: null,
      };
    }
    return { state, reason: "ok", signals };
  }

  // Public. Fetches OHLCV via W.api.ohlcv and classifies.
  //
  // input = {
  //   tokenId: <coingecko ID or symbol>,
  //   chain: "ethereum",
  //   tokenAddress: "0x...",
  //   asOf: <ms>   // optional; default Date.now()
  // }
  async function detect(input) {
    if (!input || typeof input !== "object")
      return emptyResult(input, "invalid-input");
    if (typeof input.tokenId !== "string" || !input.tokenId)
      return emptyResult(input, "missing-token-id");

    const asOf =
      Number.isFinite(input.asOf) && input.asOf > 0 ? input.asOf : Date.now();

    if (!W.api || typeof W.api.ohlcv !== "function") {
      return emptyResult(input, "ohlcv-api-unavailable");
    }

    let candles;
    try {
      candles = await W.api.ohlcv(input.tokenId, INTERVAL, LOOKBACK_CANDLES);
    } catch (e) {
      console.warn(
        "[MomentumDetector] ohlcv failed for",
        input.tokenId,
        e && e.message,
      );
      return emptyResult(input, "ohlcv-fetch-failed");
    }
    if (!Array.isArray(candles) || !candles.length) {
      return emptyResult(input, "ohlcv-empty");
    }

    const result = classifyFromCandles(candles, asOf);
    if (result.state === "unknown") {
      if (result.reason === "unexpected-candle-interval") {
        console.warn(
          "[MomentumDetector] unexpected candle interval for",
          input.tokenId,
          "median gap ms:",
          result.medianGapMs,
        );
      }
      return emptyResult(input, result.reason);
    }

    return {
      tokenAddress:
        typeof input.tokenAddress === "string" ? input.tokenAddress : null,
      asOf,
      momentumState: result.state,
      reason: "ok",
      signals: result.signals,
      _limitations: {
        ohlcvSource:
          "momentum state is derived from public OHLCV. When the OHLCV " +
          "provider chain is unreachable, state is 'unknown' — never " +
          "silently assumed PRE_MOMENTUM.",
      },
    };
  }

  return Object.freeze({
    detect,
    version: MODULE_VERSION,
    _internal: Object.freeze({
      computeSignals,
      classify,
      classifyFromCandles,
      medianGapMs,
      PRICE_FLAT_PCT,
      PRICE_EMERGING_PCT,
      VOLUME_Z_EMERGING,
      VOLUME_Z_CONFIRMED,
      LOOKBACK_CANDLES,
      INTERVAL,
      MIN_MEDIAN_GAP_MS,
      MAX_MEDIAN_GAP_MS,
    }),
  });
})();

console.log(
  "[MomentumDetector] Module loaded — PRE_MOMENTUM / EMERGING / CONFIRMED / unknown (v2: interval guard).",
);
