// ===============================================================
//         Live Event Collector – Includes Thesis Health
// ===============================================================

window.W = window.W || {};
W.events = (() => {
  const CACHE_KEY = "w_events_cache";
  const TTL = 5 * 60 * 1000;
  const DAY = 864e5;

  const { sourceReliability, freshnessWindows } = W.intelligence || {};

  function safeNum(val, fallback = 0.5) {
    return typeof val === "number" && !isNaN(val) ? val : fallback;
  }

  function computeConfidence(signal) {
    const source = signal.source || "unknown";
    const reliability = sourceReliability?.[source] || 0.5;
    const age = Date.now() - signal.timestamp;
    const window = freshnessWindows?.[signal.type] || 3600;
    const freshness = Math.max(0, 1 - age / (window * 1000));
    const corroboration = 1;
    const completeness = 0.8;
    const interpretation = 0.7;
    let confidence =
      reliability *
      freshness *
      (1 + (corroboration - 1) * 0.1) *
      completeness *
      interpretation;
    confidence = Math.min(1, Math.max(0, confidence));
    return confidence;
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
    signal._confidence = computeConfidence(signal);
    return signal;
  }

  function collectPriceEvents(markets) {
    const events = [];
    if (!Array.isArray(markets)) return events;

    markets.forEach((coin) => {
      const change = Math.abs(coin.price_change_percentage_24h || 0);
      if (change > 3) {
        events.push(
          normalize(
            {
              symbol: coin.symbol,
              name: coin.name,
              title: `${coin.name} moved ${coin.price_change_percentage_24h.toFixed(1)}% in 24h`,
              impactValue: Math.min(1, change / 15),
              source: "coingecko",
              coingeckoId: coin.id,
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
              impactValue: regimeData.confidence,
              source: "regime_engine",
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

  // ── NEW: Collect Thesis Health signals ──────────────────
  function collectThesisHealthEvents() {
    const events = [];
    try {
      if (!W.thesisHealth || !W.theses) return events;
      const activeTheses = W.theses.all().filter((t) => t.status === "active");
      if (!activeTheses.length) return events;

      let priceMap = {};
      const assetIds = activeTheses
        .map((t) => t.assetId || t.symbol)
        .filter(Boolean);
      if (assetIds.length) {
        W.api
          .markets(assetIds.join(","))
          .then((markets) => {
            markets.forEach((m) => {
              priceMap[m.id] = m.current_price;
            });
          })
          .catch(() => {});
      }

      activeTheses.forEach((thesis) => {
        const price =
          priceMap[thesis.coingeckoId] ||
          priceMap[thesis.symbol?.toLowerCase()] ||
          null;
        const health = W.thesisHealth.evaluate(thesis, price, null);
        if (health && health.status !== "Healthy") {
          events.push(
            normalize(
              {
                symbol: thesis.symbol,
                title: `Thesis Deteriorating: ${thesis.symbol}`,
                description: `Health score: ${health.healthScore}/100. ${health.reasons.join(" ")}`,
                impactValue: 0.7,
                source: "thesis_health",
                coingeckoId: thesis.coingeckoId,
              },
              "THESIS_DETERIORATION",
            ),
          );
        }
      });
    } catch (e) {
      console.warn("[Events] Thesis health collection failed:", e.message);
    }
    return events;
  }

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

    let allSignals = [
      ...collectPriceEvents(markets),
      ...collectRegimeEvents(fg, g),
      ...collectUnlockEvents(),
      ...collectOpportunityEvents(markets, regimeData),
      ...collectThesisHealthEvents(),
    ].filter(Boolean);

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

  return { normalize, collectEvents, computeConfidence };
})();

console.log("[Events] Module loaded (with confidence model).");
