// ===============================================================
//         Live Event Collector – Confidence Model + Thesis Health
// ===============================================================

window.W = window.W || {};
W.events = (() => {
  const CACHE_KEY = "w_events_cache";
  const TTL = 5 * 60 * 1000;
  const DAY = 864e5;

  const { computeConfidence, computeFreshness, getSourceReliability } =
    W.intelligence || {};

  function safeNum(val, fallback = 0.5) {
    return typeof val === "number" && !isNaN(val) ? val : fallback;
  }

  function normalize(raw, type) {
    if (!raw || typeof raw !== "object") return null;
    const symbol = String(
      raw.symbol || raw.id || raw.coin_id || "",
    ).toUpperCase();
    const title = String(
      raw.title || raw.headline || raw.name || "Market Event",
    );
    if (!title) return null;

    const assetId = {
      chainId: raw.chainId || "unknown",
      contractAddress: raw.contractAddress || null,
      symbol: symbol,
      coingeckoId: raw.coingeckoId || null,
      name: raw.name || raw.coinName || symbol,
    };

    const timestamp = raw.timestamp
      ? new Date(raw.timestamp).getTime()
      : Date.now();
    const impactValue = safeNum(raw.impactValue, 0.5);

    const signal = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      type,
      source: raw.source || "weaver",
      assetId,
      timestamp,
      rawData: raw,
    };

    const sourceReliability = getSourceReliability
      ? getSourceReliability(signal.source)
      : 0.5;
    const dataFreshness = computeFreshness
      ? computeFreshness(timestamp, type)
      : 0.8;
    const corroborationCount = raw.corroborationCount || 1;
    const dataCompleteness = raw.dataCompleteness || 0.8;
    const interpretationConfidence = raw.interpretationConfidence || 0.7;

    const evidence = {
      signalId: signal.id,
      sourceReliability,
      dataFreshness,
      corroborationCount,
      dataCompleteness,
      interpretationConfidence,
      reasoning: [`Source: ${signal.source}`],
    };

    signal._confidence = computeConfidence ? computeConfidence(evidence) : 0.5;
    signal._evidence = evidence;

    return signal;
  }

  // ── Collectors ──────────────────────────────────────────────
  function collectPriceEvents(markets) {
    const events = [];
    if (!Array.isArray(markets)) return events;
    markets.forEach((coin) => {
      const change = Math.abs(coin.price_change_percentage_24h || 0);
      if (change > 3) {
        const impactValue = Math.min(1, change / 15);
        events.push(
          normalize(
            {
              symbol: coin.symbol,
              name: coin.name,
              title: `${coin.name} moved ${coin.price_change_percentage_24h.toFixed(1)}% in 24h`,
              impactValue: impactValue,
              source: "coingecko",
              coingeckoId: coin.id,
              dataCompleteness: 0.9,
              interpretationConfidence: 0.9,
            },
            "PRICE_MOVE",
          ),
        );
      }
    });
    return events;
  }

  function collectRegimeEvents(fg, g) {
    const events = [];
    try {
      if (!W.regime || !fg || !g) return events;
      const regimeData = W.regime.detect({
        fearGreed: fg.value,
        btcDominance: g.data?.market_cap_percentage?.btc,
        capChange: g.data?.market_cap_change_percentage_24h_usd,
      });
      if (regimeData.regime !== "UNKNOWN") {
        events.push(
          normalize(
            {
              symbol: "BTC",
              title: `Market Regime Shift: ${regimeData.regime}`,
              description: `Confidence: ${(regimeData.confidence * 100).toFixed(0)}%. Signals: ${regimeData.signals.map((s) => s.value).join(", ")}`,
              impactValue: regimeData.confidence || 0.5,
              source: "regime_engine",
              interpretationConfidence: 0.8,
              dataCompleteness: 0.85,
            },
            "REGIME_SHIFT",
          ),
        );
      }
    } catch (e) {
      console.warn("[Events] Regime collection failed:", e.message);
    }
    return events;
  }

  function collectUnlockEvents() {
    const events = [];
    try {
      const unlocks = W.unlocks?.list ? W.unlocks.list() : [];
      if (!unlocks.length) return events;
      const now = Date.now();
      const upcoming = unlocks.filter((u) => {
        const daysLeft = (u.date - now) / DAY;
        return daysLeft >= 0 && daysLeft <= 14;
      });
      if (!upcoming.length) return events;
      upcoming.forEach((u) => {
        const daysLeft = (u.date - now) / DAY;
        events.push(
          normalize(
            {
              symbol: u.symbol,
              name: u.name,
              title: `${u.name} Unlock: ${u.amount.toLocaleString()} tokens`,
              description: `${u.type} unlock in ${daysLeft.toFixed(1)} days.`,
              impactValue: 0.6,
              source: "token_unlocks",
              coingeckoId: u.coinId,
              interpretationConfidence: 0.75,
              dataCompleteness: 0.8,
              corroborationCount: 1,
            },
            "UNLOCK",
          ),
        );
      });
    } catch (e) {
      console.warn("[Events] Unlock collection failed:", e.message);
    }
    return events;
  }

  function collectOpportunityEvents(markets, regimeData) {
    const events = [];
    try {
      if (!W.opportunities) return events;
      const portfolio = W.portfolio?.all() || [];
      const theses = W.theses?.all() || [];
      const opportunities = W.opportunities.scan(
        portfolio,
        theses,
        markets,
        regimeData,
      );
      opportunities.forEach((opp) => {
        events.push(
          normalize(
            {
              symbol: opp.symbol,
              title: opp.title,
              description: opp.description,
              impactValue: opp.impactValue || 0.5,
              source: opp.source || "opportunity_scanner",
              interpretationConfidence: opp.interpretationConfidence || 0.7,
              dataCompleteness: opp.dataCompleteness || 0.75,
            },
            "OPPORTUNITY",
          ),
        );
      });
    } catch (e) {
      console.warn("[Events] Opportunity collection failed:", e.message);
    }
    return events;
  }

  // ── Async thesis health collector ──────────────────────────────
  async function collectThesisHealthEvents() {
    const events = [];
    try {
      if (!W.thesisHealth || !W.theses) return events;
      const activeTheses = W.theses.all().filter((t) => t.status === "active");
      if (!activeTheses.length) return events;

      // Get price data for all thesis assets
      const assetIds = [
        ...new Set(
          activeTheses.map((t) => t.coingeckoId || t.symbol).filter(Boolean),
        ),
      ];
      let priceMap = {};
      if (assetIds.length) {
        try {
          const markets = await W.api.markets(assetIds.join(","));
          markets.forEach((m) => {
            priceMap[m.id] = m.current_price;
          });
        } catch (e) {}
      }

      // Get current regime
      let regimeData = null;
      try {
        const fg = await W.api.fearGreed();
        const g = await W.api.global();
        if (W.regime && fg && g) {
          regimeData = W.regime.detect({
            fearGreed: fg.value,
            btcDominance: g.data?.market_cap_percentage?.btc,
            capChange: g.data?.market_cap_change_percentage_24h_usd,
          });
        }
      } catch (e) {}

      // Evaluate each active thesis
      activeTheses.forEach((thesis) => {
        const price =
          priceMap[thesis.coingeckoId] ||
          priceMap[thesis.symbol?.toLowerCase()] ||
          null;
        const marketData = { price, regime: regimeData?.regime || null };
        const health = W.thesisHealth.evaluate(thesis, marketData, []);
        if (
          health &&
          health.status !== "Healthy" &&
          health.status !== "Strengthening"
        ) {
          const impactValue = Math.min(1, (100 - health.healthScore) / 100);
          const signal = normalize(
            {
              symbol: thesis.symbol,
              name: thesis.asset || thesis.symbol,
              title: `Thesis ${health.status}: ${thesis.symbol}`,
              description: `Health score: ${health.healthScore}/100. ${health.reasons.join(" ")}`,
              impactValue: impactValue,
              source: "thesis_health",
              coingeckoId: thesis.coingeckoId,
              interpretationConfidence: 0.7,
              dataCompleteness: 0.8,
              timestamp: Date.now(),
            },
            "THESIS_DETERIORATION",
          );
          if (signal) events.push(signal);
        }
      });
    } catch (e) {
      console.warn("[Events] Thesis health collection failed:", e.message);
    }
    return events;
  }

  // ── Core Aggregation ──────────────────────────────────────────
  async function collectEvents() {
    const cached = W.store?.get(CACHE_KEY);
    if (cached && Date.now() - cached.timestamp < TTL) {
      return cached.events;
    }

    let markets = [];
    let fg = null;
    let g = null;

    try {
      markets = (await W.api?.top?.(50)) || [];
    } catch (e) {}
    try {
      fg = await W.api?.fearGreed?.();
    } catch (e) {}
    try {
      g = await W.api?.global?.();
    } catch (e) {}

    let regimeData = null;
    if (W.regime && fg && g) {
      regimeData = W.regime.detect({
        fearGreed: fg.value,
        btcDominance: g.data?.market_cap_percentage?.btc,
        capChange: g.data?.market_cap_change_percentage_24h_usd,
      });
    }

    // Collect all signals (including async thesis health)
    const priceEvents = collectPriceEvents(markets);
    const regimeEvents = collectRegimeEvents(fg, g);
    const unlockEvents = collectUnlockEvents();
    const opportunityEvents = collectOpportunityEvents(markets, regimeData);
    const thesisEvents = await collectThesisHealthEvents();

    let allSignals = [
      ...priceEvents,
      ...regimeEvents,
      ...unlockEvents,
      ...opportunityEvents,
      ...thesisEvents,
    ].filter(Boolean);

    // Deduplicate
    const seen = new Map();
    allSignals = allSignals.filter((s) => {
      const key = `${s.type}_${s.assetId.symbol}`;
      if (seen.has(key)) {
        const existing = seen.get(key);
        if (s._confidence > existing._confidence) {
          seen.set(key, s);
          return false;
        }
        return false;
      }
      seen.set(key, s);
      return true;
    });

    allSignals.sort((a, b) => b._confidence - a._confidence);

    if (W.store) {
      W.store.set(CACHE_KEY, { timestamp: Date.now(), events: allSignals });
    }

    return allSignals;
  }

  return { normalize, collectEvents };
})();

console.log("[Events] Module loaded (thesis health integrated).");
