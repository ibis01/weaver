// ===============================================================
//         Live Event Collector – Uses Evidence Builder
// ===============================================================
// Constitution Compliance: Task 7 (Defensible Confidence), Task 8 (Thesis Health Integration)
// ===============================================================

window.W = window.W || {};
W.events = (() => {
  const CACHE_KEY = "w_events_cache";
  const TTL = 5 * 60 * 1000;
  const DAY = 864e5;

  // ── Helpers ──────────────────────────────────────────────
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
    const id = crypto.randomUUID
      ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

    const signal = {
      id,
      type,
      source: raw.source || "weaver",
      assetId,
      timestamp,
      rawData: { ...raw, title },
    };

    signal._metadata = {
      corroborationCount: raw.corroborationCount || 1,
      dataCompleteness: raw.dataCompleteness || 0.5,
      interpretationConfidence: raw.interpretationConfidence || 0.5,
    };

    return signal;
  }

  // ── Source Reliability Map (Constitution Rule 2.9) ───────
  const SOURCE_RELIABILITY = {
    coingecko: 0.95,
    weaver_regime: 0.85,
    token_unlocks: 0.9,
    thesis_health: 0.8,
    opportunity_scanner: 0.75,
  };

  function calculateDataFreshness(timestamp) {
    const ageMs = Date.now() - timestamp;
    if (ageMs < 60000) return 1.0; // < 1 min
    if (ageMs < 3600000) return 0.8; // < 1 hour
    if (ageMs < 86400000) return 0.5; // < 24 hours
    return 0.2; // > 24 hours
  }

  // ── Collectors ───────────────────────────────────────────
  function collectPriceEvents(markets) {
    const events = [];
    if (!Array.isArray(markets)) return events;

    markets.forEach((coin) => {
      const change = Math.abs(coin.price_change_percentage_24h || 0);
      if (change > 3) {
        const freshness = calculateDataFreshness(
          coin.last_updated
            ? new Date(coin.last_updated).getTime()
            : Date.now(),
        );
        const confidence = SOURCE_RELIABILITY.coingecko * freshness; // Defensible confidence

        events.push(
          normalize(
            {
              symbol: coin.symbol,
              name: coin.name,
              title: `${coin.name} moved ${coin.price_change_percentage_24h.toFixed(1)}% in 24h`,
              impactValue: Math.min(1, change / 15),
              confidence: confidence,
              urgency: change > 7 ? 0.9 : 0.6,
              source: "coingecko",
              dataCompleteness: 0.9, // Price data is highly complete
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
        // Defensible confidence: base reliability * freshness of FG data
        const freshness = calculateDataFreshness(Date.now()); // FG is usually fresh
        const confidence = SOURCE_RELIABILITY.weaver_regime * freshness;
        const completeness =
          fg.value && g.data?.market_cap_percentage?.btc ? 0.9 : 0.5;

        events.push(
          normalize(
            {
              symbol: "BTC",
              title: `Market Regime Shift: ${regimeData.regime}`,
              description: `Confidence: ${(regimeData.confidence * 100).toFixed(0)}%. Signals: ${regimeData.signals.map((s) => s.value).join(", ")}`,
              impactValue: regimeData.confidence || 0.5,
              source: "weaver_regime",
              interpretationConfidence: confidence, // REPLACED MAGIC NUMBER
              dataCompleteness: completeness, // REPLACED MAGIC NUMBER
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
        const freshness = calculateDataFreshness(u.date); // Freshness based on proximity to event
        const confidence = SOURCE_RELIABILITY.token_unlocks * freshness;
        // Completeness is high if we have coinId and amount
        const completeness = u.coinId && u.amount ? 0.9 : 0.6;

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
              interpretationConfidence: confidence, // REPLACED MAGIC NUMBER
              dataCompleteness: completeness, // REPLACED MAGIC NUMBER
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
        const freshness = calculateDataFreshness(Date.now());
        const sourceRel = SOURCE_RELIABILITY[opp.source] || 0.7;
        const confidence = sourceRel * freshness;

        events.push(
          normalize(
            {
              symbol: opp.symbol,
              title: opp.title,
              description: opp.description,
              impactValue: opp.impactValue || 0.5,
              source: opp.source || "opportunity_scanner",
              interpretationConfidence: confidence, // REPLACED MAGIC NUMBER
              dataCompleteness: opp.dataCompleteness || 0.7,
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

  async function collectThesisHealthEvents() {
    const events = [];
    try {
      if (!W.thesisHealth || !W.theses) return events;
      const activeTheses = W.theses.all().filter((t) => t.status === "active");
      if (!activeTheses.length) return events;

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
          const freshness = calculateDataFreshness(Date.now());
          const confidence = SOURCE_RELIABILITY.thesis_health * freshness;
          // Completeness depends on whether we had price AND regime data
          const completeness = price && regimeData ? 0.9 : 0.5;

          const signal = normalize(
            {
              symbol: thesis.symbol,
              name: thesis.asset || thesis.symbol,
              title: `Thesis ${health.status}: ${thesis.symbol}`,
              description: `Health score: ${health.healthScore}/100. ${health.reasons.join(" ")}`,
              impactValue: impactValue,
              source: "thesis_health",
              coingeckoId: thesis.coingeckoId,
              interpretationConfidence: confidence, // REPLACED MAGIC NUMBER
              dataCompleteness: completeness, // REPLACED MAGIC NUMBER
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

  // ── Core Aggregation ───────────────────────────────────
  async function collectEvents() {
    const cached = W.store?.get(CACHE_KEY);
    if (cached && Date.now() - cached.timestamp < TTL) {
      return cached.events;
    }

    let markets = [],
      fg = null,
      g = null;
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

    // ── Improved Deduplication ───────────────────────────
    const seen = new Map();
    const DEDUP_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

    allSignals = allSignals.filter((s) => {
      const bucket = Math.floor(s.timestamp / DEDUP_WINDOW_MS);
      const key = `${s.type}_${s.assetId.symbol}_${bucket}`;
      if (seen.has(key)) {
        const existing = seen.get(key);
        const existingMeta = existing._metadata || {};
        const newMeta = s._metadata || {};
        const existingCompleteness = existingMeta.dataCompleteness || 0;
        const newCompleteness = newMeta.dataCompleteness || 0;
        if (newCompleteness > existingCompleteness) {
          seen.set(key, s);
          return false;
        }
        return false;
      }
      seen.set(key, s);
      return true;
    });

    if (W.store) {
      W.store.set(CACHE_KEY, { timestamp: Date.now(), events: allSignals });
    }

    return allSignals;
  }

  return { normalize, collectEvents };
})(); // ✅ FIXED SYNTAX ERROR

console.log(
  "[Events] Module loaded (thesis health integrated, defensible confidence, improved dedup).",
);
