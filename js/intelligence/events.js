// ===============================================================
//         Live Event Collector – Uses Evidence Builder
// ===============================================================
// Constitution Compliance:
//   Task 7 (Defensible Confidence) — every signal stores only the
//     honest inputs it possesses. The ONE confidence function
//     (W.intelligence.computeConfidence) is the only place any
//     number is ever computed from those inputs.
//   Task 8 (Thesis Health Integration)
//
// v2 changelog:
//   - Signals built via W.intelligence.create.signal().
//   - Metadata field renamed _metadata → metadata.
//   - Cache versioned and read/write atomic.
//
// v3 changelog (canonical-contract enforcement):
//   - REMOVED every local `sourceRel * freshness` calculation.
//   - sourceReliability / dataFreshness derived at evidence-build.
//   - interpretationConfidence / dataCompleteness pass null when
//     unknown, never defaulted to a fabricated number.
//
// v4 changelog (PRICE_MOVE production-grade):
//   - Tiered market-cap thresholds replace the flat 3% cutoff.
//   - Volume confirmation suppresses thin-volume wicks.
//   - Emission cap bounds the feed on volatile days.
//
// v5 changelog (accuracy hardening):
//   - Cross-sectional Z-score gate added on top of the tier
//     threshold.
//   - Composite signal score (0–1) combines normalized |z|,
//     volume ratio, and market-cap tier weight.
//   - Directional coherence gate near the z boundary.
//
// v6 changelog (majors bypass + symbol exclusions):
//   - Majors bypass the cross-sectional z gate. On a broad
//     market-down day (mean -1.65%, std 7.63%), an asset needs a
//     |change - mean| of 15%+ to clear a 2σ gate — impossible for
//     BTC, whose moves are ~4–8% at most. But BTC, ETH, SOL, and
//     the top-cap tier *are* the reference distribution. Requiring
//     them to be outliers against a distribution they dominate is
//     circular. The tier floor and volume gate are the correct
//     filters for majors. Mid and small caps still must clear the
//     z gate, which is exactly what it's designed for.
//   - EXCLUDED_SYMBOLS: stablecoins and wrapped tokens are
//     skipped entirely. Stables do not "move" — a depeg is a
//     different event class with its own producer. Wrapped tokens
//     mirror their underlying and would produce a duplicate of the
//     base asset's signal with a different symbol.
//
// References for the gates:
//   - Upbit multi-indicator pipeline: weighted voting across
//     Z-Score, Bollinger, RSI, VWAP; combined weight ≥0.5 to fire.
//   - Crypto Anomaly Detector: adaptive Z-Score 2.5σ–4.0σ.
//   - VWAP Sniper: volume must exceed period average by 1.1–1.3×.
//   - n8n CoinGecko workflow: market-cap tier thresholds.
// ===============================================================

window.W = window.W || {};
W.events = (() => {
  const CACHE_KEY = "w_events_cache";
  const CACHE_VERSION = 6;
  const TTL = 5 * 60 * 1000;
  const DAY = 864e5;
  const MAX_SIGNAL_AGE_MS = 7 * DAY;

  // ── PRICE_MOVE thresholds ────────────────────────────────
  //
  // Four gates for non-major assets, three gates for majors
  // (z gate bypassed — see v6 header comment).
  //
  // Weaver has no OHLCV history. The statistical gate is a
  // CROSS-SECTIONAL Z-Score — each asset's move compared to the
  // distribution of moves across the scanned universe right now.
  // This answers "is this move unusual relative to its peers?"
  // rather than "is this move unusual for this asset?". The
  // former is weaker for single-asset anomaly detection but
  // stronger for surfacing market-wide dislocations, which is
  // what a market scanner should surface. When Weaver retains a
  // price history, upgrading to a time-series Z is the natural
  // next step.
  const TIER_MAJOR_CAP = 1e10; // $10B — BTC, ETH, BNB, SOL, XRP
  const TIER_MID_CAP = 1e9; // $1B
  const THRESHOLD_MAJOR = 3; // 3% floor for majors
  const THRESHOLD_MID = 6; // 6% floor for $1B–$10B
  const THRESHOLD_SMALL = 12; // 12% floor for <$1B
  const VOLUME_RATIO_MIN = 1.3; // relative-volume confirmation floor
  const Z_SCORE_MIN = 2.0; // ~95% two-tailed under normality
  const Z_SCORE_CAP = 6.0; // above this the z is clamped for scoring
  const MIN_SCANNED_UNIVERSE = 12; // below this, z is not statistically meaningful
  const MAX_PRICE_MOVE_EVENTS = 5;
  const TIER_PRIORITY = Object.freeze({ major: 0, mid: 1, small: 2 });
  const TIER_WEIGHT = Object.freeze({ major: 1.0, mid: 0.7, small: 0.4 });

  // ── Excluded from PRICE_MOVE ─────────────────────────────
  //
  // Stablecoins do not "move" in the signal sense — a depeg is a
  // different event class with its own producer. Wrapped and
  // liquid-staking tokens mirror their underlying and would
  // produce a duplicate of the base asset's signal with a
  // different symbol, diluting the feed and double-counting the
  // same market event.
  //
  // This is an allowlist-by-exclusion, not a blocklist of every
  // possible wrapped token. New wrapped assets should be added
  // when they appear in the top-50 scan and start producing
  // duplicate signals.
  const EXCLUDED_SYMBOLS = new Set([
    // Fiat-pegged stablecoins
    "USDT",
    "USDC",
    "DAI",
    "USDE",
    "TUSD",
    "BUSD",
    "FRAX",
    "USDD",
    "PYUSD",
    "FDUSD",
    "USDP",
    "GUSD",
    "LUSD",
    "MIM",
    "USDS",
    "SUSDE",
    // Wrapped / staked versions of major assets
    "WBTC",
    "WETH",
    "WBETH",
    "WSTETH",
    "STETH",
    "RETH",
    "CBETH",
    "SFRXETH",
    "WEETH",
    "WSTETH",
    "TBTC",
  ]);

  function _marketCapTier(cap) {
    if (cap >= TIER_MAJOR_CAP) return "major";
    if (cap >= TIER_MID_CAP) return "mid";
    return "small";
  }

  function _thresholdForTier(tier) {
    if (tier === "major") return THRESHOLD_MAJOR;
    if (tier === "mid") return THRESHOLD_MID;
    return THRESHOLD_SMALL;
  }

  // ── Cross-sectional statistics ───────────────────────────
  //
  // Given an array of numeric values, return { mean, std, n }.
  // std is the population standard deviation (n divisor, not n−1)
  // because the scanned set IS the population of interest, not a
  // sample drawn from a larger one. Returns null when the sample
  // is too small for a z-score to be meaningful.
  function _distribution(values) {
    const xs = values.filter((v) => Number.isFinite(v));
    const n = xs.length;
    if (n < MIN_SCANNED_UNIVERSE) return null;
    const mean = xs.reduce((s, v) => s + v, 0) / n;
    const variance = xs.reduce((s, v) => s + (v - mean) * (v - mean), 0) / n;
    const std = Math.sqrt(variance);
    if (!Number.isFinite(std) || std <= 0) return null;
    return { mean, std, n };
  }

  // ── Helpers ──────────────────────────────────────────────
  function _isValidTimestamp(ts) {
    if (!Number.isFinite(ts)) return false;
    if (ts <= 0) return false;
    if (ts > Date.now() + 60000) return false;
    if (Date.now() - ts > MAX_SIGNAL_AGE_MS) return false;
    return true;
  }

  // ── Normalize a raw payload into a canonical Signal ──────
  //
  // NOTE: this function does NOT compute a confidence. It builds
  // the signal's metadata from the four honest inputs it has.
  // If a collector cannot honestly populate dataCompleteness or
  // interpretationConfidence, it must pass `null`. Silent
  // defaulting is forbidden by §2.7 / §2.9.
  function normalize(raw, type) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

    const symbol = String(
      raw.symbol || raw.id || raw.coin_id || "",
    ).toUpperCase();
    const title = String(
      raw.title || raw.headline || raw.name || "Market Event",
    );
    if (!title) return null;

    const assetIdInput = {
      chainId: raw.chainId || "unknown",
      contractAddress: raw.contractAddress || null,
      symbol: symbol,
      coingeckoId: raw.coingeckoId || null,
      name: raw.name || raw.coinName || symbol,
    };

    const timestamp = raw.timestamp
      ? new Date(raw.timestamp).getTime()
      : Date.now();
    if (!_isValidTimestamp(timestamp)) return null;

    const metadata = {
      corroborationCount:
        Number.isInteger(raw.corroborationCount) && raw.corroborationCount >= 1
          ? raw.corroborationCount
          : 1,
      dataCompleteness:
        Number.isFinite(raw.dataCompleteness) &&
        raw.dataCompleteness >= 0 &&
        raw.dataCompleteness <= 1
          ? raw.dataCompleteness
          : null,
      interpretationConfidence:
        Number.isFinite(raw.interpretationConfidence) &&
        raw.interpretationConfidence >= 0 &&
        raw.interpretationConfidence <= 1
          ? raw.interpretationConfidence
          : null,
    };

    const signal = W.intelligence.create.signal({
      type,
      source: raw.source || "weaver",
      assetId: assetIdInput,
      timestamp,
      rawData: {
        ...raw,
        title,
        reasoning: Array.isArray(raw.reasoning) ? raw.reasoning.slice() : [],
      },
      metadata,
    });

    return signal;
  }

  // ── Collectors ───────────────────────────────────────────

  // ── PRICE_MOVE production v6 ─────────────────────────────
  //
  // Gates, applied in order:
  //
  //   0. EXCLUSION. Stables and wrapped tokens are skipped.
  //
  //   1. TIER THRESHOLD. The move must clear the absolute floor
  //      for its market-cap tier. Coarse filter.
  //
  //   2. CROSS-SECTIONAL Z (majors bypass). A non-major move
  //      must be ≥ Z_SCORE_MIN standard deviations from the mean
  //      move across the scanned universe. Majors skip this gate
  //      because they *are* the reference distribution — see the
  //      v6 header comment.
  //
  //   3. VOLUME CONFIRMATION. Relative volume must be ≥
  //      VOLUME_RATIO_MIN, unless volume data is entirely absent
  //      (recorded honestly in the reasoning trail).
  //
  //   4. DIRECTIONAL COHERENCE. When a non-major's |z| is near
  //      the boundary (within 0.75σ of Z_SCORE_MIN), the move
  //      must additionally be volume-confirmed. Majors are not
  //      subject to this — the z-bypass means there is no
  //      boundary.
  //
  // Survivors receive a composite score (0–1). Emissions are
  // capped at MAX_PRICE_MOVE_EVENTS, sorted majors-first then by
  // composite score desc.
  function collectPriceEvents(markets) {
    const events = [];
    if (!Array.isArray(markets) || !markets.length) return events;

    // ── Build the reference distribution ───────────────────
    // Excluded symbols do not contribute to the reference
    // distribution. A stablecoin at +0.01% would pull the mean
    // toward zero and inflate the std against "real" assets.
    const changes = [];
    const volumes = [];

    for (const coin of markets) {
      if (!coin || typeof coin !== "object") continue;
      const sym = String(coin.symbol || "").toUpperCase();
      if (EXCLUDED_SYMBOLS.has(sym)) continue;
      const changeRaw = Number(
        coin.price_change_percentage_24h ??
          coin.price_change_percentage_24h_in_currency,
      );
      if (Number.isFinite(changeRaw)) changes.push(changeRaw);
      const vol = Number(coin.total_volume ?? coin.volume_24h ?? coin.volume24);
      if (Number.isFinite(vol) && vol > 0) volumes.push(vol);
    }

    const changeDist = _distribution(changes);
    const avgVolume = volumes.length
      ? volumes.reduce((s, v) => s + v, 0) / volumes.length
      : null;

    const candidates = [];

    markets.forEach((coin) => {
      if (!coin || typeof coin !== "object") return;

      // Gate 0 — symbol exclusion.
      const sym = String(coin.symbol || "").toUpperCase();
      if (EXCLUDED_SYMBOLS.has(sym)) return;

      const changeRaw = Number(
        coin.price_change_percentage_24h ??
          coin.price_change_percentage_24h_in_currency,
      );
      if (!Number.isFinite(changeRaw)) return;
      const absChange = Math.abs(changeRaw);

      const cap = Number(coin.market_cap);
      if (!Number.isFinite(cap) || cap <= 0) return;

      // Gate 1 — tier threshold.
      const tier = _marketCapTier(cap);
      const threshold = _thresholdForTier(tier);
      if (absChange < threshold) return;

      // Gate 2 — cross-sectional Z, bypassed for majors.
      // Majors define the reference distribution; requiring them
      // to be outliers against it is circular. Mid and small caps
      // still must clear the gate.
      let zScore = null;
      if (changeDist && tier !== "major") {
        zScore = (changeRaw - changeDist.mean) / changeDist.std;
      }
      const zPasses = zScore === null || Math.abs(zScore) >= Z_SCORE_MIN;

      // Gate 3 — volume confirmation.
      const vol = Number(coin.total_volume ?? coin.volume_24h ?? coin.volume24);
      const volRatio =
        Number.isFinite(vol) && avgVolume ? vol / avgVolume : null;
      const volConfirmed =
        volRatio === null ? null : volRatio >= VOLUME_RATIO_MIN;

      // Gate 4 — directional coherence. Only applies when z was
      // actually computed AND sits near the boundary.
      const nearBoundary =
        zScore !== null && Math.abs(zScore) < Z_SCORE_MIN + 0.75;
      const directionalCoherent = nearBoundary ? volConfirmed === true : true;

      if (!zPasses) return;
      if (volConfirmed === false) return;
      if (!directionalCoherent) return;

      candidates.push({
        coin,
        changeRaw,
        absChange,
        tier,
        threshold,
        volRatio,
        zScore,
        volConfirmed,
      });
    });

    if (!candidates.length) return events;

    // ── Composite scoring ──────────────────────────────────
    //   0.50 × normalized |z|  (capped at Z_SCORE_CAP)
    //   0.30 × normalized volume ratio (capped at 3×)
    //   0.20 × tier weight (major 1.0, mid 0.7, small 0.4)
    // When z is null (majors, or too-small universe), that
    // component contributes 0 and remaining weights renormalize.
    candidates.forEach((c) => {
      let weighted = 0;
      let totalWeight = 0;

      if (c.zScore !== null) {
        const zNorm = Math.min(1, Math.abs(c.zScore) / Z_SCORE_CAP);
        weighted += 0.5 * zNorm;
        totalWeight += 0.5;
      }

      if (c.volRatio !== null) {
        const volNorm = Math.min(1, c.volRatio / 3);
        weighted += 0.3 * volNorm;
        totalWeight += 0.3;
      }

      const tierW = TIER_WEIGHT[c.tier] ?? 0.4;
      weighted += 0.2 * tierW;
      totalWeight += 0.2;

      c.compositeScore = totalWeight > 0 ? weighted / totalWeight : 0;
    });

    // ── Rank and cap ───────────────────────────────────────
    candidates.sort((a, b) => {
      const aRank = TIER_PRIORITY[a.tier] ?? 99;
      const bRank = TIER_PRIORITY[b.tier] ?? 99;
      if (aRank !== bRank) return aRank - bRank;
      return b.compositeScore - a.compositeScore;
    });
    const capped = candidates.slice(0, MAX_PRICE_MOVE_EVENTS);

    // ── Emit ───────────────────────────────────────────────
    capped.forEach((c) => {
      const {
        coin,
        changeRaw,
        absChange,
        tier,
        threshold,
        volRatio,
        zScore,
        compositeScore,
      } = c;

      const reasoning = [
        `24h change ${changeRaw > 0 ? "+" : ""}${changeRaw.toFixed(2)}% clears the ${threshold}% floor for ${tier}-cap assets.`,
      ];

      if (zScore !== null && changeDist) {
        reasoning.push(
          `Cross-sectional z-score ${zScore.toFixed(2)}σ vs a scan mean of ${changeDist.mean.toFixed(2)}% (${changeDist.n} assets). Threshold ${Z_SCORE_MIN}σ.`,
        );
      } else if (tier === "major" && changeDist) {
        reasoning.push(
          "Major-cap asset — cross-sectional z gate bypassed (majors define the reference distribution).",
        );
      } else {
        reasoning.push(
          "Cross-sectional statistics unavailable (scan too small); the move passed on the tier floor and volume gates alone.",
        );
      }

      if (volRatio !== null) {
        reasoning.push(
          `Relative volume ${volRatio.toFixed(2)}× the scan mean (confirmation floor ${VOLUME_RATIO_MIN}×).`,
        );
      } else {
        reasoning.push(
          "Volume data unavailable for this asset; the move is not volume-confirmed.",
        );
      }

      reasoning.push(
        `Composite signal score ${(compositeScore * 100).toFixed(0)}% (z, volume, and tier weight).`,
      );

      let dataCompleteness = 0.5;
      if (zScore !== null) dataCompleteness += 0.25;
      if (volRatio !== null) dataCompleteness += 0.25;

      const interpretationConfidence = Math.max(
        0.3,
        Math.min(0.95, compositeScore),
      );

      const sig = normalize(
        {
          symbol: coin.symbol,
          name: coin.name,
          title: `${coin.name} moved ${changeRaw > 0 ? "+" : ""}${changeRaw.toFixed(1)}% in 24h`,
          impactValue: Math.min(1, absChange / 15),
          source: "market_scanner",
          coingeckoId: coin.id,
          dataCompleteness,
          interpretationConfidence,
          marketCapTier: tier,
          price_change_percentage_24h: changeRaw,
          volumeRatio: volRatio,
          zScore,
          compositeScore,
          reasoning,
        },
        "PRICE_MOVE",
      );
      if (sig) events.push(sig);
    });

    return events;
  }

  function collectRegimeEvents(fg, g) {
    const events = [];
    try {
      if (!W.regime || !fg || !g) return events;

      const fgValue = Number(fg.value);
      const btcDom = Number(g.data?.market_cap_percentage?.btc);
      const capChange = Number(g.data?.market_cap_change_percentage_24h_usd);

      const regimeData = W.regime.detect({
        fearGreed: Number.isFinite(fgValue) ? fgValue : null,
        btcDominance: Number.isFinite(btcDom) ? btcDom : null,
        capChange: Number.isFinite(capChange) ? capChange : null,
      });
      if (!regimeData || regimeData.regime === "UNKNOWN") return events;

      const inputsPresent = [
        Number.isFinite(fgValue),
        Number.isFinite(btcDom),
        Number.isFinite(capChange),
      ].filter(Boolean).length;
      const dataCompleteness = inputsPresent / 3;

      const interpretationConfidence = Number.isFinite(regimeData.confidence)
        ? Math.max(0, Math.min(1, regimeData.confidence))
        : null;

      const signalDescriptions = Array.isArray(regimeData.signals)
        ? regimeData.signals
            .map((s) => s && s.value)
            .filter(Boolean)
            .join(", ")
        : "";

      const reasoning = [
        `Regime classifier returned "${regimeData.regime}".`,
        `Inputs present: ${inputsPresent}/3 (fear/greed, BTC dominance, cap change).`,
        signalDescriptions
          ? `Signals contributing: ${signalDescriptions}.`
          : null,
      ].filter(Boolean);

      const sig = normalize(
        {
          symbol: "BTC",
          title: `Market Regime Shift: ${regimeData.regime}`,
          description: `Detector confidence: ${
            Number.isFinite(regimeData.confidence)
              ? (regimeData.confidence * 100).toFixed(0) + "%"
              : "unavailable"
          }.`,
          impactValue: Number.isFinite(regimeData.confidence)
            ? regimeData.confidence
            : null,
          source: "weaver_regime",
          dataCompleteness,
          interpretationConfidence,
          reasoning,
        },
        "REGIME_SHIFT",
      );
      if (sig) events.push(sig);
    } catch (e) {
      console.warn("[Events] Regime collection failed:", e.message);
    }
    return events;
  }

  function collectUnlockEvents() {
    const events = [];
    try {
      const list = W.unlocks?.list?.();
      if (!Array.isArray(list) || !list.length) return events;
      const now = Date.now();
      const upcoming = list.filter((u) => {
        if (!u || typeof u !== "object") return false;
        const d = Number(u.date);
        if (!Number.isFinite(d)) return false;
        const daysLeft = (d - now) / DAY;
        return daysLeft >= 0 && daysLeft <= 14;
      });
      if (!upcoming.length) return events;

      upcoming.forEach((u) => {
        const d = Number(u.date);
        const daysLeft = (d - now) / DAY;
        const amountKnown = Number.isFinite(u.amount) && u.amount > 0;
        const coinIdKnown = typeof u.coinId === "string" && u.coinId.length > 0;

        let dataCompleteness = 0;
        if (amountKnown) dataCompleteness += 0.5;
        if (coinIdKnown) dataCompleteness += 0.5;

        const interpretationConfidence = 0.5;

        const amountText = amountKnown
          ? Number(u.amount).toLocaleString()
          : "amount unknown";

        const reasoning = [
          `Unlock scheduled in ${daysLeft.toFixed(1)} days.`,
          amountKnown
            ? `Amount: ${amountText} tokens.`
            : "Amount was not provided by the source.",
          coinIdKnown
            ? `Coin identifier available (${u.coinId}).`
            : "Coin identifier missing; price impact cannot be estimated.",
        ];

        const sig = normalize(
          {
            symbol: u.symbol,
            name: u.name,
            title: `${u.name || u.symbol || "Token"} Unlock: ${amountText}`,
            description: `${u.type || "Scheduled"} unlock in ${daysLeft.toFixed(1)} days.`,
            impactValue: 0.6,
            source: "token_unlocks",
            coingeckoId: u.coinId,
            dataCompleteness,
            interpretationConfidence,
            corroborationCount: 1,
            reasoning,
          },
          "UNLOCK",
        );
        if (sig) events.push(sig);
      });
    } catch (e) {
      console.warn("[Events] Unlock collection failed:", e.message);
    }
    return events;
  }

  function collectOpportunityEvents(markets, regimeData) {
    const events = [];
    try {
      if (!W.opportunities?.scan) return events;
      const portfolio = W.portfolio?.all?.() || [];
      const theses = W.theses?.all?.() || [];
      const opportunities = W.opportunities.scan(
        portfolio,
        theses,
        markets,
        regimeData,
      );
      if (!Array.isArray(opportunities)) return events;

      opportunities.forEach((opp) => {
        if (!opp || typeof opp !== "object") return;

        const dataCompleteness =
          Number.isFinite(opp.dataCompleteness) &&
          opp.dataCompleteness >= 0 &&
          opp.dataCompleteness <= 1
            ? opp.dataCompleteness
            : null;

        const interpretationConfidence =
          Number.isFinite(opp.interpretationConfidence) &&
          opp.interpretationConfidence >= 0 &&
          opp.interpretationConfidence <= 1
            ? opp.interpretationConfidence
            : null;

        const reasoning = Array.isArray(opp.reasoning)
          ? opp.reasoning.slice()
          : [];

        const sig = normalize(
          {
            symbol: opp.symbol,
            title: opp.title,
            description: opp.description,
            impactValue: Number.isFinite(opp.impactValue)
              ? opp.impactValue
              : null,
            source: opp.source || "opportunity_scanner",
            dataCompleteness,
            interpretationConfidence,
            reasoning,
          },
          "OPPORTUNITY",
        );
        if (sig) events.push(sig);
      });
    } catch (e) {
      console.warn("[Events] Opportunity collection failed:", e.message);
    }
    return events;
  }

  async function collectThesisHealthEvents() {
    const events = [];
    try {
      if (!W.thesisHealth?.evaluate || !W.theses?.all) return events;
      const allTheses = W.theses.all();
      if (!Array.isArray(allTheses)) return events;
      const activeTheses = allTheses.filter((t) => t && t.status === "active");
      if (!activeTheses.length) return events;

      const assetIds = [
        ...new Set(
          activeTheses.map((t) => t.coingeckoId || t.symbol).filter(Boolean),
        ),
      ];
      const priceMap = Object.create(null);
      if (assetIds.length) {
        try {
          const markets = await W.api.markets(assetIds.join(","));
          if (Array.isArray(markets)) {
            markets.forEach((m) => {
              if (m && m.id && Number.isFinite(m.current_price)) {
                priceMap[m.id] = m.current_price;
              }
            });
          }
        } catch (e) {
          /* non-fatal; priceMap stays empty */
        }
      }

      let regimeData = null;
      try {
        const fg = await W.api.fearGreed();
        const g = await W.api.global();
        if (W.regime && fg && g) {
          regimeData = W.regime.detect({
            fearGreed: Number(fg.value),
            btcDominance: Number(g.data?.market_cap_percentage?.btc),
            capChange: Number(g.data?.market_cap_change_percentage_24h_usd),
          });
        }
      } catch (e) {
        /* non-fatal */
      }

      activeTheses.forEach((thesis) => {
        try {
          const price =
            priceMap[thesis.coingeckoId] ||
            priceMap[String(thesis.symbol || "").toLowerCase()] ||
            null;
          const marketData = { price, regime: regimeData?.regime || null };
          const health = W.thesisHealth.evaluate(thesis, marketData, []);
          if (!health) return;
          if (
            health.status === "Healthy" ||
            health.status === "Strengthening"
          ) {
            return;
          }

          let dataCompleteness = 0;
          if (price != null) dataCompleteness += 0.5;
          if (regimeData?.regime) dataCompleteness += 0.5;

          const interpretationConfidence = Number.isFinite(health.healthScore)
            ? Math.max(0, Math.min(1, health.healthScore / 100))
            : null;

          const reasoning = Array.isArray(health.reasons)
            ? health.reasons.slice()
            : [];

          const sig = normalize(
            {
              symbol: thesis.symbol,
              name: thesis.asset || thesis.symbol,
              title: `Thesis ${health.status}: ${thesis.symbol}`,
              description: `Health score: ${health.healthScore}/100.`,
              impactValue: Math.min(
                1,
                (100 - Number(health.healthScore || 0)) / 100,
              ),
              source: "thesis_health",
              coingeckoId: thesis.coingeckoId,
              dataCompleteness,
              interpretationConfidence,
              timestamp: Date.now(),
              reasoning,
            },
            "THESIS_DETERIORATION",
          );
          if (sig) events.push(sig);
        } catch (e) {
          console.warn("[Events] Thesis evaluation failed:", e.message);
        }
      });
    } catch (e) {
      console.warn("[Events] Thesis health collection failed:", e.message);
    }
    return events;
  }

  // ── Deduplication ────────────────────────────────────────
  function _dedupe(signals) {
    const seen = new Map();
    const DEDUP_WINDOW_MS = 10 * 60 * 1000;
    return signals.filter((s) => {
      const bucket = Math.floor(s.timestamp / DEDUP_WINDOW_MS);
      const key = `${s.type}_${s.assetId.symbol}_${bucket}`;
      if (!seen.has(key)) {
        seen.set(key, s);
        return true;
      }
      const existing = seen.get(key);
      const ec = existing.metadata?.dataCompleteness;
      const nc = s.metadata?.dataCompleteness;
      const ecScore = Number.isFinite(ec) ? ec : -1;
      const ncScore = Number.isFinite(nc) ? nc : -1;
      if (ncScore > ecScore) {
        seen.set(key, s);
      }
      return false;
    });
  }

  // ── Cache read/write ─────────────────────────────────────
  function _readCache() {
    try {
      const cached = W.store?.get?.(CACHE_KEY);
      if (!cached || typeof cached !== "object") return null;
      if (cached.version !== CACHE_VERSION) return null;
      if (!Number.isFinite(cached.timestamp)) return null;
      if (Date.now() - cached.timestamp >= TTL) return null;
      if (!Array.isArray(cached.events)) return null;
      for (const s of cached.events) {
        if (!W.intelligence.is.signal(s)) return null;
      }
      return cached.events;
    } catch {
      return null;
    }
  }

  function _writeCache(events) {
    try {
      W.store?.set?.(CACHE_KEY, {
        version: CACHE_VERSION,
        timestamp: Date.now(),
        events,
      });
    } catch {
      /* non-fatal */
    }
  }

  // ── Core Aggregation ─────────────────────────────────────
  async function collectEvents() {
    const cached = _readCache();
    if (cached) return cached;

    let markets = [];
    let fg = null;
    let g = null;

    try {
      const top = await W.api?.top?.(50);
      if (Array.isArray(top)) markets = top;
    } catch (e) {
      /* non-fatal */
    }
    try {
      fg = await W.api?.fearGreed?.();
    } catch (e) {
      /* non-fatal */
    }
    try {
      g = await W.api?.global?.();
    } catch (e) {
      /* non-fatal */
    }

    let regimeData = null;
    if (W.regime && fg && g) {
      try {
        regimeData = W.regime.detect({
          fearGreed: Number(fg.value),
          btcDominance: Number(g.data?.market_cap_percentage?.btc),
          capChange: Number(g.data?.market_cap_change_percentage_24h_usd),
        });
      } catch {
        regimeData = null;
      }
    }

    const allSignals = [
      ...collectPriceEvents(markets),
      ...collectRegimeEvents(fg, g),
      ...collectUnlockEvents(),
      ...collectOpportunityEvents(markets, regimeData),
      ...(await collectThesisHealthEvents()),
    ].filter((s) => W.intelligence.is.signal(s));

    const deduped = _dedupe(allSignals);
    _writeCache(deduped);
    return deduped;
  }

  return Object.freeze({
    normalize,
    collectEvents,
    _internal: Object.freeze({
      collectPriceEvents,
      _marketCapTier,
      _thresholdForTier,
      _distribution,
      EXCLUDED_SYMBOLS,
      TIER_MAJOR_CAP,
      TIER_MID_CAP,
      THRESHOLD_MAJOR,
      THRESHOLD_MID,
      THRESHOLD_SMALL,
      VOLUME_RATIO_MIN,
      Z_SCORE_MIN,
      Z_SCORE_CAP,
      MIN_SCANNED_UNIVERSE,
      MAX_PRICE_MOVE_EVENTS,
    }),
  });
})();

console.log(
  "[Events] Module loaded (canonical confidence enforced: no local derivation, honest null on missing inputs; v6 tiered PRICE_MOVE with major-z-bypass and symbol exclusions).",
);
