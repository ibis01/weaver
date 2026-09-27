// scripts/fetch-market-data.js
// Aligned with live application provider architecture: CoinLore → CoinPaprika
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// Fetch top 100 coins (matches live app schema)
async function fetchTop() {
  // Primary: CoinLore (Free, no key, reliable)
  try {
    const data = await fetchJSON(
      "https://api.coinlore.net/api/tickers/?start=0&limit=100",
    );
    if (data && data.data) {
      return data.data.map((c) => ({
        id: c.id, // CoinLore uses numeric IDs; app handles mapping
        symbol: c.symbol.toLowerCase(),
        name: c.name,
        current_price: parseFloat(c.price_usd),
        market_cap: parseFloat(c.market_cap_usd),
        total_volume: parseFloat(c.volume_usd24h),
        price_change_percentage_24h_in_currency: parseFloat(
          c.percent_change_24h,
        ),
        price_change_percentage_7d_in_currency: parseFloat(c.percent_change_7d),
        price_change_percentage_30d_in_currency: parseFloat(
          c.percent_change_30d,
        ),
        market_cap_rank: parseInt(c.rank),
      }));
    }
  } catch (e) {
    console.warn("CoinLore failed:", e.message);
  }

  // Fallback: CoinPaprika
  try {
    const data = await fetchJSON(
      "https://api.coinpaprika.com/v1/tickers?limit=100&quotes=usd",
    );
    return data.map((c) => ({
      id: c.id,
      symbol: c.symbol.toLowerCase(),
      name: c.name,
      current_price: c.quotes.USD.price,
      market_cap: c.quotes.USD.market_cap,
      total_volume: c.quotes.USD.volume_24h,
      price_change_percentage_24h_in_currency: c.quotes.USD.percent_change_24h,
      price_change_percentage_7d_in_currency: c.quotes.USD.percent_change_7d,
      price_change_percentage_30d_in_currency: c.quotes.USD.percent_change_30d,
      market_cap_rank: c.rank,
    }));
  } catch (e) {
    console.warn("CoinPaprika failed:", e.message);
  }

  throw new Error("All top market data providers failed");
}

// Fetch global market stats
async function fetchGlobal() {
  // CoinPaprika provides robust global stats without auth
  try {
    const data = await fetchJSON("https://api.coinpaprika.com/v1/global");
    return {
      total_market_cap: data.market_cap_usd,
      total_volume: data.volume_24h_usd,
      bitcoin_dominance: data.bitcoin_dominance_percentage,
      active_cryptocurrencies: data.coins_count,
      markets: data.markets_count,
      timestamp: Date.now(),
    };
  } catch (e) {
    console.warn("CoinPaprika global failed:", e.message);
  }

  throw new Error("All global market data providers failed");
}

(async () => {
  try {
    console.log("Fetching top market data...");
    const top = await fetchTop();

    console.log("Fetching global market data...");
    const global = await fetchGlobal();

    fs.writeFileSync(
      path.join(DATA_DIR, "top.json"),
      JSON.stringify(top, null, 2),
    );
    fs.writeFileSync(
      path.join(DATA_DIR, "global.json"),
      JSON.stringify(global, null, 2),
    );

    console.log("✅ Market data snapshots updated successfully.");
  } catch (err) {
    console.error("❌ Failed to update market data:", err.message);
    process.exit(1);
  }
})();
