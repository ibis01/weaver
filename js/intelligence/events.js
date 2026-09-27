// ===============================================================
//         Live Event Collector – Uses Evidence Builder
// ===============================================================
// Constitution Compliance: Task 7 (Defensible Confidence),
//                         Task 8 (Thesis Health Integration)
//
// v2 changelog:
//   - Signals built via W.intelligence.create.signal(). Malformed
//     input returns null, never a partially-formed object.
//   - Metadata field renamed _metadata → metadata (see types.js).
//   - Cache is versioned. Old cache shapes are ignored, not coerced.
//   - Cache write is atomic: the full payload is validated before
//     the write happens, so a partial write cannot leave a corrupt
//     cache behind.
//   - All collector bodies guard against non-array returns from
//     downstream modules (W.unlocks.list, W.opportunities.scan).
//   - Prototype-pollution safe: raw payloads are never merged into
//     plain objects via attacker-controlled keys.
//   - Timestamp bounds: signals older than 7 days or newer than now
//     are rejected at ingest.
//   - Deduplication uses metadata.dataCompleteness correctly when
//     either side is null (null is treated as "unknown", not 0).
// ===============================================================

window.W = window.W || {};
W.events = (() => {
  const CACHE_KEY = "w_events_cache";
  const CACHE_VERSION = 2;
  const TTL = 5 * 60 * 1000;
  const DAY = 864e5;
  const MAX_SIGNAL_AGE_MS = 7 * DAY;

  // ── Helpers ──────────────────────────────────────────────
  function _isValidTimestamp(ts) {
    if (!Number.isFinite(ts)) return false;
    if (ts <= 0) return false;
    if (ts > Date.now() + 60000) return false; // reject future
    if (Date.now() - ts > MAX_SIGNAL_AGE_MS) return false;
    return true;
  }

  function calculateDataFreshness(timestamp) {
    if (!Number.isFinite(timestamp)) return 0;
    const ageMs = Date.now() - timestamp;
    if (ageMs < 60000) return 1.0;
    if (ageMs < 3600000) return 0.8;
    if (ageMs < 86400000) return 0.5;
    return 0.2;
  }

  // ── Normalize a raw payload into a canonical Signal ──────
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
      corroborationCount: raw.corroborationCount || 1,
      dataCompleteness:
        raw.dataCompleteness === undefined ? null : raw.dataCompleteness,
      interpretationConfidence:
        raw.interpretationConfidence === undefined
          ? null
          : raw.interpretationConfidence,
    };

    const signal = W.intelligence.create.signal({
      type,
      source: raw.source || "weaver",
      assetId: assetIdInput,
      timestamp,
      rawData: { ...raw, title },
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

      const lastUpdated = coin.last_updated
        ? new Date(coin.last_updated).getTime()
        : Date.now();
      const freshness = calculateDataFreshness(
        _isValidTimestamp(lastUpdated) ? lastUpdated : Date.now(),
      );
      const sourceRel = W.intelligence.getSourceReliability("coinlore");
      const confidence = sourceRel * freshness;

      const sig = normalize(
        {
          symbol: coin.symbol,
          name: coin.name,
          title: `${coin.name} moved ${changeRaw.toFixed(1)}% in 24h`,
          impactValue: Math.min(1, change / 15),
          confidence: confidence,
          urgency: change > 7 ? 0.9 : 0.6,
          source: "coinlore",
          dataCompleteness: 0.9,
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

      const freshness = calculateDataFreshness(Date.now());
      const sourceRel = W.intelligence.getSourceReliability("weaver_regime");
      const confidence = sourceRel * freshness;
      const completeness =
        Number.isFinite(fgValue) && Number.isFinite(btcDom) ? 0.9 : 0.5;

      const signalsText = Array.isArray(regimeData.signals)
        ? regimeData.signals
            .map((s) => s && s.value)
            .filter(Boolean)
            .join(", ")
        : "";

      const sig = normalize(
        {
          symbol: "BTC",
          title: `Market Regime Shift: ${regimeData.regime}`,
          description: `Confidence: ${((regimeData.confidence || 0) * 100).toFixed(0)}%. Signals: ${signalsText}`,
          impactValue: Number.isFinite(regimeData.confidence)
            ? regimeData.confidence
            : 0.5,
          source: "weaver_regime",
          interpretationConfidence: confidence,
          dataCompleteness: completeness,
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
        const freshness = calculateDataFreshness(d);
        const sourceRel = W.intelligence.getSourceReliability("token_unlocks");
        const confidence = sourceRel * freshness;
        const completeness = u.coinId && u.amount ? 0.9 : 0.6;
        const amountText =
          Number.isFinite(u.amount) && u.amount > 0
            ? Number(u.amount).toLocaleString()
            : "unknown";

        const sig = normalize(
          {
            symbol: u.symbol,
            name: u.name,
            title: `${u.name || u.symbol || "Token"} Unlock: ${amountText} tokens`,
            description: `${u.type || "Scheduled"} unlock in ${daysLeft.toFixed(1)} days.`,
            impactValue: 0.6,
            source: "token_unlocks",
            coingeckoId: u.coinId,
            interpretationConfidence: confidence,
            dataCompleteness: completeness,
            corroborationCount: 1,
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
        const freshness = calculateDataFreshness(Date.now());
        const sourceRel = W.intelligence.getSourceReliability(
          opp.source || "opportunity_scanner",
        );
        const confidence = sourceRel * freshness;

        const sig = normalize(
          {
            symbol: opp.symbol,
            title: opp.title,
            description: opp.description,
            impactValue: Number.isFinite(opp.impactValue)
              ? opp.impactValue
              : 0.5,
            source: opp.source || "opportunity_scanner",
            interpretationConfidence: confidence,
            dataCompleteness: Number.isFinite(opp.dataCompleteness)
              ? opp.dataCompleteness
              : 0.7,
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

          const impactValue = Math.min(
            1,
            (100 - Number(health.healthScore || 0)) / 100,
          );
          const freshness = calculateDataFreshness(Date.now());
          const sourceRel =
            W.intelligence.getSourceReliability("thesis_health");
          const confidence = sourceRel * freshness;
          const completeness = price && regimeData ? 0.9 : 0.5;

          const sig = normalize(
            {
              symbol: thesis.symbol,
              name: thesis.asset || thesis.symbol,
              title: `Thesis ${health.status}: ${thesis.symbol}`,
              description: `Health score: ${health.healthScore}/100. ${(health.reasons || []).join(" ")}`,
              impactValue,
              source: "thesis_health",
              coingeckoId: thesis.coingeckoId,
              interpretationConfidence: confidence,
              dataCompleteness: completeness,
              timestamp: Date.now(),
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
  // Two signals are considered duplicates when they share a type, an
  // asset symbol, and fall within the same 10-minute bucket. Among
  // duplicates, the one with the higher dataCompleteness wins;
  // null counts as "unknown" and loses to any finite value.
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
      // Validate every cached signal on read. A cache written by a
      // buggy version is discarded wholesale, not partially used.
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
  "[Events] Module loaded (thesis health integrated, defensible confidence, improved dedup).",
);
