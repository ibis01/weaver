// ===============================================================
// Runtime API schemas and freshness metadata
// ===============================================================

window.W = window.W || {};

W.dataHealth = (() => {
  const resources = {};
  const DEFAULT_STALE_AFTER = 30 * 60 * 1000;

  function mark(
    resource,
    {
      source = "unknown",
      observedAt = Date.now(),
      staleAfter = DEFAULT_STALE_AFTER,
    } = {},
  ) {
    const timestamp =
      typeof observedAt === "number" ? observedAt : Date.parse(observedAt);
    resources[resource] = {
      resource,
      source,
      observedAt: Number.isFinite(timestamp) ? timestamp : Date.now(),
      staleAfter,
      updatedAt: Date.now(),
    };
    return resources[resource];
  }

  function get(resource) {
    const item = resources[resource];
    if (!item)
      return {
        resource,
        source: "unknown",
        state: "unknown",
        ageMs: null,
        observedAt: null,
      };
    const ageMs = Math.max(0, Date.now() - item.observedAt);
    return {
      ...item,
      ageMs,
      state: ageMs > item.staleAfter ? "stale" : "fresh",
    };
  }

  function all() {
    return Object.keys(resources).map(get);
  }
  function isStale(resource) {
    return get(resource).state === "stale";
  }
  return { mark, get, all, isStale };
})();

W.schemas = (() => {
  class SchemaValidationError extends Error {
    constructor(name, message) {
      super(`${name}: ${message}`);
      this.name = "SchemaValidationError";
      this.schema = name;
    }
  }

  const isObject = (v) =>
    v !== null && typeof v === "object" && !Array.isArray(v);
  const isFiniteNumber = (v) => typeof v === "number" && Number.isFinite(v);
  const optionalNumber = (v) =>
    v === null || v === undefined || isFiniteNumber(v);
  const requiredString = (v) => typeof v === "string" && v.length > 0;

  function assert(name, condition, message) {
    if (!condition) throw new SchemaValidationError(name, message);
  }

  function marketCoin(value, name = "market coin") {
    assert(name, isObject(value), "expected an object");
    assert(name, requiredString(value.id), "id must be a non-empty string");
    assert(
      name,
      requiredString(value.symbol),
      "symbol must be a non-empty string",
    );
    assert(
      name,
      isFiniteNumber(value.current_price),
      "current_price must be a finite number",
    );
    assert(
      name,
      optionalNumber(value.market_cap),
      "market_cap must be numeric or null",
    );
    return value;
  }

  function markets(value) {
    assert(
      "CoinGecko markets",
      Array.isArray(value) && value.length > 0,
      "expected a non-empty array",
    );
    value.forEach((coin, index) =>
      marketCoin(coin, `CoinGecko markets[${index}]`),
    );
    return value;
  }

  function global(value) {
    assert(
      "CoinGecko global",
      isObject(value) && isObject(value.data),
      "data must be an object",
    );
    const data = value.data;
    assert(
      "CoinGecko global",
      isObject(data.total_market_cap),
      "total_market_cap is required",
    );
    assert(
      "CoinGecko global",
      optionalNumber(data.market_cap_change_percentage_24h_usd),
      "market cap change must be numeric",
    );
    return value;
  }

  function fearGreed(value) {
    assert(
      "Fear and Greed",
      isObject(value) && Array.isArray(value.data) && value.data.length > 0,
      "data must be a non-empty array",
    );
    const item = value.data[0];
    assert(
      "Fear and Greed",
      requiredString(String(item.value ?? "")),
      "value is required",
    );
    assert(
      "Fear and Greed",
      requiredString(item.value_classification),
      "value_classification is required",
    );
    return value;
  }

  function search(value) {
    assert(
      "CoinGecko search",
      isObject(value) && Array.isArray(value.coins),
      "coins must be an array",
    );
    value.coins.forEach((coin, index) => {
      assert(
        "CoinGecko search",
        isObject(coin) && requiredString(coin.id),
        `coins[${index}].id is required`,
      );
    });
    return value;
  }

  function coin(value) {
    assert(
      "CoinGecko coin",
      isObject(value) && requiredString(value.id),
      "id is required",
    );
    assert(
      "CoinGecko coin",
      requiredString(value.symbol),
      "symbol is required",
    );
    assert(
      "CoinGecko coin",
      isObject(value.market_data),
      "market_data is required",
    );
    return value;
  }

  function chart(value) {
    assert(
      "CoinGecko chart",
      isObject(value) && Array.isArray(value.prices),
      "prices must be an array",
    );
    value.prices.forEach((point, index) => {
      assert(
        "CoinGecko chart",
        Array.isArray(point) &&
          point.length >= 2 &&
          isFiniteNumber(point[0]) &&
          isFiniteNumber(point[1]),
        `prices[${index}] must be [timestamp, price]`,
      );
    });
    return value;
  }

  function trending(value) {
    assert(
      "CoinGecko trending",
      isObject(value) && Array.isArray(value.coins),
      "coins must be an array",
    );
    return value;
  }

  function binanceTickers(value) {
    assert(
      "Binance tickers",
      Array.isArray(value) && value.length > 0,
      "expected a non-empty array",
    );
    value.forEach((item, index) => {
      assert(
        "Binance tickers",
        isObject(item) && requiredString(item.symbol),
        `tickers[${index}].symbol is required`,
      );
      assert(
        "Binance tickers",
        requiredString(item.lastPrice) &&
          Number.isFinite(Number(item.lastPrice)),
        `tickers[${index}].lastPrice must be numeric`,
      );
    });
    return value;
  }

  function binanceKlines(value) {
    assert("Binance klines", Array.isArray(value), "expected an array");
    value.forEach((item, index) =>
      assert(
        "Binance klines",
        Array.isArray(item) &&
          item.length >= 5 &&
          Number.isFinite(Number(item[0])) &&
          Number.isFinite(Number(item[4])),
        `klines[${index}] is invalid`,
      ),
    );
    return value;
  }

  function goplus(value) {
    assert(
      "GoPlus security",
      isObject(value) && Number(value.code) === 1,
      "successful response code is required",
    );
    assert(
      "GoPlus security",
      isObject(value.result),
      "result must be an object",
    );
    return value;
  }

  function blockscoutCollection(value) {
    assert(
      "Blockscout collection",
      isObject(value) && Array.isArray(value.items),
      "items must be an array",
    );
    return value;
  }

  function blockscoutToken(value) {
    assert("Blockscout token", isObject(value), "expected an object");
    return value;
  }

  function jsonRpc(value) {
    assert(
      "JSON-RPC",
      isObject(value) && value.jsonrpc === "2.0",
      "jsonrpc 2.0 response is required",
    );
    assert(
      "JSON-RPC",
      value.error === undefined || isObject(value.error),
      "error must be an object when present",
    );
    assert(
      "JSON-RPC",
      value.result !== undefined || value.error !== undefined,
      "result or error is required",
    );
    return value;
  }

  function bitcoinAddress(value) {
    assert(
      "Bitcoin address",
      isObject(value) && isObject(value.chain_stats),
      "chain_stats is required",
    );
    assert(
      "Bitcoin address",
      Number.isFinite(Number(value.chain_stats.funded_txo_sum)) &&
        Number.isFinite(Number(value.chain_stats.spent_txo_sum)),
      "chain stats must be numeric",
    );
    return value;
  }

  function telegram(value) {
    assert(
      "Telegram API",
      isObject(value) && value.ok === true,
      "successful Telegram response is required",
    );
    return value;
  }

  function llm(value) {
    assert("LLM response", isObject(value), "expected an object");
    assert(
      "LLM response",
      Array.isArray(value.choices) ||
        Array.isArray(value.content) ||
        typeof value.text === "string",
      "no supported completion payload found",
    );
    return value;
  }

  function dexPairs(value) {
    assert(
      "DEX Screener",
      isObject(value) && Array.isArray(value.pairs),
      "pairs must be an array",
    );
    return value;
  }

  function categories(value) {
    assert("CoinGecko categories", Array.isArray(value), "expected an array");
    value.forEach((item, index) =>
      assert(
        "CoinGecko categories",
        isObject(item) && requiredString(item.id),
        `categories[${index}].id is required`,
      ),
    );
    return value;
  }

  function bscscan(value) {
    assert(
      "BscScan",
      isObject(value) &&
        requiredString(String(value.status ?? "")) &&
        value.result !== undefined,
      "status and result are required",
    );
    return value;
  }

  function newsSnapshot(value) {
    assert("News snapshot", Array.isArray(value), "expected an array");
    value.forEach((item, index) =>
      assert(
        "News snapshot",
        isObject(item) &&
          requiredString(item.title) &&
          requiredString(item.link),
        `items[${index}] is invalid`,
      ),
    );
    return value;
  }

  function validate(name, value) {
    const validators = {
      markets,
      global,
      fearGreed,
      search,
      coin,
      chart,
      trending,
      binanceTickers,
      binanceKlines,
      goplus,
      blockscoutCollection,
      blockscoutToken,
      jsonRpc,
      bitcoinAddress,
      telegram,
      llm,
      dexPairs,
      categories,
      bscscan,
      newsSnapshot,
    };
    assert("Schema", validators[name], `unknown schema ${name}`);
    return validators[name](value);
  }

  return {
    SchemaValidationError,
    validate,
    markets,
    global,
    fearGreed,
    search,
    coin,
    chart,
    trending,
    binanceTickers,
    binanceKlines,
    goplus,
    blockscoutCollection,
    blockscoutToken,
    jsonRpc,
    bitcoinAddress,
    telegram,
    llm,
    dexPairs,
    categories,
    bscscan,
    newsSnapshot,
  };
})();

console.log("[Schemas] Runtime API schemas and freshness tracking loaded.");
