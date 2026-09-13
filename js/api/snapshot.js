// js/api/snapshot.js – Fallback Snapshot Cache

// This module provides local snapshot fallbacks when live APIs are unreachable.
// It patches W.api methods to return cached data from /data/ folder.

window.W = window.W || {};

(function () {
  // ── Constants ─────────────────────────────────────────
  const SNAPSHOT_GLOBAL = {
    data: {
      total_market_cap: { usd: 2272990000000 },
      total_volume: { usd: 51130000000 },
      market_cap_percentage: { btc: 56.3, eth: 10.0 },
      market_cap_change_percentage_24h_usd: 0.04,
    },
  };

  const SNAPSHOT_FNG = {
    value: "41",
    value_classification: "Fear",
    timestamp: Date.now() / 1000,
  };

  let topSnapshot = null;
  let globalSnapshot = null;
  let fngSnapshot = null;
  const snapshotTimes = {};

  function saveStored(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify({ value, savedAt: Date.now() }));
    } catch (e) {}
  }

  function readStored(key) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key));
      if (parsed && parsed.value !== undefined) return parsed;
      return parsed
        ? { value: parsed, savedAt: Date.now() - 31 * 60 * 1000 }
        : null;
    } catch (e) {
      return null;
    }
  }

  function acceptSnapshot(name, value) {
    if (!W.schemas) return value;
    if (name === "top") return W.schemas.markets(value);
    if (name === "global") return W.schemas.global(value);
    if (name === "fng") return W.schemas.fearGreed(value);
    return value;
  }

  function markSnapshot(name, source, observedAt) {
    snapshotTimes[name] = observedAt || Date.now();
    W.dataHealth?.mark(
      name === "fng"
        ? "fear-greed"
        : name === "global"
          ? "global-market"
          : "markets",
      {
        source,
        observedAt: snapshotTimes[name],
        staleAfter: 30 * 60 * 1000,
      },
    );
  }

  function markFallback(resource, snapshotName) {
    W.dataHealth?.mark(resource, {
      source: "snapshot",
      observedAt: snapshotTimes[snapshotName] || Date.now() - 31 * 60 * 1000,
      staleAfter: 30 * 60 * 1000,
    });
  }

  // ── Load snapshots ─────────────────────────────────────
  async function loadSnapshots() {
    try {
      // Try loading from /data/ folder
      const [topRes, globalRes, fngRes] = await Promise.allSettled([
        fetch("data/top.json?t=" + Date.now(), { cache: "no-store" }),
        fetch("data/global.json?t=" + Date.now(), { cache: "no-store" }),
        fetch("data/fng.json?t=" + Date.now(), { cache: "no-store" }),
      ]);

      if (topRes.status === "fulfilled" && topRes.value.ok) {
        topSnapshot = acceptSnapshot("top", await topRes.value.json());
        saveStored("snapshot-top", topSnapshot);
        markSnapshot("top", "snapshot", Date.now());
      } else {
        // Fallback to localStorage
        const stored = readStored("snapshot-top");
        if (stored) {
          topSnapshot = acceptSnapshot("top", stored.value);
          markSnapshot("top", "local-cache", stored.savedAt);
        }
      }

      if (globalRes.status === "fulfilled" && globalRes.value.ok) {
        globalSnapshot = acceptSnapshot("global", await globalRes.value.json());
        saveStored("snapshot-global", globalSnapshot);
        markSnapshot("global", "snapshot", Date.now());
      } else {
        const stored = readStored("snapshot-global");
        if (stored) {
          globalSnapshot = acceptSnapshot("global", stored.value);
          markSnapshot("global", "local-cache", stored.savedAt);
        } else {
          globalSnapshot = SNAPSHOT_GLOBAL;
          markSnapshot(
            "global",
            "built-in-fallback",
            Date.now() - 31 * 60 * 1000,
          );
        }
      }

      if (fngRes.status === "fulfilled" && fngRes.value.ok) {
        fngSnapshot = acceptSnapshot("fng", await fngRes.value.json());
        saveStored("snapshot-fng", fngSnapshot);
        markSnapshot("fng", "snapshot", Date.now());
      } else {
        const stored = readStored("snapshot-fng");
        if (stored) {
          fngSnapshot = acceptSnapshot("fng", stored.value);
          markSnapshot("fng", "local-cache", stored.savedAt);
        } else {
          fngSnapshot = SNAPSHOT_FNG;
          markSnapshot("fng", "built-in-fallback", Date.now() - 31 * 60 * 1000);
        }
      }
    } catch (e) {
      console.warn("[Snapshot] Load error:", e);
      // Use hardcoded defaults
      topSnapshot = topSnapshot || [];
      globalSnapshot = globalSnapshot || SNAPSHOT_GLOBAL;
      fngSnapshot = fngSnapshot || SNAPSHOT_FNG;
      markSnapshot("top", "built-in-fallback", Date.now() - 31 * 60 * 1000);
      markSnapshot("global", "built-in-fallback", Date.now() - 31 * 60 * 1000);
      markSnapshot("fng", "built-in-fallback", Date.now() - 31 * 60 * 1000);
    }

    // Ensure we have arrays
    if (!Array.isArray(topSnapshot)) topSnapshot = [];
  }

  // ── Patch API methods ──────────────────────────────────
  async function patchAPI() {
    const api = W.api;
    if (!api) {
      console.warn("[Snapshot] W.api not found, skipping patch");
      return;
    }

    // Wait for snapshots to load
    await loadSnapshots();

    // ── Patch markets ──────────────────────────────────
    const originalMarkets = api.markets;
    if (originalMarkets) {
      api.markets = async (ids) => {
        try {
          return await originalMarkets(ids);
        } catch (e) {
          console.warn("[Snapshot] Markets fallback:", e.message);
          if (!topSnapshot || !topSnapshot.length)
            throw new Error("No snapshot data");
          const idArray = typeof ids === "string" ? ids.split(",") : ids;
          const result = topSnapshot.filter((c) => idArray.includes(c.id));
          api.source = "snapshot";
          markFallback("markets", "top");
          return result.length ? result : topSnapshot.slice(0, idArray.length);
        }
      };
    }

    // ── Patch top ──────────────────────────────────────
    const originalTop = api.top;
    if (originalTop) {
      api.top = async (limit) => {
        try {
          return await originalTop(limit);
        } catch (e) {
          console.warn("[Snapshot] Top fallback:", e.message);
          if (!topSnapshot || !topSnapshot.length)
            throw new Error("No snapshot data");
          api.source = "snapshot";
          markFallback("markets", "top");
          return topSnapshot.slice(0, limit);
        }
      };
    }

    // ── Patch global ──────────────────────────────────
    const originalGlobal = api.global;
    if (originalGlobal) {
      api.global = async () => {
        try {
          return await originalGlobal();
        } catch (e) {
          console.warn("[Snapshot] Global fallback:", e.message);
          api.source = "snapshot";
          markFallback("global-market", "global");
          return globalSnapshot || SNAPSHOT_GLOBAL;
        }
      };
    }

    // ── Patch fearGreed ──────────────────────────────
    const originalFG = api.fearGreed;
    if (originalFG) {
      api.fearGreed = async () => {
        try {
          return await originalFG();
        } catch (e) {
          console.warn("[Snapshot] FearGreed fallback:", e.message);
          api.source = "snapshot";
          markFallback("fear-greed", "fng");
          const fg = fngSnapshot?.data?.[0] || SNAPSHOT_FNG;
          return fg;
        }
      };
    }

    // ── Patch chart ───────────────────────────────────
    const originalChart = api.chart;
    if (originalChart) {
      api.chart = async (id, days) => {
        try {
          return await originalChart(id, days);
        } catch (e) {
          console.warn("[Snapshot] Chart fallback:", e.message);
          if (!topSnapshot || !topSnapshot.length)
            throw new Error("No snapshot data");
          const coin = topSnapshot.find((c) => c.id === id);
          if (coin?.sparkline_in_7d?.price) {
            api.source = "snapshot";
            markFallback("chart", "top");
            const prices = coin.sparkline_in_7d.price;
            const now = Date.now();
            return prices.map((v, i) => [
              now - (prices.length - 1 - i) * 3600000,
              v,
            ]);
          }
          throw new Error("No chart data in snapshot");
        }
      };
    }

    // ── Patch search ──────────────────────────────────
    const originalSearch = api.search;
    if (originalSearch) {
      api.search = async (query) => {
        try {
          return await originalSearch(query);
        } catch (e) {
          console.warn("[Snapshot] Search fallback:", e.message);
          if (!topSnapshot || !topSnapshot.length)
            throw new Error("No snapshot data");
          const q = query.toLowerCase();
          const results = topSnapshot
            .filter(
              (c) =>
                c.name.toLowerCase().includes(q) ||
                c.symbol.toLowerCase().includes(q),
            )
            .slice(0, 10);
          api.source = "snapshot";
          markFallback("markets", "top");
          return {
            coins: results.map((c) => ({
              id: c.id,
              name: c.name,
              symbol: c.symbol,
              thumb: c.image,
              market_cap_rank: c.market_cap_rank,
            })),
          };
        }
      };
    }

    // ── Patch coin ────────────────────────────────────
    const originalCoin = api.coin;
    if (originalCoin) {
      api.coin = async (id) => {
        try {
          return await originalCoin(id);
        } catch (e) {
          console.warn("[Snapshot] Coin fallback:", e.message);
          if (!topSnapshot || !topSnapshot.length)
            throw new Error("No snapshot data");
          const coin = topSnapshot.find((c) => c.id === id);
          if (!coin) throw new Error("Coin not found in snapshot");
          api.source = "snapshot";
          markFallback("markets", "top");
          return {
            id: coin.id,
            symbol: coin.symbol,
            name: coin.name,
            image: { large: coin.image, small: coin.image },
            market_data: {
              current_price: { usd: coin.current_price },
              market_cap: { usd: coin.market_cap },
              total_volume: { usd: coin.total_volume },
              price_change_percentage_24h: coin.price_change_percentage_24h,
              price_change_percentage_7d:
                coin.price_change_percentage_7d_in_currency,
              price_change_percentage_30d:
                coin.price_change_percentage_30d_in_currency,
              circulating_supply: coin.circulating_supply,
              max_supply: coin.max_supply,
              ath: { usd: coin.ath },
              ath_change_percentage: { usd: coin.ath_change_percentage },
              atl: { usd: coin.atl },
            },
            market_cap_rank: coin.market_cap_rank,
            description: {
              en: `${coin.name} is a cryptocurrency. Data from snapshot.`,
            },
            links: { homepage: [] },
            platforms: {},
          };
        }
      };
    }

    console.log("[Snapshot] API patched with fallbacks");
  }

  // ── Initialize on load ────────────────────────────────
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", patchAPI);
  } else {
    patchAPI();
  }

  // ── Expose snapshot data for debugging ────────────────
  window.__SNAPSHOT = {
    top: () => topSnapshot,
    global: () => globalSnapshot,
    fng: () => fngSnapshot,
    reload: loadSnapshots,
  };

  console.log("[Snapshot] Module loaded.");
})();
