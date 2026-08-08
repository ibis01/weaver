window.W = window.W || {};

/* ═══ Multi-source market data: CoinGecko → CoinCap → CryptoCompare → Binance ═══ */
W.api = (() => {
  const CG = "https://api.coingecko.com/api/v3";
  const CC = "https://api.coincap.io/v2";
  const BN = "https://api.binance.com/api/v3";
  const CP = "https://min-api.cryptocompare.com/data";

  const cache = new Map();
  const DOWN = {}; // provider → cooldown-until timestamp
  const vs = () => W.currency();

  /* built-in id→symbol map so fallbacks work even on first run */
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
    (W.store.get("symmap", {})[id] || TOP40[id] || "").toLowerCase();
  const learn = (pairs) => {
    const m = W.store.get("symmap", {});
    let ch = false;
    pairs.forEach(([id, s]) => {
      if (id && s && m[id] !== s.toLowerCase()) {
        m[id] = s.toLowerCase();
        ch = true;
      }
    });
    if (ch) W.store.set("symmap", m);
  };
  const img = (s) =>
    `https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/32/color/${String(s).toLowerCase()}.png`;

  async function getJSON(url, ttl = 60000, timeout = 12000) {
    const hit = cache.get(url);
    if (hit && Date.now() - hit.t < ttl) return hit.d;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (res.status === 429) throw new Error("429 rate limit");
      if (!res.ok) throw new Error("HTTP " + res.status);
      const d = await res.json();
      cache.set(url, { d, t: Date.now() });
      return d;
    } finally {
      clearTimeout(t);
    }
  }

  /* ── Provider 1: CoinGecko (richest) ── */
  const cgNorm = (c) => c;
  const coingecko = {
    markets: async (coins) => {
      const d = await getJSON(
        `${CG}/coins/markets?vs_currency=${vs()}&ids=${coins.map((c) => c.id).join(",")}&order=market_cap_desc&price_change_percentage=24h,7d,30d`,
        60000,
      );
      learn(d.map((c) => [c.id, c.symbol]));
      return d.map(cgNorm);
    },
    chart: (id, days) =>
      getJSON(
        `${CG}/coins/${id}/market_chart?vs_currency=${vs()}&days=${days}`,
        300000,
      ).then((d) => d.prices),
    top: (n) =>
      getJSON(
        `${CG}/coins/markets?vs_currency=${vs()}&order=market_cap_desc&per_page=${n}&page=1&price_change_percentage=24h,7d,30d`,
        120000,
      ).then((d) => {
        learn(d.map((c) => [c.id, c.symbol]));
        return d;
      }),
  };

  /* ── Provider 2: CoinCap ── */
  const ccNorm = (a) => ({
    id: a.id,
    symbol: a.symbol.toLowerCase(),
    name: a.name,
    image: `https://assets.coincap.io/assets/icons/${a.symbol.toLowerCase()}@2x.png`,
    current_price: +a.priceUsd,
    market_cap: +a.marketCapUsd,
    total_volume: +a.volumeUsd24Hr,
    market_cap_rank: +a.rank,
    price_change_percentage_24h_in_currency: +a.changePercent24Hr,
    price_change_percentage_7d_in_currency: null,
  });
  const coincap = {
    markets: (coins) =>
      getJSON(
        `${CC}/assets?ids=${coins.map((c) => c.id).join(",")}`,
        60000,
      ).then((d) => {
        learn(d.data.map((a) => [a.id, a.symbol]));
        return d.data.map(ccNorm);
      }),
    chart: (id, days) =>
      getJSON(
        `${CC}/assets/${id}/history?interval=d1&start=${Date.now() - days * 864e5}&end=${Date.now()}`,
        300000,
      ).then((d) => d.data.map((h) => [h.time, +h.priceUsd])),
    top: (n) =>
      getJSON(`${CC}/assets?limit=${n}`, 120000).then((d) => {
        learn(d.data.map((a) => [a.id, a.symbol]));
        return d.data.map(ccNorm);
      }),
  };

  /* ── Provider 3: CryptoCompare ── */
  const cryptocompare = {
    markets: async (coins) => {
      const syms = coins
        .map((c) => (c.symbol || symOf(c.id)).toUpperCase())
        .filter(Boolean);
      const d = await getJSON(
        `${CP}/pricemultifull?fsyms=${syms.join(",")}&tsyms=USD`,
        60000,
      );
      return coins
        .map((c, i) => {
          const q = d.RAW?.[syms[i]]?.USD;
          if (!q) return null;
          return {
            id: c.id,
            symbol: syms[i].toLowerCase(),
            name: d.DISPLAY?.[syms[i]]?.USD?.FROMNAME || syms[i],
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
        `${CP}/v2/histoday?fsym=${s}&tsym=USD&limit=${Math.min(days, 1000)}`,
        300000,
      ).then((d) => d.Data.Data.map((k) => [k.time * 1000, k.close]));
    },
  };

  /* ── Provider 4: Binance ── */
  const binance = {
    markets: async (coins) => {
      const syms = coins
        .map((c) => (c.symbol || symOf(c.id)).toUpperCase())
        .filter(Boolean);
      const d = await getJSON(
        `${BN}/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(syms.map((s) => s + "USDT")))}`,
        60000,
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
        `${BN}/klines?symbol=${s}USDT&interval=1d&limit=${Math.min(days, 1000)}`,
        300000,
      ).then((d) => d.map((k) => [k[0], +k[4]]));
    },
  };

  /* ── Failover engine ── */
  const ORDER = {
    markets: ["coingecko", "coincap", "cryptocompare", "binance"],
    chart: ["coingecko", "coincap", "cryptocompare", "binance"],
    top: ["coingecko", "coincap"],
  };
  const PROV = { coingecko, coincap, cryptocompare, binance };

  async function withFailover(method, ...args) {
    let lastErr;
    for (const name of ORDER[method]) {
      if (DOWN[name] && Date.now() < DOWN[name]) continue;
      try {
        const out = await PROV[name][method](...args);
        W.api.source = name; // shown in topbar
        DOWN[name] = 0;
        return out;
      } catch (e) {
        lastErr = e;
        DOWN[name] = Date.now() + 60000;
        console.warn(
          `[Weaver] ${name} ${method} failed → trying next (${e.message})`,
        );
      }
    }
    W.api.source = "offline";
    throw lastErr || new Error("All 4 data sources failed");
  }

  return {
    source: "coingecko",
    markets: (ids) =>
      withFailover(
        "markets",
        ids
          .split(",")
          .map((id) => ({ id: id.trim(), symbol: symOf(id.trim()) })),
      ),
    chart: (id, days) => withFailover("chart", id, days),
    top: (n) => withFailover("top", n),
    search: (q) =>
      getJSON(`${CG}/search?query=${encodeURIComponent(q)}`, 300000),
    coin: (id) =>
      getJSON(
        `${CG}/coins/${id}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false`,
        120000,
      ),
    global: () => getJSON(`${CG}/global`, 300000),
    trending: () => getJSON(`${CG}/search/trending`, 300000),
    async fearGreed() {
      const d = await fetch("https://api.alternative.me/fng/?limit=1").then(
        (r) => r.json(),
      );
      return d.data[0];
    },
    async news() {
      const d = await fetch(
        "https://min-api.cryptocompare.com/data/v2/news/?lang=EN",
      ).then((r) => r.json());
      return d.Data || [];
    },
  };
})();
