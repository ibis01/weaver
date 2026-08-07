window.W = window.W || {};

W.api = (() => {
  const CG = "https://api.coingecko.com/api/v3";
  const cache = new Map();

  async function get(url, ttl = 60000) {
    const hit = cache.get(url);
    if (hit && Date.now() - hit.t < ttl) return hit.d;
    const res = await fetch(url);
    if (res.status === 429)
      throw new Error(
        "Rate limited by CoinGecko — wait a few seconds and refresh.",
      );
    if (!res.ok) throw new Error("API error " + res.status);
    const data = await res.json();
    cache.set(url, { d: data, t: Date.now() });
    return data;
  }
  const vs = () => W.currency();

  return {
    markets(ids) {
      return get(
        `${CG}/coins/markets?vs_currency=${vs()}&ids=${ids}&order=market_cap_desc&price_change_percentage=24h,7d,30d`,
        60000,
      );
    },
    top(per = 100) {
      return get(
        `${CG}/coins/markets?vs_currency=${vs()}&order=market_cap_desc&per_page=${per}&page=1&price_change_percentage=24h,7d,30d`,
        120000,
      );
    },
    search(q) {
      return get(`${CG}/search?query=${encodeURIComponent(q)}`, 300000);
    },
    coin(id) {
      return get(
        `${CG}/coins/${id}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false`,
        120000,
      );
    },
    chart(id, days) {
      return get(
        `${CG}/coins/${id}/market_chart?vs_currency=${vs()}&days=${days}`,
        300000,
      );
    },
    global() {
      return get(`${CG}/global`, 300000);
    },
    trending() {
      return get(`${CG}/search/trending`, 300000);
    },
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
