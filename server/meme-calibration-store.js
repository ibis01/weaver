const { createClient } = require("redis");

const PREFIX = "weaver:meme:calibration:v1:";
const SUMMARY_KEY = `${PREFIX}summary`;
const RETENTION_SECONDS = 90 * 24 * 60 * 60;

function createMemeCalibrationStore(options = {}) {
  const url = options.url || process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is required for calibration storage");
  const client = options.client || createClient({ url });
  let connected = false;

  async function connect() {
    if (!connected) {
      if (!client.isOpen) await client.connect();
      connected = true;
    }
    return client;
  }

  function resultKey(chain, address, observedAtMs) {
    return `${PREFIX}result:${observedAtMs}:${chain.toLowerCase()}:${address}`;
  }

  async function writeResult(alert, evaluation) {
    await connect();
    const identity = alert.assessment.identity;
    const chain = identity.chain.toLowerCase();
    const address = identity.tokenAddress;
    const observedAtMs = alert.assessment.observedAtMs;

    const key = resultKey(chain, address, observedAtMs);
    const payload = JSON.stringify({
      schemaVersion: "meme-calibration-result-v1",
      chain,
      address,
      observedAtMs,
      symbol: alert.symbol || null,
      pairAddress: alert.pairAddress || null,
      alertPriceUsd: alert.market?.priceUsd ?? null,
      alertLiquidityUsd: alert.market?.liquidityUsd ?? null,
      category: alert.assessment?.category || null,
      confidence: alert.assessment?.confidence ?? null,
      opportunityScore: alert.assessment?.scores?.opportunity ?? null,
      evaluation,
      evaluatedAt: new Date().toISOString(),
    });
    await client.set(key, payload, { EX: RETENTION_SECONDS });
    return key;
  }

  async function readResult(chain, address, observedAtMs) {
    await connect();
    const key = resultKey(chain, address, observedAtMs);
    const raw = await client.get(key);
    return raw ? JSON.parse(raw) : null;
  }

  async function writeSummary(summary) {
    await connect();
    const payload = JSON.stringify({
      schemaVersion: "meme-calibration-summary-v1",
      ...summary,
      updatedAt: new Date().toISOString(),
    });
    await client.set(SUMMARY_KEY, payload, { EX: RETENTION_SECONDS });
    return SUMMARY_KEY;
  }

  async function readSummary() {
    await connect();
    const raw = await client.get(SUMMARY_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  /**
   * Returns the most recent N evaluation results, sorted by
   * observedAtMs descending. Uses KEYS, which is acceptable here
   * because result keys are bounded (90-day TTL, low alert volume).
   * If volume grows, switch to a sorted set index.
   */
  async function listResults({ limit = 100 } = {}) {
    await connect();
    const keys = await client.keys(`${PREFIX}result:*`);
    if (!keys.length) return [];
    keys.sort();
    const slice = keys.slice(-limit);
    const values = await Promise.all(slice.map((k) => client.get(k)));
    return values
      .filter(Boolean)
      .map((v) => JSON.parse(v))
      .reverse();
  }

  async function close() {
    if (client.isOpen) await client.quit();
    connected = false;
  }

  return {
    connect,
    writeResult,
    readResult,
    writeSummary,
    readSummary,
    listResults,
    close,
    health: async () => {
      await connect();
      return {
        ok: (await client.ping()) === "PONG",
        retentionSeconds: RETENTION_SECONDS,
      };
    },
  };
}

module.exports = {
  createMemeCalibrationStore,
  RETENTION_SECONDS,
  PREFIX,
  SUMMARY_KEY,
};
