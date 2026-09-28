// ===============================================================
//   Live Event Collector & Normalizer (Intelligence Phase) 
// ===============================================================

window.W = window.W || {};
W.events = (() => {
  "use strict";

  const CACHE_KEY = "w_events_cache_v2";
  const TTL = 5 * 60 * 1000; // 5 minutes
  const DAY = 864e5;

  const MAX_EVENTS_IN_CACHE = 500; // hard cap on persisted events
  const MAX_RAWDATA_KEYS = 24; // cap keys kept in rawData
  const MAX_RAWDATA_STRING_LEN = 500; // cap string field lengths
  const MAX_TITLE_LEN = 200;
  const MAX_DESC_LEN = 500;
  const MAX_SYMBOL_LEN = 16;
  const MAX_COLLECTOR_ERRORS = 10; // cap on surfaced errors

  // ── Import types and source reliability ──────────────────
  const { sourceReliability, freshnessWindows } = W.intelligence || {};

  // ── Prototype-safe map factory ───────────────────────────
  // Used everywhere a key is derived from upstream data.
  function newMap() {
    return Object.create(null);
  }

  // ── Safe storage wrappers ────────────────────────────────
  // Every W.store read/write goes through these. Never throws.
  function safeStoreGet(key, fallback) {
    try {
      if (!W.store || typeof W.store.get !== "function") return fallback;
      const raw = W.store.get(key, null);
      if (raw === null || raw === undefined) return fallback;
      return raw;
    } catch (e) {
      console.warn("[Events] Store read failed:", e && e.message);
      return fallback;
    }
  }

  function safeStoreSet(key, value) {
    try {
      if (!W.store || typeof W.store.set !== "function") return false;
      W.store.set(key, value);
      return true;
    } catch (e) {
      const msg = e && e.message ? String(e.message) : "unknown";
      if (/quota/i.test(msg)) {
        console.warn(
          "[Events] Event cache exceeds storage quota; dropping cache.",
        );
      } else {
        console.warn("[Events] Store write failed:", msg);
      }
      return false;
    }
  }

  // ── Numeric safety ───────────────────────────────────────
  function safeNum(val, fallback = 0.5) {
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
  }

  // ── String safety ────────────────────────────────────────
  function safeStr(v, maxLen) {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return maxLen ? s.slice(0, maxLen) : s;
  }

  // ── Timestamp safety ─────────────────────────────────────
  // Returns a finite epoch ms or null. Never NaN.
  function safeTimestamp(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? t : null;
  }

  // ── ID generation ────────────────────────────────────────
  // Crypto-strength when available. Fallback still uses a much
  // larger random component than v1 to avoid collisions.
  function generateId() {
    const c =
      typeof window !== "undefined" && (window.crypto || window.msCrypto);
    if (c && typeof c.getRandomValues === "function") {
      const bytes = new Uint8Array(8);
      c.getRandomValues(bytes);
      return (
        Date.now().toString(36) +
        "-" +
        Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
      );
    }
    return (
      Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12)
    );
  }

  // ── Raw data truncation ──────────────────────────────────
  // We keep a bounded subset of the raw payload for auditability,
  // not the full upstream object. This caps per-event memory and
  // prevents large nested metadata from inflating the cache.
  function truncateRawData(raw) {
    const out = newMap();
    if (!raw || typeof raw !== "object") return out;
    let count = 0;
    for (const key of Object.keys(raw)) {
      if (count >= MAX_RAWDATA_KEYS) break;
      // Skip keys that could carry prototype-pollution payloads.
      if (key === "__proto__" || key === "constructor" || key === "prototype") {
        continue;
      }
      const v = raw[key];
      const t = typeof v;
      if (t === "string") {
        out[key] = v.slice(0, MAX_RAWDATA_STRING_LEN);
      } else if (t === "number" || t === "boolean" || v === null) {
        out[key] = v;
      }
      // Nested objects and arrays are dropped — they are the
      // vector for both memory blowup and prototype pollution.
      count++;
    }
    return out;
  }

  // ── Confidence computation ───────────────────────────────
  // All inputs are validated before the multiplication, so the
  // result is guaranteed finite and within [0, 1].
  function computeConfidence(signal) {
    if (!signal || typeof signal !== "object") return 0;

    const source =
      typeof signal.source === "string" ? signal.source : "unknown";
    const reliability =
      sourceReliability && typeof sourceReliability[source] === "number"
        ? sourceReliability[source]
        : 0.5;

    const age = Date.now() - safeNum(signal.timestamp, Date.now());
    const windowSec =
      freshnessWindows && typeof freshnessWindows[signal.type] === "number"
        ? freshnessWindows[signal.type]
        : 3600;

    // Guard against non-positive windows producing division issues.
    const windowMs = Math.max(1000, windowSec * 1000);
    const freshness = Math.max(0, Math.min(1, 1 - age / windowMs));

    // Corroboration currently defaults to 1; wiring it is a future
    // enhancement (cross-source agreement tracking).
    const corroboration = safeNum(signal._corroboration, 1);
    const completeness = safeNum(signal._completeness, 0.8);
    const interpretation = safeNum(signal._interpretation, 0.7);

    let confidence =
      reliability *
      freshness *
      (1 + (Math.max(1, corroboration) - 1) * 0.1) *
      completeness *
      interpretation;

    if (!Number.isFinite(confidence)) confidence = 0;
    return Math.min(1, Math.max(0, confidence));
  }

  // ── Normalize raw event to Signal ────────────────────────
  // Returns a signal or null. The title must be non-empty after
  // trimming; we do NOT supply a fallback that would defeat the
  // check, unlike v1.
  function normalize(raw, type) {
    if (!raw || typeof raw !== "object") return null;
    if (typeof type !== "string" || !type) return null;

    const symbol = safeStr(
      raw.symbol || raw.id || raw.coin_id || "",
      MAX_SYMBOL_LEN,
    ).toUpperCase();

    const titleRaw = raw.title || raw.headline || raw.name;
    const title = safeStr(titleRaw, MAX_TITLE_LEN).trim();
    if (!title) return null; // real check, no fallback

    const description = safeStr(
      raw.description || raw.desc || "",
      MAX_DESC_LEN,
    ).trim();

    // Build a null-prototype AssetId so unknown keys cannot pollute.
    const assetId = newMap();
    assetId.chainId = safeStr(raw.chainId || "unknown", 64);
    assetId.contractAddress = raw.contractAddress
      ? safeStr(raw.contractAddress, 128)
      : null;
    assetId.symbol = symbol;
    assetId.coingeckoId = raw.coingeckoId ? safeStr(raw.coingeckoId, 64) : null;

    const timestamp = safeTimestamp(raw.timestamp) ?? Date.now();

    const signal = newMap();
    signal.id = generateId();
    signal.type = type;
    signal.source = safeStr(raw.source || "weaver", 64);
    signal.assetId = assetId;
    signal.timestamp = timestamp;
    signal.title = title;
    signal.description = description;
    signal.impactValue = Math.max(
      0,
      Math.min(1, safeNum(raw.impactValue, 0.5)),
    );
    signal.rawData = truncateRawData(raw);

    signal._confidence = computeConfidence(signal);
    return signal;
  }

  // ── Collector error surface ──────────────────────────────
  // v1 swallowed every collector failure. v2 accumulates them so
  // the caller can distinguish "no events" from "data unavailable."
  const collectorErrors = [];

  function recordCollectorError(name, e) {
    if (collectorErrors.length >= MAX_COLLECTOR_ERRORS) return;
    collectorErrors.push({
      collector: name,
      message:
        e && e.message ? String(e.message).slice(0, 200) : "unknown error",
      at: Date.now(),
    });
  }

  function drainCollectorErrors() {
    const out = collectorErrors.slice();
    collectorErrors.length = 0;
    return out;
  }

  // ── Collectors ───────────────────────────────────────────

  function collectPriceEvents(markets) {
    const events = [];
    if (!Array.isArray(markets)) return events;

    for (const coin of markets) {
      if (!coin || typeof coin !== "object") continue;
      const pct = Number(coin.price_change_percentage_24h);
      if (!Number.isFinite(pct)) continue;
      const change = Math.abs(pct);
      if (change <= 3) continue;

      const ev = normalize(
        {
          symbol: coin.symbol,
          name: coin.name,
          title: `${safeStr(coin.name, MAX_TITLE_LEN)} moved ${pct.toFixed(1)}% in 24h`,
          impactValue: Math.min(1, change / 15),
          source: "coingecko",
          coingeckoId: coin.id,
        },
        "PRICE_MOVE",
      );
      if (ev) events.push(ev);
    }
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
      if (!regimeData || regimeData.regime === "UNKNOWN") return events;

      const signals = Array.isArray(regimeData.signals)
        ? regimeData.signals
            .slice(0, 6)
            .map((s) => safeStr(s && s.value, 64))
            .join(", ")
        : "";

      const ev = normalize(
        {
          symbol: "BTC",
          title: `Market Regime Shift: ${safeStr(regimeData.regime, 64)}`,
          description: `Confidence: ${(safeNum(regimeData.confidence) * 100).toFixed(0)}%. Signals: ${signals}`,
          impactValue: safeNum(regimeData.confidence, 0.5),
          source: "regime_engine",
        },
        "REGIME_SHIFT",
      );
      if (ev) events.push(ev);
    } catch (e) {
      recordCollectorError("regime", e);
    }
    return events;
  }

  function collectUnlockEvents() {
    const events = [];
    try {
      const unlocks =
        W.unlocks && typeof W.unlocks.list === "function"
          ? W.unlocks.list()
          : [];
      if (!Array.isArray(unlocks) || !unlocks.length) return events;

      const now = Date.now();
      for (const u of unlocks) {
        if (!u || typeof u !== "object") continue;
        const date = Number(u.date);
        if (!Number.isFinite(date)) continue;
        const daysLeft = (date - now) / DAY;
        if (daysLeft < 0 || daysLeft > 14) continue;

        const amount = Number(u.amount);
        const amountText = Number.isFinite(amount)
          ? amount.toLocaleString()
          : "unknown";

        const ev = normalize(
          {
            symbol: u.symbol,
            name: u.name,
            title: `${safeStr(u.name, MAX_TITLE_LEN)} Unlock: ${amountText} tokens`,
            description: `${safeStr(u.type, 64)} unlock in ${daysLeft.toFixed(1)} days.`,
            impactValue: 0.6,
            source: "token_unlocks",
            coingeckoId: u.coinId,
          },
          "UNLOCK",
        );
        if (ev) events.push(ev);
      }
    } catch (e) {
      recordCollectorError("unlocks", e);
    }
    return events;
  }

  function collectOpportunityEvents(markets, regimeData) {
    const events = [];
    try {
      if (!W.opportunities || typeof W.opportunities.scan !== "function") {
        return events;
      }
      const portfolio =
        (W.portfolio && W.portfolio.all && W.portfolio.all()) || [];
      const theses = (W.theses && W.theses.all && W.theses.all()) || [];

      const opportunities = W.opportunities.scan(
        portfolio,
        theses,
        markets,
        regimeData,
      );
      if (!Array.isArray(opportunities)) return events;

      for (const opp of opportunities) {
        if (!opp || typeof opp !== "object") continue;
        const ev = normalize(
          {
            symbol: opp.symbol,
            title: opp.title,
            description: opp.description,
            impactValue: opp.impactValue || 0.5,
            source: opp.source || "opportunity_scanner",
          },
          "OPPORTUNITY",
        );
        if (ev) events.push(ev);
      }
    } catch (e) {
      recordCollectorError("opportunities", e);
    }
    return events;
  }

  // ── Thesis health collector (race fixed) ─────────────────
  // v1 fired W.api.markets() without await, then immediately read
  // priceMap — always empty. v2 awaits the fetch, builds a
  // null-prototype priceMap, and then evaluates each thesis.
  async function collectThesisHealthEvents() {
    const events = [];
    try {
      if (!W.thesisHealth || !W.theses) return events;
      const allTheses =
        typeof W.theses.all === "function" ? W.theses.all() : [];
      const activeTheses = Array.isArray(allTheses)
        ? allTheses.filter((t) => t && t.status === "active")
        : [];
      if (!activeTheses.length) return events;

      const assetIds = activeTheses
        .map((t) => t.assetId || t.symbol)
        .filter((x) => typeof x === "string" && x.length > 0);
      if (!assetIds.length) return events;

      // Build a null-prototype price map keyed only by validated
      // strings. No prototype chain, so __proto__ is a plain key.
      const priceMap = newMap();

      try {
        const ids = [...new Set(assetIds)].join(",");
        const markets = await W.api.markets(ids);
        if (Array.isArray(markets)) {
          for (const m of markets) {
            if (!m || typeof m !== "object") continue;
            const id = typeof m.id === "string" ? m.id : null;
            const price = Number(m.current_price);
            if (id && Number.isFinite(price)) {
              priceMap[id] = price;
            }
          }
        }
      } catch (e) {
        recordCollectorError("thesis_health:markets", e);
      }

      for (const thesis of activeTheses) {
        try {
          const cgId =
            typeof thesis.coingeckoId === "string" ? thesis.coingeckoId : null;
          const sym =
            typeof thesis.symbol === "string"
              ? thesis.symbol.toLowerCase()
              : null;
          const price =
            (cgId && priceMap[cgId]) || (sym && priceMap[sym]) || null;

          const health = W.thesisHealth.evaluate(thesis, price, null);
          if (!health || typeof health !== "object") continue;
          if (health.status === "Healthy") continue;

          const reasons = Array.isArray(health.reasons)
            ? health.reasons
                .slice(0, 4)
                .map((r) => safeStr(r, 120))
                .join(" ")
            : "";

          const ev = normalize(
            {
              symbol: thesis.symbol,
              title: `Thesis Deteriorating: ${safeStr(thesis.symbol, MAX_SYMBOL_LEN)}`,
              description: `Health score: ${safeNum(health.healthScore, 0)}/100. ${reasons}`,
              impactValue: 0.7,
              source: "thesis_health",
              coingeckoId: thesis.coingeckoId,
            },
            "THESIS_DETERIORATION",
          );
          if (ev) events.push(ev);
        } catch (e) {
          recordCollectorError("thesis_health:evaluate", e);
        }
      }
    } catch (e) {
      recordCollectorError("thesis_health", e);
    }
    return events;
  }

  // ── Deduplication (corrected) ────────────────────────────
  // Key = type + symbol. When a duplicate key appears, we keep
  // whichever signal has the higher confidence. The corrected
  // algorithm returns true only for signals that survive.
  function deduplicateSignals(signals) {
    const best = new Map(); // Map, not Object — immune to proto pollution

    for (const s of signals) {
      if (!s || typeof s !== "object") continue;
      const type = typeof s.type === "string" ? s.type : "UNKNOWN";
      const symbol =
        s.assetId && typeof s.assetId.symbol === "string"
          ? s.assetId.symbol
          : "";
      const key = type + "_" + symbol;

      const existing = best.get(key);
      if (!existing) {
        best.set(key, s);
        continue;
      }
      const existingConf = Number.isFinite(existing._confidence)
        ? existing._confidence
        : 0;
      const newConf = Number.isFinite(s._confidence) ? s._confidence : 0;
      if (newConf > existingConf) {
        best.set(key, s);
      }
    }

    return Array.from(best.values());
  }

  // ── Safe API wrapper ─────────────────────────────────────
  async function safeApiCall(name, fn) {
    try {
      const result = await fn();
      return result;
    } catch (e) {
      recordCollectorError(name, e);
      return null;
    }
  }

  // ── Core Aggregation ────────────────────────────────────
  async function collectEvents() {
    // Cache read (safe, never throws).
    const cached = safeStoreGet(CACHE_KEY, null);
    if (
      cached &&
      typeof cached === "object" &&
      typeof cached.timestamp === "number" &&
      Array.isArray(cached.events) &&
      Date.now() - cached.timestamp < TTL
    ) {
      return cached.events;
    }

    // Reset the error accumulator for this run.
    drainCollectorErrors();

    // 1. Fetch shared data once — each call independently guarded.
    const markets =
      (await safeApiCall("api:top", () => W.api?.top?.(50))) || [];
    const fg = await safeApiCall("api:fearGreed", () => W.api?.fearGreed?.());
    const g = await safeApiCall("api:global", () => W.api?.global?.());

    let regimeData = null;
    try {
      if (W.regime && fg && g) {
        regimeData = W.regime.detect({
          fearGreed: fg.value,
          btcDominance: g.data?.market_cap_percentage?.btc,
          capChange: g.data?.market_cap_change_percentage_24h_usd,
        });
      }
    } catch (e) {
      recordCollectorError("regime_prefetch", e);
    }

    // 2. Collect all signals. Thesis health is awaited like the rest.
    const collectorResults = await Promise.all([
      Promise.resolve(collectPriceEvents(markets)),
      Promise.resolve(collectRegimeEvents(fg, g)),
      Promise.resolve(collectUnlockEvents()),
      Promise.resolve(collectOpportunityEvents(markets, regimeData)),
      collectThesisHealthEvents(),
    ]);

    let allSignals = [];
    for (const batch of collectorResults) {
      if (Array.isArray(batch)) {
        for (const s of batch) {
          if (s) allSignals.push(s);
        }
      }
    }

    // 3. Deduplicate (corrected).
    allSignals = deduplicateSignals(allSignals);

    // 4. Sort by confidence descending. Stable for equal confidences.
    allSignals.sort((a, b) => {
      const ca = Number.isFinite(a._confidence) ? a._confidence : 0;
      const cb = Number.isFinite(b._confidence) ? b._confidence : 0;
      return cb - ca;
    });

    // 5. Cap event count before persisting.
    if (allSignals.length > MAX_EVENTS_IN_CACHE) {
      allSignals = allSignals.slice(0, MAX_EVENTS_IN_CACHE);
    }

    // 6. Persist. Write failure is non-fatal — the caller still
    //    gets this run's events.
    safeStoreSet(CACHE_KEY, {
      timestamp: Date.now(),
      events: allSignals,
    });

    return allSignals;
  }

  // ── Diagnostics ─────────────────────────────────────────
  // Callers who want to know what broke can inspect this after a
  // collectEvents() run. Returns a copy; does not drain.
  function peekCollectorErrors() {
    return collectorErrors.slice();
  }

  return {
    normalize,
    collectEvents,
    computeConfidence,
    // Additions
    deduplicateSignals,
    peekCollectorErrors,
    _internal: {
      safeNum,
      safeStr,
      safeTimestamp,
      safeStoreGet,
      safeStoreSet,
      truncateRawData,
      generateId,
      CACHE_KEY,
      TTL,
      MAX_EVENTS_IN_CACHE,
      MAX_TITLE_LEN,
      MAX_DESC_LEN,
      MAX_SYMBOL_LEN,
      MAX_RAWDATA_KEYS,
    },
  };
})();

console.log(
  "[Events] Live event collector loaded v2 — prototype-safe, race-free, bounded.",
);
