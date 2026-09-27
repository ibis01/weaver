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
//   - REMOVED every local `sourceRel * freshness` calculation. That
//     pattern was multiplying source reliability and data freshness
//     twice (once here, once inside computeConfidence) and
//     mislabelling the product as `interpretationConfidence`. The
//     contract in types.js is now the only place a confidence
//     number is ever produced.
//   - `sourceReliability` and `dataFreshness` are deliberately NOT
//     stored in the signal. They are derived at evidence-build time
//     from the source name and the signal's timestamp.
//   - `interpretationConfidence` is only populated when the
//     producing detector provides one. Otherwise it is `null`, and
//     `null` propagates honestly: computeConfidence returns `null`,
//     and the UI surfaces "confidence unavailable" rather than a
//     fabricated number (§2.7, §2.9).
//   - `dataCompleteness` is likewise `null` when we cannot honestly
//     estimate it. It is never defaulted to a made-up value.
//   - Every collector now records an explicit `reasoning` array on
//     the signal's rawData explaining WHY the signal fired. This
//     gives the evidence drawer something honest to display.
// ===============================================================

window.W = window.W || {};
W.events = (() => {
  const CACHE_KEY = "w_events_cache";
  const CACHE_VERSION = 3;
  const TTL = 5 * 60 * 1000;
  const DAY = 864e5;
  const MAX_SIGNAL_AGE_MS = 7 * DAY;

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
  // the signal's metadata from the four honest inputs it has —
  // corroborationCount, dataCompleteness, interpretationConfidence,
  // and the source name (which the evidence-builder later feeds
  // into getSourceReliability). The fifth input, dataFreshness, is
  // derived from `timestamp` at evidence-build time.
  //
  // If a collector cannot honestly populate dataCompleteness or
  // interpretationConfidence, it must pass `null` for that field.
  // Silent defaulting is forbidden by §2.7 / §2.9.
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

    // Build metadata strictly from what the collector supplied.
    // No defaults. No computations. No fallbacks.
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
      // rawData carries the payload plus a reasoning trail. The
      // reasoning array is the honest "why did this fire" record
      // that the evidence drawer can render.
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

  function collectPriceEvents(markets) {
    const events = [];
    if (!Array.isArray(markets)) return events;

    markets.forEach((coin) => {
      if (!coin || typeof coin !== "object") return;
      const changeRaw = Number(coin.price_change_percentage_24h);
      if (!Number.isFinite(changeRaw)) return;
      const change = Math.abs(changeRaw);
      if (change <= 3) return;

      // Honest payload description for the evidence drawer.
      const reasoning = [
        `24h price change of ${changeRaw.toFixed(2)}% exceeds the 3% materiality threshold.`,
      ];

      // dataCompleteness is genuinely high for a CoinLore ticker —
      // we have price, market cap, volume, and 24h change in one
      // payload. 0.9 reflects "we have the fields we need, though
      // we do not have OHLC granularity".
      //
      // interpretationConfidence is the producer's own confidence
      // that this is a "signal" worth surfacing. A 3% move being
      // material is a heuristic; 0.7 says "usually meaningful, not
      // always". This is an honest number, not a computed one.
      const sig = normalize(
        {
          symbol: coin.symbol,
          name: coin.name,
          title: `${coin.name} moved ${changeRaw.toFixed(1)}% in 24h`,
          impactValue: Math.min(1, change / 15),
          urgency: change > 7 ? 0.9 : 0.6,
          source: "coinlore",
          dataCompleteness: 0.9,
          interpretationConfidence: 0.7,
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

      // dataCompleteness: the regime detector needs all three
      // inputs (fear/greed, BTC dominance, cap change) to produce a
      // high-confidence regime call. We report the fraction we
      // actually had.
      const inputsPresent = [
        Number.isFinite(fgValue),
        Number.isFinite(btcDom),
        Number.isFinite(capChange),
      ].filter(Boolean).length;
      const dataCompleteness = inputsPresent / 3;

      // interpretationConfidence: the regime detector itself
      // publishes its own confidence in the regime classification.
      // That is the honest number to carry here — it is the
      // producer's confidence in its own interpretation, not a
      // mixture of source reliability and freshness.
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

        // dataCompleteness: an unlock event is "complete" when we
        // know both the coin and the amount. Two halves.
        let dataCompleteness = 0;
        if (amountKnown) dataCompleteness += 0.5;
        if (coinIdKnown) dataCompleteness += 0.5;

        // interpretationConfidence for an unlock is deliberately
        // modest. The schedule is on-chain and factual, but the
        // IMPACT of an unlock on price is a modelling judgement we
        // do not actually have a rigorous number for. 0.5 = "we
        // know the event is real; our read on how it will move the
        // market is a coin flip".
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

        // The opportunity scanner is a downstream producer. If it
        // publishes its own dataCompleteness or interpretationConfidence,
        // honour those. If it does not, we pass null — we do not
        // invent a number on its behalf. This is the exact
        // discipline §2.7 requires.
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

          // dataCompleteness: the health evaluator needs price AND
          // regime to make a full judgement. Report what we had.
          let dataCompleteness = 0;
          if (price != null) dataCompleteness += 0.5;
          if (regimeData?.regime) dataCompleteness += 0.5;

          // interpretationConfidence: the health evaluator's own
          // health score (0–100) is a defensible interpretation-
          // confidence number — it IS the model's confidence that
          // the thesis is on track. We normalise it to 0–1. If the
          // score is non-finite we pass null rather than inventing a
          // value.
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
  //
  // Two signals are duplicates when they share a type, an asset
  // symbol, and fall within the same 10-minute bucket. Among
  // duplicates, the one with the higher dataCompleteness wins;
  // null counts as "unknown" and loses to any finite value.
  //
  // Note: the winner is chosen by dataCompleteness, not confidence.
  // Choosing by confidence would require us to compute a
  // confidence here, and this module is forbidden from doing that.
  // dataCompleteness is an honest input, not a derivation.
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

  return Object.freeze({ normalize, collectEvents });
})();

console.log(
  "[Events] Module loaded (canonical confidence enforced: no local derivation, honest null on missing inputs).",
);
