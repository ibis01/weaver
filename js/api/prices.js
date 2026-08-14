window.W = window.W || {};

W.api = (() => {
  const CG = "https://api.coingecko.com/api/v3";
  const CC = "https://min-api.cryptocompare.com/data";
  const BN = "https://api.binance.com/api/v3";
  const SNAP = "data/";
  const CUR = () => (W.currency ? W.currency() : "usd");

  const PROXIES = [
    (u) => u,
    (u) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
    (u) => "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(u),
  ];

  async function getJSON(url, ttl = 60000, timeout = 6000) {
    try {
      const hit = sessionStorage.getItem("g:" + url);
      if (hit) {
        const h = JSON.parse(hit);
        if (Date.now() - h.t < ttl) return h.d;
      }
    } catch (e) {}
    let lastErr;
    for (const wrap of PROXIES) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeout);
      try {
        const r = await fetch(wrap(url), { signal: ctrl.signal });
        clearTimeout(t);
        if (!r.ok) throw new Error("HTTP " + r.status);
        const d = await r.json();
        try {
          sessionStorage.setItem(
            "g:" + url,
            JSON.stringify({ t: Date.now(), d }),
          );
        } catch (e) {}
        return d;
      } catch (e) {
        lastErr = e;
        clearTimeout(t);
      }
    }
    throw lastErr || new Error("unreachable");
  }

  const symMap = () => W.store.get("sym-map", {});
  function learn(p) {
    const m = symMap();
    (p || []).forEach((x) => (m[x[0]] = x[1]));
    try {
      W.store.set("sym-map", m);
    } catch (e) {}
  }
  const symOf = (id) => (symMap()[id] || id).toUpperCase();
  const down = {};
  const okP = (p) => !down[p] || Date.now() > down[p];
  const trip = (p) => {
    down[p] = Date.now() + 60000;
  };

  const PROVIDERS = {
    coingecko: {
      markets: (ids) =>
        getJSON(
          CG +
            "/coins/markets?vs_currency=" +
            CUR() +
            "&ids=" +
            ids.join(",") +
            "&price_change_percentage=24h,7d,30d",
          60000,
        ).then((d) => {
          learn(d.map((c) => [c.id, c.symbol]));
          return d;
        }),
      chart: (id, days) =>
        getJSON(
          CG +
            "/coins/" +
            id +
            "/market_chart?vs_currency=" +
            CUR() +
            "&days=" +
            days,
          300000,
        ).then((d) => d.prices),
      top: (n) =>
        getJSON(
          CG +
            "/coins/markets?vs_currency=" +
            CUR() +
            "&order=market_cap_desc&per_page=" +
            n +
            "&page=1&price_change_percentage=24h,7d,30d&sparkline=true",
          120000,
        ).then((d) => {
          learn(d.map((c) => [c.id, c.symbol]));
          return d;
        }),
    },
    // NOTE: the "cryptocompare" provider was removed — CryptoCompare's
    // min-api now requires a paid API key on every endpoint (including
    // pricemultifull/histoday), so it only ever returned 401 and wasted a
    // failover step. Kept CC constant above unused/harmless in case a
    // future keyed integration is added.
    binance: {
      markets: (ids) =>
        getJSON(
          BN +
            "/ticker/24hr?symbols=" +
            encodeURIComponent(
              "[" +
                ids
                  .map(symOf)
                  .map((s) => '"' + s + 'USDT"')
                  .join(",") +
                "]",
            ),
          60000,
        ).then((d) =>
          (Array.isArray(d) ? d : []).map((q) => ({
            id: (q.symbol || "").replace("USDT", "").toLowerCase(),
            symbol: (q.symbol || "").replace("USDT", "").toLowerCase(),
            name: (q.symbol || "").replace("USDT", ""),
            image: "",
            current_price: parseFloat(q.lastPrice),
            market_cap: null,
            total_volume: parseFloat(q.quoteVolume),
            price_change_percentage_24h_in_currency: parseFloat(
              q.priceChangePercent,
            ),
            price_change_percentage_7d_in_currency: null,
            price_change_percentage_30d_in_currency: null,
            sparkline_in_7d: null,
          })),
        ),
      chart: (id, days) =>
        getJSON(
          BN + "/klines?symbol=" + symOf(id) + "USDT&interval=1d&limit=" + days,
          300000,
        ).then((d) =>
          (Array.isArray(d) ? d : []).map((k) => [k[0], parseFloat(k[4])]),
        ),
    },
  };

  async function withFailover(kind, a, b) {
    const order = kind === "top" ? ["coingecko"] : ["coingecko", "binance"];
    let lastErr;
    for (const p of order) {
      if (!PROVIDERS[p][kind] || !okP(p)) continue;
      try {
        api.source = p;
        return await PROVIDERS[p][kind](a, b);
      } catch (e) {
        lastErr = e;
        trip(p);
      }
    }
    throw lastErr || new Error("all providers down");
  }

  const snap = (f) =>
    fetch(SNAP + f + "?t=" + Date.now(), { cache: "no-store" }).then((r) => {
      if (!r.ok) throw 0;
      return r.json();
    });
  const topCache = () => W.store.get("top-cache", []) || [];

  const api = {
    source: "coingecko",
    markets: (ids) =>
      withFailover("markets", ids).catch(() => {
        const rows = topCache().filter((c) => ids.includes(c.id));
        if (!rows.length) throw new Error("no data");
        api.source = "cache";
        return rows;
      }),
    top: (n) =>
      snap("top.json")
        .then((d) => {
          if (!Array.isArray(d) || !d.length) throw 0;
          learn(d.map((c) => [c.id, c.symbol]));
          try {
            W.store.set("top-cache", d);
          } catch (e) {}
          api.source = "github";
          return d.slice(0, n);
        })
        .catch(() => withFailover("top", n)),
    chart: (id, days) =>
      withFailover("chart", id, days).catch(() => {
        const c = topCache().find((x) => x.id === id);
        if (!c || !c.sparkline_in_7d) throw new Error("no chart data");
        const p = c.sparkline_in_7d.price,
          now = Date.now();
        api.source = "cache";
        return p.map((v, i) => [now - (p.length - 1 - i) * 36e5, v]);
      }),
    global: () =>
      snap("global.json")
        .then((d) => {
          api.source = "github";
          return d;
        })
        .catch(() => getJSON(CG + "/global", 300000)),
    fearGreed: () =>
      snap("fng.json")
        .then((d) => {
          api.source = "github";
          return d.data[0];
        })
        .catch(() =>
          getJSON("https://api.alternative.me/fng/?limit=1", 300000).then(
            (d) => d.data[0],
          ),
        ),
    search: (q) =>
      getJSON(CG + "/search?query=" + encodeURIComponent(q), 300000),
    coin: (id) =>
      getJSON(
        CG +
          "/coins/" +
          id +
          "?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false",
        120000,
      ),
    trending: () => getJSON(CG + "/search/trending", 300000),
  };
  return api;
})();
