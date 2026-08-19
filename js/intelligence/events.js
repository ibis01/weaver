// ===============================================================
//         Live Event Collector & Normalizer (Task 20 Update)
// ===============================================================

window.W = window.W || {};
W.events = (() => {
  const CACHE_KEY = "w_events_cache";
  const TTL = 5 * 60 * 1000; // 5 minutes cache
  const DAY = 864e5;

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

    return {
      type,
      symbol,
      title,
      description: String(raw.description || raw.summary || ""),
      impactValue: safeNum(raw.impactValue, 0.5),
      confidence: safeNum(raw.confidence, 0.7),
      urgency: safeNum(raw.urgency, 0.5),
      timestamp: raw.timestamp
        ? new Date(raw.timestamp).toISOString()
        : new Date().toISOString(),
      source: raw.source || "weaver",
    };
  }

  // ── Collectors ──────────────────────────────────────────

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
              confidence: 0.95,
              urgency: change > 7 ? 0.9 : 0.6,
              source: "coingecko",
            },
            "price_change",
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
              confidence: regimeData.confidence,
              urgency: regimeData.regime === "RISK-OFF" ? 0.9 : 0.7,
              source: "weaver_regime",
            },
            "regime_shift",
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

      // Note: For unlocks, we ideally need market data to calculate pressure.
      // In this optimized version, we pass a simplified unlock event.
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
              confidence: 0.95,
              urgency: daysLeft < 1 ? 0.95 : daysLeft < 7 ? 0.75 : 0.5,
              source: "token_unlocks",
            },
            "unlock",
          ),
        );
      });
    } catch (e) {
      console.warn("[Events] Unlock collection failed:", e.message);
    }
    return events;
  }

  // ── NEW: Opportunity Collector (Task 20) ────────────────
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
              impactValue: opp.impactValue,
              confidence: opp.confidence,
              urgency: opp.urgency,
              source: opp.source,
            },
            "opportunity",
          ),
        );
      });
    } catch (e) {
      console.warn("[Events] Opportunity collection failed:", e.message);
    }
    return events;
  }

  // ── Core Aggregation ────────────────────────────────────

  async function collectEvents() {
    const cached = W.store?.get(CACHE_KEY);
    if (cached && Date.now() - cached.timestamp < TTL) {
      return cached.events;
    }

    // 1. Fetch shared data once (Rule 31)
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

    // 2. Calculate regime once to pass to collectors
    let regimeData = null;
    if (W.regime && fg && g) {
      regimeData = W.regime.detect({
        fearGreed: fg.value,
        btcDominance: g.data?.market_cap_percentage?.btc,
        capChange: g.data?.market_cap_change_percentage_24h_usd,
      });
    }

    // 3. Aggregate all sources
    const prices = collectPriceEvents(markets);
    const regime = collectRegimeEvents(fg, g);
    const unlocks = collectUnlockEvents();
    const opportunities = collectOpportunityEvents(markets, regimeData);

    const allEvents = [...prices, ...regime, ...unlocks, ...opportunities];

    if (W.store) {
      W.store.set(CACHE_KEY, { timestamp: Date.now(), events: allEvents });
    }

    return allEvents;
  }

  return { normalize, collectEvents };
})();

console.log("[Events] Live event collector loaded (with Opportunities).");
