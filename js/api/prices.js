window.W = window.W || {};

W.api = (() => {
  const CG = "https://api.coingecko.com/api/v3";
  const CC = "https://api.coincap.io/v2";
  const BN = "https://api.binance.com/api/v3";
  const CP = "https://min-api.cryptocompare.com/data";

  const cache = new Map();
  const DOWN = {};
  const vs = () => W.currency();

  const PROXIES = [
    (u) => u,
    (u) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
    (u) => "https://corsproxy.io/?url=" + encodeURIComponent(u),
    (u) => "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(u),
  ];
  let good = 0;

  async function getJSON(url, ttl, timeout) {
    ttl = ttl || 60000;
    timeout = timeout || 9000;
    const hit = cache.get(url);
    if (hit && Date.now() - hit.t < ttl) return hit.d;
    let lastErr;
    for (let i = 0; i < PROXIES.length; i++) {
      const idx = (good + i) % PROXIES.length;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeout);
      try {
        const res = await fetch(PROXIES[idx](url), { signal: ctrl.signal });
        if (res.status === 429) throw new Error("429");
        if (!res.ok) throw new Error("HTTP " + res.status);
        const d = JSON.parse(await res.text());
        good = idx;
        cache.set(url, { d: d, t: Date.now() });
        return d;
      } catch (e) {
        lastErr = e;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastErr || new Error("unreachable");
  }

  const TOP40 = {
    bitcoin: "btc",
    ethereum: "eth",
    tether: "usdt",
    "usd-coin": "usdc",
    binancecoin: "bnb",
    solana: "sol",
    ripple: "xrp",
    cardano: "ada",
    dogecoin: "doge",
    tron: "trx",
    polkadot: "dot",
    chainlink: "link",
    litecoin: "ltc",
    "shiba-inu": "shib",
    "avalanche-2": "avax",
    stellar: "xlm",
    uniswap: "uni",
    monero: "xmr",
    "bitcoin-cash": "bch",
    aptos: "apt",
    sui: "sui",
    near: "near",
    cosmos: "atom",
    filecoin: "fil",
    hedera: "hbar",
    "internet-computer": "icp",
    vechain: "vet",
    arbitrum: "arb",
    "optimistic-ethereum": "op",
    thegraph: "grt",
    aave: "aave",
    maker: "mkr",
    algorand: "algo",
    "ethereum-classic": "etc",
    "polygon-ecosystem-token": "pol",
    "jupiter-exchange-solana": "jup",
    pepe: "pepe",
    celestia: "tia",
    starknet: "strk",
  };

  const symOf = (id) =>
    ((W.store.get("symmap", {}) || {})[id] || TOP40[id] || "").toLowerCase();
  const learn = (pairs) => {
    const m = W.store.get("symmap", {}) || {};
    let ch = false;
    pairs.forEach((p) => {
      if (p[0] && p[1] && m[p[0]] !== p[1].toLowerCase()) {
        m[p[0]] = p[1].toLowerCase();
        ch = true;
      }
    });
    if (ch) W.store.set("symmap", m);
  };
  const img = (s) =>
    "https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/32/color/" +
    String(s).toLowerCase() +
    ".png";

  const ccNorm = (a) => ({
    id: a.id,
    symbol: a.symbol.toLowerCase(),
    name: a.name,
    image:
      "https://assets.coincap.io/assets/icons/" +
      a.symbol.toLowerCase() +
      "@2x.png",
    current_price: +a.priceUsd,
    market_cap: +a.marketCapUsd,
    total_volume: +a.volumeUsd24Hr,
    market_cap_rank: +a.rank,
    price_change_percentage_24h_in_currency: +a.changePercent24Hr,
    price_change_percentage_7d_in_currency: null,
  });

  const PROV = {
    coingecko: {
      markets: (coins) =>
        getJSON(
          CG +
            "/coins/markets?vs_currency=" +
            vs() +
            "&ids=" +
            coins.map((c) => c.id).join(",") +
            "&order=market_cap_desc&price_change_percentage=24h,7d,30d&sparkline=true",
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
            vs() +
            "&days=" +
            days,
          300000,
        ).then((d) => d.prices),
      top: (n) =>
        getJSON(
          CG +
            "/coins/markets?vs_currency=" +
            vs() +
            "&order=market_cap_desc&per_page=" +
            n +
            "&page=1&price_change_percentage=24h,7d,30d&sparkline=true",
          120000,
        ).then((d) => {
          learn(d.map((c) => [c.id, c.symbol]));
          return d;
        }),
    },
    coincap: {
      markets: (coins) =>
        getJSON(CC + "/assets?ids=" + coins.map((c) => c.id).join(",")).then(
          (d) => {
            learn(d.data.map((a) => [a.id, a.symbol]));
            return d.data.map(ccNorm);
          },
        ),
      chart: (id, days) =>
        getJSON(
          CC +
            "/assets/" +
            id +
            "/history?interval=d1&start=" +
            (Date.now() - days * 864e5) +
            "&end=" +
            Date.now(),
          300000,
        ).then((d) => d.data.map((h) => [h.time, +h.priceUsd])),
      top: (n) =>
        getJSON(CC + "/assets?limit=" + n, 120000).then((d) => {
          learn(d.data.map((a) => [a.id, a.symbol]));
          return d.data.map(ccNorm);
        }),
    },
    cryptocompare: {
      markets: async (coins) => {
        const syms = coins
          .map((c) => (c.symbol || symOf(c.id)).toUpperCase())
          .filter(Boolean);
        if (!syms.length) throw new Error("no symbols");
        const d = await getJSON(
          CP + "/pricemultifull?fsyms=" + syms.join(",") + "&tsyms=USD",
        );
        return coins
          .map((c, i) => {
            const q = d.RAW && d.RAW[syms[i]] && d.RAW[syms[i]].USD;
            if (!q) return null;
            return {
              id: c.id,
              symbol: syms[i].toLowerCase(),
              name: syms[i],
              image: q.IMAGEURL
                ? "https://www.cryptocompare.com" + q.IMAGEURL
                : img(syms[i]),
              current_price: q.PRICE,
              market_cap: q.MKTCAP,
              total_volume: q.TOTALVOLUME,
              market_cap_rank: null,
              price_change_percentage_24h_in_currency: q.CHANGEPCT24HOUR,
              price_change_percentage_7d_in_currency: null,
            };
          })
          .filter(Boolean);
      },
      chart: (id, days) => {
        const s = symOf(id).toUpperCase();
        if (!s) throw new Error("no symbol");
        return getJSON(
          CP +
            "/v2/histoday?fsym=" +
            s +
            "&tsym=USD&limit=" +
            Math.min(days, 1000),
          300000,
        ).then((d) => d.Data.Data.map((k) => [k.time * 1000, k.close]));
      },
    },
    binance: {
      markets: async (coins) => {
        const syms = coins
          .map((c) => (c.symbol || symOf(c.id)).toUpperCase())
          .filter(Boolean);
        if (!syms.length) throw new Error("no symbols");
        const d = await getJSON(
          BN +
            "/ticker/24hr?symbols=" +
            encodeURIComponent(JSON.stringify(syms.map((s) => s + "USDT"))),
        );
        return d.map((t, i) => ({
          id: coins[i].id,
          symbol: syms[i].toLowerCase(),
          name: syms[i].toUpperCase(),
          image: img(syms[i]),
          current_price: +t.lastPrice,
          market_cap: null,
          total_volume: +t.quoteVolume,
          market_cap_rank: null,
          price_change_percentage_24h_in_currency: +t.priceChangePercent,
          price_change_percentage_7d_in_currency: null,
        }));
      },
      chart: (id, days) => {
        const s = symOf(id).toUpperCase();
        if (!s) throw new Error("no symbol");
        return getJSON(
          BN +
            "/klines?symbol=" +
            s +
            "USDT&interval=1d&limit=" +
            Math.min(days, 1000),
          300000,
        ).then((d) => d.map((k) => [k[0], +k[4]]));
      },
    },
  };

  const ORDER = {
    markets: ["coingecko", "coincap", "cryptocompare", "binance"],
    chart: ["coingecko", "coincap", "cryptocompare", "binance"],
    top: ["coingecko", "coincap"],
  };

  async function withFailover(method) {
    const args = Array.prototype.slice.call(arguments, 1);
    let lastErr;
    for (const name of ORDER[method]) {
      if (DOWN[name] && Date.now() < DOWN[name]) continue;
      try {
        const out = await PROV[name][method].apply(null, args);
        W.api.source = name;
        DOWN[name] = 0;
        return out;
      } catch (e) {
        lastErr = e;
        DOWN[name] = Date.now() + 60000;
      }
    }
    throw lastErr || new Error("All sources failed");
  }

  const cached = (key, promise) =>
    promise
      .then((d) => {
        W.store.set(key, d);
        return d;
      })
      .catch((e) => {
        const c = W.store.get(key);
        if (c && (Array.isArray(c) ? c.length : true)) {
          W.api.source = "cache";
          return c;
        }
        throw e;
      });

  return {
    source: "coingecko",
    markets: (ids) =>
      cached(
        "mkt:" + ids,
        withFailover(
          "markets",
          ids
            .split(",")
            .map((id) => ({ id: id.trim(), symbol: symOf(id.trim()) })),
        ),
      ),
    chart: (id, days) =>
      cached("chart:" + id + ":" + days, withFailover("chart", id, days)),
    top: (n) => cached("top:" + n, withFailover("top", n)),
    search: (q) =>
      getJSON(CG + "/search?query=" + encodeURIComponent(q), 300000),
    coin: (id) =>
      cached(
        "coin:" + id,
        getJSON(
          CG +
            "/coins/" +
            id +
            "?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false",
          120000,
        ),
      ),
    global: () => cached("global", getJSON(CG + "/global", 300000)),
    trending: () =>
      cached("trending", getJSON(CG + "/search/trending", 300000)),
    fearGreed: () =>
      getJSON("https://api.alternative.me/fng/?limit=1", 300000).then(
        (d) => d.data[0],
      ),
    news: () =>
      getJSON(
        "https://min-api.cryptocompare.com/data/v2/news/?lang=EN",
        300000,
      ).then((d) => d.Data || []),
  };
})();
