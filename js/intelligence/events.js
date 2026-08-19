// ===============================================================
//         Live Event Collector & Normalizer (Task 15 Update)
// ===============================================================
//
// Purpose: Aggregate live data from various sources into a
// unified Event schema for the Ranker engine.
// Now includes: Price Moves, Regime Shifts, and Token Unlocks.
//
// ===============================================================

window.W = window.W || {};
W.events = (() => {
  const CACHE_KEY = "w_events_cache";
  const TTL = 5 * 60 * 1000; // 5 minutes cache
  const DAY = 864e5;

  // ── Utilities ───────────────────────────────────────────
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

  // ─ Collectors ──────────────────────────────────────────

  async function collectPriceEvents() {
    const events = [];
    try {
      const coins = (await W.api?.top?.(50)) || [];
      coins.forEach((coin) => {
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
    } catch (e) {
      console.warn("[Events] Price collection failed:", e.message);
    }
    return events;
  }

  async function collectRegimeEvents() {
    const events = [];
    try {
      if (!W.regime) return events;
      const fg = await W.api?.fearGreed?.();
      const g = await W.api?.global?.();

      if (fg && g) {
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
      }
    } catch (e) {
      console.warn("[Events] Regime collection failed:", e.message);
    }
    return events;
  }

  // ─ NEW: Token Unlock Collector (Task 15) ─────────────
  async function collectUnlockEvents() {
    const events = [];
    try {
      // 1. Get unlocks from the module
      const unlocks = W.unlocks?.list ? W.unlocks.list() : [];
      if (!unlocks.length) return events;

      // 2. Filter for upcoming unlocks (Next 14 days)
      const now = Date.now();
      const upcoming = unlocks.filter((u) => {
        const daysLeft = (u.date - now) / DAY;
        return daysLeft >= 0 && daysLeft <= 14;
      });

      if (!upcoming.length) return events;

      // 3. Fetch market data to calculate pressure (Value vs Volume)
      const ids = [...new Set(upcoming.map((u) => u.coinId))]
        .filter(Boolean)
        .join(",");
      let markets = [];
      if (ids) {
        try {
          markets = await W.api.markets(ids);
        } catch (e) {
          console.warn("[Events] Unlock market fetch failed");
        }
      }

      // 4. Normalize into Events
      upcoming.forEach((u) => {
        const market = markets.find((m) => m.id === u.coinId) || {};
        const price = market.current_price || 0;
        const volume = market.total_volume || 1; // Avoid div by zero

        const unlockValue = u.amount * price;
        // Pressure Ratio: How big is this unlock compared to daily trading volume?
        // e.g. Ratio 0.5 means unlock is 50% of daily volume (High Impact)
        const pressureRatio = unlockValue / volume;

        const daysLeft = (u.date - now) / DAY;
        const hoursLeft = daysLeft * 24;

        // Urgency: Higher as we get closer
        const urgency = hoursLeft < 24 ? 0.95 : hoursLeft < 168 ? 0.75 : 0.5;

        // Impact: Based on pressure ratio. 100% ratio = 1.0 impact.
        const impactValue = Math.min(1, pressureRatio);

        events.push(
          normalize(
            {
              symbol: u.symbol,
              name: u.name,
              title: `${u.name} Unlock: ${u.amount.toLocaleString()} tokens`,
              description: `${u.type} unlock in ${daysLeft.toFixed(1)} days. Est. Value: ${W.fmt.money(unlockValue, { compact: true })}. Pressure: ${(pressureRatio * 100).toFixed(0)}% of daily vol.`,
              impactValue: impactValue > 0.1 ? impactValue : 0.2, // Min impact for any unlock
              confidence: 0.95, // Deterministic schedule
              urgency: urgency,
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

  // ── Core Aggregation ────────────────────────────────────

  async function collectEvents() {
    // Check cache first
    const cached = W.store?.get(CACHE_KEY);
    if (cached && Date.now() - cached.timestamp < TTL) {
      return cached.events;
    }

    // Aggregate live sources in parallel
    const [prices, regime, unlocks] = await Promise.all([
      collectPriceEvents(),
      collectRegimeEvents(),
      collectUnlockEvents(), // Added Task 15
    ]);

    const allEvents = [...prices, ...regime, ...unlocks];

    // Save to cache
    if (W.store) {
      W.store.set(CACHE_KEY, { timestamp: Date.now(), events: allEvents });
    }

    return allEvents;
  }

  return { normalize, collectEvents };
})();

console.log("[Events] Live event collector loaded (with Unlocks).");
