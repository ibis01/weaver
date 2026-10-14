// Historical meme-validation evidence loader.
// This is deliberately additive: it never turns historical buyers into a live score.
window.W = window.W || {};
W.memeEvidence = (() => {
  const MANIFEST_URL = "data/meme-validation.json";
  const cache = new Map();
  let manifestPromise = null;
  let enabled = false;

  function normalizeAddress(value) {
    return typeof value === "string" ? value.toLowerCase() : "";
  }

  async function load() {
    if (!manifestPromise) {
      manifestPromise = fetch(`${MANIFEST_URL}?v=1`, { cache: "no-store" })
        .then((response) => {
          if (!response.ok) throw new Error(`meme validation manifest HTTP ${response.status}`);
          return response.json();
        })
        .then((manifest) => {
          if (!manifest || manifest.schemaVersion !== "meme-validation-manifest-v1" || !Array.isArray(manifest.historicalCohorts)) {
            throw new Error("invalid meme validation manifest");
          }
          return manifest;
        })
        .catch((error) => {
          manifestPromise = null;
          throw error;
        });
    }
    return manifestPromise;
  }

  async function forPair(pair) {
    if (!enabled) return null;
    const chain = String(pair?.chainId || pair?.chain || "").toLowerCase();
    const tokenAddress = normalizeAddress(pair?.baseToken?.address || pair?.tokenAddress);
    const key = `${chain}:${tokenAddress}`;
    if (cache.has(key)) return cache.get(key);
    let result = null;
    try {
      const manifest = await load();
      const cohort = manifest.historicalCohorts.find((item) =>
        String(item.chain).toLowerCase() === chain &&
        normalizeAddress(item.tokenAddress) === tokenAddress &&
        item.complete === true,
      );
      if (cohort) {
        result = {
          ...cohort,
          manifestStatus: manifest.status,
          manifestGeneratedAt: manifest.generatedAt,
          historicalOnly: true,
        };
      }
    } catch (error) {
      console.warn("[MemeEvidence] Manifest unavailable:", error.message);
    }
    cache.set(key, result);
    return result;
  }

  return Object.freeze({
    load,
    forPair,
    enable: () => { enabled = true; },
    isEnabled: () => enabled,
  });
})();
