window.W = window.W || {};

/* Snapshot overlay: live APIs stay first-choice; when this network blocks
   them all, price everything from the real CoinGecko snapshot in data/top.json
   (same origin = unblockable). */
(function () {
  const SNAPSHOT_GLOBAL = {
    total_market_cap: { usd: 2272990000000 },
    total_volume: { usd: 51130000000 },
    market_cap_percentage: { btc: 56.3, eth: 10.0 },
    market_cap_change_percentage_24h_usd: 0.04,
  };
  const SNAPSHOT_FNG = { value: "27", value_classification: "Fear" };
  let mem = null;

  async function load() {
    if (mem && mem.length) return mem;
    try {
      const r = await fetch("data/top.json?t=" + Date.now(), {
        cache: "no-store",
      });
      if (r.ok) {
        const d = await r.json();
        if (Array.isArray(d) && d.length) {
          mem = d;
          try {
            localStorage.setItem("snap-top", JSON.stringify(d));
          } catch (e) {}
          return mem;
        }
      }
    } catch (e) {}
    try {
      const s = JSON.parse(localStorage.getItem("snap-top") || "null");
      if (Array.isArray(s) && s.length) {
        mem = s;
        return mem;
      }
    } catch (e) {}
    return null;
  }

  function patch() {
    const api = W.api;
    if (!api) return;
    const om = api.markets && api.markets.bind(api),
      ot = api.top && api.top.bind(api),
      og = api.global && api.global.bind(api),
      of = api.fearGreed && api.fearGreed.bind(api),
      oc = api.chart && api.chart.bind(api);

    if (om)
      api.markets = (ids) =>
        om(ids).catch(async () => {
          const top = await load();
          if (!top) throw new Error("no snapshot");
          const want = Array.isArray(ids) ? ids : String(ids).split(",");
          const rows = top.filter((c) => want.includes(c.id));
          if (!rows.length) throw new Error("no snapshot");
          api.source = "snapshot";
          return rows;
        });
    if (ot)
      api.top = (n) =>
        ot(n).catch(async () => {
          const top = await load();
          if (!top) throw new Error("no snapshot");
          api.source = "snapshot";
          return top.slice(0, n);
        });
    if (og)
      api.global = () =>
        og().catch(async () => {
          if (!(await load())) throw new Error("no snapshot");
          api.source = "snapshot";
          return { data: SNAPSHOT_GLOBAL };
        });
    if (of)
      api.fearGreed = () =>
        of().catch(async () => {
          if (!(await load())) throw new Error("no snapshot");
          api.source = "snapshot";
          return SNAPSHOT_FNG;
        });
    if (oc)
      api.chart = (id, days) =>
        oc(id, days).catch(async () => {
          const top = await load();
          if (!top) throw new Error("no snapshot");
          const c = top.find((x) => x.id === id);
          if (!c || !c.sparkline_in_7d) throw new Error("no snapshot");
          const p = c.sparkline_in_7d.price,
            now = Date.now();
          api.source = "snapshot";
          return p.map((v, i) => [now - (p.length - 1 - i) * 36e5, v]);
        });
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", patch);
  else patch();
})();
