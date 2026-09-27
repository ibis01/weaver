//   Gem Agent: Token Hunter

window.W = window.W || {};

W.gems = (() => {
  // ── Constants ─────────────────────────────────────────
  const DEXSCREENER_API = "https://api.dexscreener.com";
  const PROXIES = [(u) => u];

  // Chains with a working Token Shield verification path.
  // Constitution §3.3: DISCOVERABLE_CHAINS ⊆ VERIFIED_CHAINS.
  const CHAINS = Object.freeze({
    solana: "🟣",
    ethereum: "🔷",
    base: "🔵",
    bsc: "🟡",
    arbitrum: "🔺",
    polygon: "🟪",
    avalanche: "❄️",
  });

  const SCORE_VERSION = "gem-v1";

  // Per-scan bounds on fresh Shield requests.
  const MAX_FRESH_SHIELD_PER_SCAN = 12;
  const SHIELD_CONCURRENCY = 4;

  // Per-scan bounds on fresh deployer requests.
  const MAX_FRESH_DEPLOYER_PER_SCAN = 6;
  const DEPLOYER_CONCURRENCY = 3;

  // Gem-local Shield cache TTL. Must match shield.js's own W.store TTL
  // so the two caches expire in step. A Shield assessment older than
  // this is deleted on read and re-fetched on the next scan.
  const SHIELD_CACHE_TTL = 300000; // 5 minutes

  // Response size cap on DEX Screener fetches. A well-behaved response
  // is under 500 KB; anything larger is treated as hostile or corrupt.
  const MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2 MB

  // Network timeout per fetch. Long enough for slow mobile, short
  // enough that a hanging request does not stall the scan.
  const FETCH_TIMEOUT_MS = 9000;

  // ── Escaping ──────────────────────────────────────────
  // String-based, escapes & < > " ' so the result is safe in both
  // text and double- or single-quoted attribute contexts. The prior
  // div.textContent → div.innerHTML trick did NOT escape quotes,
  // which made every data-addr="${...}" / href="${...}" an
  // attribute-breakout XSS vector for any upstream value containing
  // a double quote. Fast-path for strings avoids the DOM element
  // allocation per call (was called hundreds of times per scan).
  function esc(v) {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (!/[&<>"']/.test(s)) return s; // fast path
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // ── Safe external URL ─────────────────────────────────
  // Only returns a string that is a parseable https: URL. Anything
  // else — javascript:, data:, vbscript:, malformed — returns null.
  // Callers must fall back to a safe default when this returns null.
  function safeExternalUrl(u) {
    if (typeof u !== "string" || !u) return null;
    try {
      const parsed = new URL(u);
      if (parsed.protocol !== "https:") return null;
      return parsed.toString();
    } catch {
      return null;
    }
  }

  // ── Prototype-safe map factory ────────────────────────
  // Object.create(null) has no prototype chain, so a key of
  // "__proto__" or "constructor" is a plain string key rather than
  // a prototype mutation. Used for every internal cache.
  function newMap() {
    return Object.create(null);
  }

  // ── Chain / format helpers ────────────────────────────
  function chainTag(chain) {
    const emoji = CHAINS[chain] || "⛓️";
    return `<span class="tag rank">${emoji} ${esc(chain)}</span>`;
  }

  function kfmt(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return "0";
    const abs = Math.abs(v);
    if (abs >= 1e9) return (v / 1e9).toFixed(1) + "B";
    if (abs >= 1e6) return (v / 1e6).toFixed(1) + "M";
    if (abs >= 1e3) return (v / 1e3).toFixed(1) + "K";
    return v.toFixed(0);
  }

  function ageText(hours) {
    const h = Number(hours);
    if (!Number.isFinite(h) || h < 0) return "—";
    if (h < 1) return "<1h";
    if (h < 48) return Math.round(h) + "h";
    return Math.round(h / 24) + "d";
  }

  function pctBucket(n) {
    const v = Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
    return Math.round(v / 10) * 10;
  }

  // ── Shield cache key (chain-aware) ────────────────────
  // EVM addresses are case-insensitive hex; Solana addresses are
  // case-sensitive base58. Prefix with the chain key so the same
  // 0x... address on Ethereum and Base cannot collide.
  function shieldCacheKey(address, chainKey) {
    if (typeof address !== "string" || !address.trim()) return null;
    if (typeof chainKey !== "string" || !chainKey) return null;
    if (!CHAINS[chainKey]) return null; // reject unknown chains
    const normalized = chainKey === "solana" ? address : address.toLowerCase();
    return chainKey + ":" + normalized;
  }

  // ── Shield eligibility ─────────────────────────────────
  function isShieldEligible(gem) {
    const addr =
      gem && gem.pair && gem.pair.baseToken ? gem.pair.baseToken.address : null;
    if (typeof addr !== "string" || !addr.trim()) return false;
    const chainKey = gem.pair.chainId;
    if (!chainKey || !CHAINS[chainKey]) return false;
    if (!W.shield || !W.shield.CHAINS || !W.shield.CHAINS[chainKey]) {
      return false;
    }
    return true;
  }

  // ── High-risk predicate ────────────────────────────────
  // W.shield.isHighRisk() is the single authority.
  function isHighRisk(shield) {
    if (!shield) return false;
    return (
      W.shield &&
      typeof W.shield.isHighRisk === "function" &&
      W.shield.isHighRisk(shield)
    );
  }

  // ── Market structure (observation only) ───────────────
  function buildObservation(shield, pair) {
    if (!shield || !pair) return null;
    if (!W.marketStructure || typeof W.marketStructure.observe !== "function") {
      return null;
    }
    try {
      return W.marketStructure.observe(shield, pair);
    } catch (e) {
      console.warn(
        "[Gems] Market structure observation failed:",
        e && e.message,
      );
      return null;
    }
  }

  function marketStructureLine(observation) {
    if (!observation) return "";
    const c = observation.concentration;
    const l = observation.liquidity;
    const parts = [];
    if (c && c.status !== "unknown" && Number.isFinite(c.top10Pct)) {
      parts.push(`Top 10: ${c.top10Pct.toFixed(1)}% (${c.status})`);
    }
    if (l && l.status !== "unknown") {
      parts.push(`LP: ${l.status}`);
    }
    if (!parts.length) return "";
    return `<div class="kv-row"><span class="muted">Structure</span><span>${esc(parts.join(" · "))}</span></div>`;
  }

  // ── Trajectory ────────────────────────────────────────
  function fetchTrajectory(chainKey, address) {
    if (!W.observations || typeof W.observations.trajectory !== "function") {
      return null;
    }
    try {
      return W.observations.trajectory(chainKey, address);
    } catch (e) {
      console.warn("[Gems] Trajectory read failed:", e && e.message);
      return null;
    }
  }

  function trajectoryLine(trajectory) {
    if (!trajectory) return "";
    if (
      !W.marketStructure ||
      typeof W.marketStructure.summariseTrajectory !== "function"
    ) {
      return "";
    }
    let summary;
    try {
      summary = W.marketStructure.summariseTrajectory(trajectory);
    } catch (e) {
      console.warn("[Gems] Trajectory summarisation failed:", e && e.message);
      return "";
    }
    if (!summary) return "";
    return `<div class="kv-row"><span class="muted">Trajectory</span><span>${esc(summary)}</span></div>`;
  }

  // ── Owner line ────────────────────────────────────────
  function ownerLine(observation) {
    if (!observation) return "";
    if (
      !W.ownerAssociations ||
      typeof W.ownerAssociations.summarise !== "function"
    ) {
      return "";
    }
    let summary;
    try {
      summary = W.ownerAssociations.summarise(observation);
    } catch (e) {
      console.warn("[Gems] Owner summarisation failed:", e && e.message);
      return "";
    }
    if (!summary) return "";
    return `<div class="kv-row"><span class="muted">Owner</span><span>${esc(summary)}</span></div>`;
  }

  // ── Deployer line ─────────────────────────────────────
  function deployerLine(observation) {
    if (!observation) return "";
    if (!W.deployerGraph || typeof W.deployerGraph.summarise !== "function") {
      return "";
    }
    let summary;
    try {
      summary = W.deployerGraph.summarise(observation);
    } catch (e) {
      console.warn("[Gems] Deployer summarisation failed:", e && e.message);
      return "";
    }
    if (!summary) return "";
    return `<div class="kv-row"><span class="muted">Deployer</span><span>${esc(summary)}</span></div>`;
  }

  // ── Observation recording ─────────────────────────────
  function recordObservation(gem) {
    if (!W.observations || typeof W.observations.record !== "function") {
      return false;
    }
    if (!gem || !gem.pair || !gem.pair.baseToken) return false;

    const addr = gem.pair.baseToken.address;
    const chainKey = gem.pair.chainId;
    if (!addr || !chainKey) return false;

    const key = shieldCacheKey(addr, chainKey);
    const shield = key ? getCachedShield(key) : null;

    if (!shield) return false;
    if (shield.error || shield.noData || shield.unsupported) return false;

    const observation = buildObservation(shield, gem.pair);
    if (!observation) return false;
    if (observation.source === "unavailable") return false;

    try {
      return W.observations.record(chainKey, addr, observation);
    } catch (e) {
      console.warn("[Gems] Observation recording failed:", e && e.message);
      return false;
    }
  }

  // ── Owner associations ────────────────────────────────
  function observeOwner(gem) {
    if (
      !W.ownerAssociations ||
      typeof W.ownerAssociations.observe !== "function"
    ) {
      return null;
    }
    if (!gem || !gem.pair || !gem.pair.baseToken) return null;

    const addr = gem.pair.baseToken.address;
    const chainKey = gem.pair.chainId;
    if (!addr || !chainKey) return null;

    const key = shieldCacheKey(addr, chainKey);
    const shield = key ? getCachedShield(key) : null;

    if (!shield) return null;
    if (shield.error || shield.noData || shield.unsupported) return null;

    const symbol =
      typeof gem.pair.baseToken.symbol === "string"
        ? gem.pair.baseToken.symbol
        : null;

    try {
      return W.ownerAssociations.observe(shield, chainKey, addr, symbol);
    } catch (e) {
      console.warn("[Gems] Owner observation failed:", e && e.message);
      return null;
    }
  }

  // ── Deployer associations ─────────────────────────────
  async function observeDeployer(gem) {
    if (!W.deployerGraph || typeof W.deployerGraph.observe !== "function") {
      return null;
    }
    if (!gem || !gem.pair || !gem.pair.baseToken) return null;

    const addr = gem.pair.baseToken.address;
    const chainKey = gem.pair.chainId;
    if (!addr || !chainKey) return null;

    const key = shieldCacheKey(addr, chainKey);
    const shield = key ? getCachedShield(key) : null;

    if (!shield) return null;
    if (shield.error || shield.noData || shield.unsupported) return null;

    const creator = shield.creator;
    if (!creator || typeof creator !== "object") return null;
    if (typeof creator.address !== "string" || !creator.address.trim()) {
      return null;
    }

    const symbol =
      typeof gem.pair.baseToken.symbol === "string"
        ? gem.pair.baseToken.symbol
        : null;

    try {
      return await W.deployerGraph.observe(shield, chainKey, addr, symbol);
    } catch (e) {
      console.warn("[Gems] Deployer observation failed:", e && e.message);
      return null;
    }
  }

  // ── Bounded-concurrency deployer enrichment ──────────
  async function enrichDeployerResults(
    candidates,
    concurrency = DEPLOYER_CONCURRENCY,
  ) {
    const queue = candidates.slice();
    if (!queue.length) return;
    const workers = [];
    const limit = Math.max(1, Math.min(concurrency, queue.length));
    for (let i = 0; i < limit; i++) {
      workers.push(
        (async () => {
          while (queue.length) {
            const gem = queue.shift();
            if (!gem) break;
            try {
              await observeDeployer(gem);
            } catch (e) {
              console.warn(
                "[Gems] Deployer enrichment failed:",
                e && e.message,
              );
            }
          }
        })(),
      );
    }
    await Promise.all(workers);
  }

  // ── API call with proxy fallback ──────────────────────
  // Hardened: validates the URL, sets credentials: "omit" so no
  // ambient cookie is ever sent to a third party, caps the response
  // size, and parses JSON explicitly rather than through resp.json()
  // so we can check the raw size before parsing.
  async function fetchDexScreener(url) {
    if (
      typeof url !== "string" ||
      !url.startsWith("https://api.dexscreener.com/")
    ) {
      throw new Error("Invalid DEX Screener URL");
    }
    let lastErr;
    for (const proxy of PROXIES) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const resp = await fetch(proxy(url), {
          signal: controller.signal,
          credentials: "omit",
          mode: "cors",
          headers: { Accept: "application/json" },
        });
        clearTimeout(timeout);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        // Guard against an oversized body via Content-Length when
        // present, and again against the decoded text when not.
        const cl = resp.headers.get("content-length");
        if (cl && Number(cl) > MAX_RESPONSE_BYTES) {
          throw new Error("Response too large");
        }
        const text = await resp.text();
        if (text.length > MAX_RESPONSE_BYTES) {
          throw new Error("Response too large");
        }
        try {
          return JSON.parse(text);
        } catch {
          throw new Error("Invalid JSON response");
        }
      } catch (e) {
        lastErr = e;
        clearTimeout(timeout);
      }
    }
    throw lastErr || new Error("All proxies failed");
  }

  // ── Scoring Algorithm ──────────────────────────────────
  // `|| 0` on every numeric field is deliberate here: score() is a
  // heuristic for surfacing candidates, not a data-fidelity claim.
  // A pair missing its liquidity field is treated as "zero
  // liquidity" for scoring purposes (which correctly produces a
  // low score), not as "unknown" (§2.7 concerns the prices and
  // values the UI displays, not the ranking heuristic).
  function score(pair) {
    const liq = (pair.liquidity && pair.liquidity.usd) || 0;
    const vol = (pair.volume && pair.volume.h24) || 0;
    const ageH = pair.pairCreatedAt
      ? (Date.now() - pair.pairCreatedAt) / 36e5
      : 0;
    const c = pair.priceChange || {};
    const h1 = Number(c.h1) || 0,
      h6 = Number(c.h6) || 0,
      h24 = Number(c.h24) || 0;

    let s = 0;
    const reasons = [];

    if (liq >= 100e3 && liq <= 10e6) {
      s += 25;
      reasons.push("Healthy liquidity ($" + kfmt(liq) + ")");
    } else if (liq >= 30e3) {
      s += 12;
      reasons.push("Liquidity on the thin side");
    } else {
      s -= 20;
      reasons.push("⚠️ Micro liquidity — rug risk");
    }

    const vl = liq ? vol / liq : 0;
    if (vl >= 1 && vl <= 30) {
      s += 20;
      reasons.push("Real interest — volume " + vl.toFixed(1) + "× liquidity");
    } else if (vl > 30) {
      s += 5;
      reasons.push("⚠️ Volume looks washed");
    } else {
      reasons.push("Low trading interest so far");
    }

    if (h24 > 20 && h6 > 0) {
      s += 20;
      reasons.push("Strong momentum +" + h24.toFixed(0) + "% 24h");
    } else if (h24 < -30) {
      s -= 15;
      reasons.push("Dumping hard " + h24.toFixed(0) + "% 24h");
    } else {
      s += 8;
    }

    if (ageH >= 6 && ageH <= 336) {
      s += 20;
      reasons.push("Age " + ageText(ageH) + " — past infancy, still early");
    } else if (ageH < 6) {
      s += 5;
      reasons.push("⚠️ Brand new (<6h) — extreme risk");
    } else {
      s += 10;
    }

    if (h1 > 0 && h6 > 0) {
      s += 15;
      reasons.push("Buyers stepping in (1h & 6h green)");
    }

    s = Math.max(0, Math.min(100, s));

    const verdict =
      s >= 70
        ? ["🌱 Strong opportunity signals", "strong-opportunity"]
        : s >= 50
          ? ["🔥 Emerging opportunity", "emerging-opportunity"]
          : s >= 30
            ? ["⚠️ Speculative / mixed", "speculative"]
            : ["🚩 Weak opportunity signals", "weak-opportunity"];

    return {
      score: s,
      reasons,
      verdict,
      liq,
      vol,
      ageH,
      h1,
      h6,
      h24,
      scoreVersion: SCORE_VERSION,
    };
  }

  // ── Scan state ────────────────────────────────────────
  let auto = false;
  let timer = null;

  // Guards against overlapping scans. A user who clicks "Scan now"
  // twice in quick succession (or an auto-timer firing while a
  // manual scan is in progress) would otherwise launch two full
  // pipelines in parallel: duplicate network requests, duplicate
  // notifications, duplicate auto-theses.
  let _scanInFlight = false;

  // Prototype-safe maps. `seen` and `shieldCache` are keyed by
  // values that come from upstream data — a hostile pair with
  // address "__proto__" must not mutate Object.prototype.
  let seen = newMap();
  let shieldCache = newMap();

  function getCachedShield(key) {
    const entry = shieldCache[key];
    if (!entry) return null;
    if (Date.now() - entry.observedAt > SHIELD_CACHE_TTL) {
      delete shieldCache[key];
      return null;
    }
    return entry.assessment;
  }

  function setCachedShield(key, assessment) {
    shieldCache[key] = { assessment, observedAt: Date.now() };
  }

  async function checkShield(addr, chainKey, identity = {}) {
    const key = shieldCacheKey(addr, chainKey);
    if (!key) {
      return { error: true, message: "Invalid address or chain" };
    }
    const cached = getCachedShield(key);
    if (cached) {
      W.shield?.rememberEvidence?.(
        { ...identity, address: addr, chain: chainKey },
        cached,
      );
      return cached;
    }
    if (!W.shield || !W.shield.CHAINS[chainKey]) {
      const result = { unsupported: true };
      setCachedShield(key, result);
      return result;
    }
    try {
      const assessment = await W.shield.check(addr, chainKey);
      const result = assessment
        ? { ...assessment, ok: true }
        : { noData: true };
      setCachedShield(key, result);
      W.shield?.rememberEvidence?.(
        { ...identity, address: addr, chain: chainKey },
        result,
      );
      return result;
    } catch (e) {
      const result = { error: true, message: e.message };
      setCachedShield(key, result);
      return result;
    }
  }

  // ── Bounded-concurrency Shield enrichment ─────────────
  async function enrichShieldResults(
    candidates,
    concurrency = SHIELD_CONCURRENCY,
  ) {
    const queue = candidates.slice();
    if (!queue.length) return;
    const workers = [];
    const limit = Math.max(1, Math.min(concurrency, queue.length));
    for (let i = 0; i < limit; i++) {
      workers.push(
        (async () => {
          while (queue.length) {
            const gem = queue.shift();
            if (!gem) break;
            try {
              await checkShield(gem.pair.baseToken.address, gem.pair.chainId, {
                symbol: gem.pair.baseToken.symbol,
                name: gem.pair.baseToken.name,
              });
            } catch (e) {
              console.warn("[Gems] Shield enrichment failed:", e && e.message);
            }
          }
        })(),
      );
    }
    await Promise.all(workers);
  }

  // ── Shield summary ────────────────────────────────────
  // Every field is optional; every field must be checked before
  // stringifying. The prior version printed "undefined/100" when
  // riskScore was absent and "undefined" when scoreVersion was
  // absent. Now: missing values are shown as "—" or omitted.
  function shieldSummary(s) {
    if (!s) return "🛡️ Shield: not checked";
    if (s.unsupported) return "🛡️ Shield: not available for this chain";
    if (s.error) return "🛡️ Shield: check failed — verify manually";
    if (s.noData) return "🛡️ Shield: no security data found";
    const level = s.riskLevel && s.riskLevel[0] ? s.riskLevel[0] : "—";
    const score = Number.isFinite(s.riskScore) ? s.riskScore : "—";
    const version = typeof s.scoreVersion === "string" ? s.scoreVersion : null;
    return version
      ? `🛡️ Shield: ${level} (${score}/100 identified-risk score, ${version})`
      : `🛡️ Shield: ${level} (${score}/100 identified-risk score)`;
  }

  function autoCreateThesis(gem, addr, shield) {
    if (!W.theses) return;
    const chain = gem.pair.chainId;
    const sourceRef = { type: "gem", addr, chain };
    if (W.theses.findBySourceRef && W.theses.findBySourceRef(sourceRef)) return;

    const asset = `$${gem.pair.baseToken.symbol} (${chain})`;
    const reasons = (gem.analysis.reasons || []).join("; ");
    const signals = shieldSummary(shield);

    W.theses.create({
      asset,
      statement: `Gem Agent alert — score ${gem.analysis.score} (${gem.analysis.scoreVersion}). Not financial advice; log the reasoning, decide for yourself.`,
      reasons,
      signals,
      invalidation:
        "Shield verdict turns high-risk, liquidity is pulled, or momentum reverses hard — review before acting further.",
      horizon: "Short-term",
      sourceRef,
    });
  }

  // ── Scan ──────────────────────────────────────────────
  // Public entry point. Guards against concurrent scans and against
  // a detached view (user navigated away mid-scan). The heavy lifting
  // is inside the try block so the flag is always cleared.
  async function scan(view) {
    if (_scanInFlight) {
      W.ui?.toast?.("Scan already in progress", "info", 2000);
      return;
    }
    if (!view || !view.isConnected) return;
    const body = view.querySelector("#g-body");
    if (!body) return;

    _scanInFlight = true;
    try {
      await _scanImpl(view, body);
    } finally {
      _scanInFlight = false;
    }
  }

  async function _scanImpl(view, body) {
    body.innerHTML = W.ui.spinner();

    try {
      const [boosts, profiles] = await Promise.allSettled([
        fetchDexScreener(DEXSCREENER_API + "/token-boosts/latest/v1"),
        fetchDexScreener(DEXSCREENER_API + "/token-profiles/latest/v1"),
      ]);

      // View may have detached during the fetch.
      if (!view.isConnected) return;

      const map = newMap();
      if (boosts.status === "fulfilled" && Array.isArray(boosts.value)) {
        boosts.value.forEach((b) => {
          if (b && typeof b.tokenAddress === "string") {
            map[b.tokenAddress] = Number(b.totalBoosts) || 1;
          }
        });
      }
      if (profiles.status === "fulfilled" && Array.isArray(profiles.value)) {
        profiles.value.forEach((p) => {
          if (
            p &&
            typeof p.tokenAddress === "string" &&
            !(p.tokenAddress in map)
          ) {
            map[p.tokenAddress] = 0;
          }
        });
      }

      const addresses = Object.keys(map).slice(0, 30);
      if (!addresses.length) throw new Error("No candidates");

      const pairsResp = await fetchDexScreener(
        DEXSCREENER_API + "/latest/dex/tokens/" + addresses.join(","),
      );
      if (!view.isConnected) return;

      const pairs = Array.isArray(pairsResp)
        ? pairsResp
        : pairsResp && Array.isArray(pairsResp.pairs)
          ? pairsResp.pairs
          : [];

      const byToken = newMap();
      pairs.forEach((p) => {
        if (!p || typeof p !== "object") return;
        const a = p.baseToken && p.baseToken.address;
        if (typeof a !== "string") return;
        if (!CHAINS[p.chainId]) return;
        const existing = byToken[a];
        if (
          !existing ||
          (p.liquidity?.usd || 0) > (existing.liquidity?.usd || 0)
        ) {
          byToken[a] = p;
        }
      });

      const minScore = parseFloat(view.querySelector("#g-min")?.value) || 0;
      const chainFilter = view.querySelector("#g-chain")?.value || "";
      const hideRisk = view.querySelector("#g-hide-risk")?.checked || false;

      const results = Object.values(byToken)
        .map((p) => ({ pair: p, analysis: score(p) }))
        .filter((g) => g.analysis.score >= minScore)
        .sort((a, b) => b.analysis.score - a.analysis.score)
        .slice(0, 24);

      // ── Shield enrichment ───────────────────────────────
      const eligible = results.filter(isShieldEligible);
      const uncached = [];
      for (const g of eligible) {
        if (uncached.length >= MAX_FRESH_SHIELD_PER_SCAN) break;
        const key = shieldCacheKey(g.pair.baseToken.address, g.pair.chainId);
        if (key && getCachedShield(key)) continue;
        uncached.push(g);
      }
      if (uncached.length) {
        await enrichShieldResults(uncached, SHIELD_CONCURRENCY);
        if (!view.isConnected) return;
      }

      // ── Record observations ─────────────────────────────
      for (const g of results) {
        recordObservation(g);
        observeOwner(g);
      }

      // ── Deployer enrichment ─────────────────────────────
      if (W.deployerGraph && typeof W.deployerGraph.get === "function") {
        const deployerUncached = [];
        for (const g of results) {
          if (deployerUncached.length >= MAX_FRESH_DEPLOYER_PER_SCAN) break;
          const addr = g.pair.baseToken.address;
          const chainKey = g.pair.chainId;
          if (!addr || !chainKey) continue;

          const shieldKey = shieldCacheKey(addr, chainKey);
          const shield = shieldKey ? getCachedShield(shieldKey) : null;
          if (!shield) continue;
          if (shield.error || shield.noData || shield.unsupported) continue;
          const creator = shield.creator;
          if (!creator || typeof creator !== "object") continue;
          if (typeof creator.address !== "string" || !creator.address.trim()) {
            continue;
          }

          const cached = W.deployerGraph.get(chainKey, addr);
          if (cached) continue;
          deployerUncached.push(g);
        }
        if (deployerUncached.length) {
          await enrichDeployerResults(deployerUncached, DEPLOYER_CONCURRENCY);
          if (!view.isConnected) return;
        }
      }

      // ── Apply filters ───────────────────────────────────
      const shown = results.filter((g) => {
        if (chainFilter && g.pair.chainId !== chainFilter) return false;
        if (!hideRisk) return true;
        const key = shieldCacheKey(g.pair.baseToken.address, g.pair.chainId);
        const sc = key ? getCachedShield(key) : null;
        if (!sc) return true;
        return !isHighRisk(sc);
      });

      // ── Notifications / theses ──────────────────────────
      for (const g of results) {
        const addr = g.pair.baseToken.address;
        const chainKey = g.pair.chainId;
        const cacheKey = shieldCacheKey(addr, chainKey);
        if (g.analysis.score >= 70 && cacheKey && !seen[cacheKey]) {
          const shield = getCachedShield(cacheKey) || null;
          const symbolRaw = g.pair.baseToken.symbol;
          const symbolSafe = esc(symbolRaw);
          const reasonLines = (g.analysis.reasons || [])
            .slice(0, 4)
            .map((r) => "• " + r)
            .join("\n");
          const msg =
            `🤖 <b>Gem detected:</b> ${symbolSafe} on ${esc(chainKey)} — score ${g.analysis.score} (${esc(g.analysis.scoreVersion)})\n` +
            (reasonLines ? reasonLines + "\n" : "") +
            shieldSummary(shield);
          W.ui.toast(
            `Gem detected: ${symbolSafe} — score ${g.analysis.score}`,
            "ok",
            6000,
          );
          if (W.tg) W.tg.notify("gem:" + cacheKey, msg);
          autoCreateThesis(g, addr, shield);
          if (W.trackRecord) {
            const priceAtCapture = parseFloat(g.pair.priceUsd);
            W.trackRecord.createFromGemAlert({
              symbol: symbolRaw,
              chainId: chainKey,
              contractAddress: addr,
              priceAtCapture: Number.isFinite(priceAtCapture)
                ? priceAtCapture
                : null,
              scenario: "Bullish scenario",
              confidence: null,
              reasons: g.analysis.reasons,
              methodologyVersion: g.analysis.scoreVersion,
            });
          }
        }
        if (cacheKey) seen[cacheKey] = 1;
      }

      // ── Render ──────────────────────────────────────────
      if (!view.isConnected) return;

      const statsEl = view.querySelector("#g-stats");
      if (statsEl) {
        statsEl.innerHTML = `
          <div class="card stat"><div class="stat-label">Candidates scanned</div><div class="stat-big">${esc(addresses.length)}</div></div>
          <div class="card stat"><div class="stat-label">Chains covered</div><div class="stat-big">${esc(new Set(results.map((g) => g.pair.chainId)).size)}</div></div>
          <div class="card stat"><div class="stat-label">Gems ≥ ${esc(minScore)}</div><div class="stat-big">${esc(results.length)}${shown.length < results.length ? " (showing " + esc(shown.length) + ")" : ""}</div></div>
        `;
      }

      if (shown.length) {
        body.innerHTML = `<div class="grid-2">${shown
          .map((g) => _renderGemCard(g))
          .join("")}</div>`;

        body.querySelectorAll("[data-shield-check]").forEach((btn) => {
          btn.onclick = async () => {
            btn.textContent = "Checking…";
            btn.disabled = true;
            const shield = await checkShield(
              btn.dataset.addr,
              btn.dataset.chain,
              { symbol: btn.dataset.symbol },
            );
            const slot = btn.closest(".shield-slot");
            if (slot) {
              slot.innerHTML = `<div class="kv-row"><span class="muted">Security</span><span>${esc(shieldSummary(shield))}</span></div>`;
            }
          };
        });
      } else {
        body.innerHTML = W.ui.empty(
          "🤖",
          "No gems above the threshold right now",
          "Lower the min score or wait for the next auto-scan",
        );
      }
    } catch (e) {
      if (!view.isConnected) return;
      body.innerHTML = `<p class="muted">Gem scan failed: ${esc(e.message)} — DEX Screener unreachable on this network (try ⟳ or another network).</p>`;
    }
  }

  // ── Card renderer ─────────────────────────────────────
  // Extracted so the scan body stays readable. Every interpolated
  // value is passed through esc(); the external URL is validated
  // through safeExternalUrl() before being used in an href.
  function _renderGemCard(g) {
    const p = g.pair;
    const a = g.analysis;
    const t = p.baseToken || {};
    const addr = t.address;
    const key = shieldCacheKey(addr, p.chainId);
    const shield = key ? getCachedShield(key) : null;
    const shieldSection = shield
      ? `<div class="kv-row"><span class="muted">Security</span><span>${esc(shieldSummary(shield))}</span></div>`
      : `<button class="btn tiny mt" data-shield-check data-addr="${esc(addr)}" data-symbol="${esc(t.symbol)}" data-chain="${esc(p.chainId)}">🛡️ Verify Security</button>`;

    const observation = buildObservation(shield, p);
    const structureSection = marketStructureLine(observation);

    const trajectory = fetchTrajectory(p.chainId, addr);
    const trajectorySection = trajectoryLine(trajectory);

    const ownerObservation = W.ownerAssociations
      ? W.ownerAssociations.get(p.chainId, addr)
      : null;
    const ownerSection = ownerLine(ownerObservation);

    const deployerObservation = W.deployerGraph
      ? W.deployerGraph.get(p.chainId, addr)
      : null;
    const deployerSection = deployerLine(deployerObservation);

    // External link — validate before embedding. Fall back to the
    // constructed DexScreener URL only if it also validates.
    const fallbackUrl =
      "https://dexscreener.com/" +
      encodeURIComponent(p.chainId || "") +
      "/" +
      encodeURIComponent(p.pairAddress || "");
    const externalUrl =
      safeExternalUrl(p.url) || safeExternalUrl(fallbackUrl) || "#";

    const reasons = Array.isArray(a.reasons) ? a.reasons : [];
    const firstReason = reasons[0] || "Insufficient evidence to summarize.";

    return `
      <div class="card" data-gem-card="${esc(addr)}">
        <div class="watch-head">
          <div>
            <b>${esc(t.symbol)}</b> <span class="muted small">${esc(t.name)}</span><br>
            ${chainTag(p.chainId)} <span class="muted small">age ${esc(ageText(a.ageH))}</span>
          </div>
          <div class="text-right">
            <span class="tag tag-lg ${esc(a.verdict[1])}">${esc(a.verdict[0])}</span>
            <div class="alt-num text-3xl">${esc(a.score)}</div>
            <div class="muted text-2xs">${esc(a.scoreVersion)}</div>
          </div>
        </div>
        <div class="meter-bar"><div class="meter-fill meter-fill-${pctBucket(a.score)}"></div></div>
        <div class="kv-row"><span class="muted">Price</span><span>$${esc(p.priceUsd)}</span></div>
        <div class="kv-row"><span class="muted">Liquidity / 24h Vol</span><span>$${esc(kfmt(a.liq))} / $${esc(kfmt(a.vol))}</span></div>
        <div class="kv-row"><span class="muted">1h / 6h / 24h</span><span>${esc(W.fmt.pct(a.h1))} ${esc(W.fmt.pct(a.h6))} ${esc(W.fmt.pct(a.h24))}</span></div>
        <div class="shield-slot">${shieldSection}</div>
        ${structureSection}
        ${trajectorySection}
        ${ownerSection}
        ${deployerSection}
        <p class="small muted mt-8"><b>Why it appeared:</b> ${esc(firstReason)}</p>
        ${
          reasons.length > 1
            ? `<ul class="tx-list">${reasons
                .slice(1, 4)
                .map((r) => `<li>${esc(r)}</li>`)
                .join("")}</ul>`
            : ""
        }
        <a class="btn tiny mt" href="#/token/${encodeURIComponent(t.symbol || "")}">📈 Analyze ${esc(t.symbol)}</a>
        <a class="btn tiny mt" target="_blank" rel="noopener noreferrer" href="${esc(externalUrl)}">📊 Open in DEX Screener ↗</a>
      </div>
    `;
  }

  // ── Render ─────────────────────────────────────────────
  async function render(view) {
    if (!view) return;
    const chainList = Object.keys(CHAINS).join(", ");
    view.innerHTML = `
      <div class="card">
        <div class="watch-head">
          <h3>🤖 Gem Agent — new-token scanner</h3>
          <div class="qa">
            <label class="m-0">Min score
              <select id="g-min" class="w-auto">
                <option value="0">0</option>
                <option value="40" selected>40</option>
                <option value="60">60</option>
                <option value="70">70</option>
              </select>
            </label>
            <label class="m-0">Chain
              <select id="g-chain" class="w-auto">
                <option value="">All</option>
                ${Object.keys(CHAINS)
                  .map((c) => `<option value="${esc(c)}">${esc(c)}</option>`)
                  .join("")}
              </select>
            </label>
            <label class="small m-0" title="Hides tokens with identified high-risk Shield indicators. Unchecked or unavailable security data remains visible.">
              <input type="checkbox" id="g-hide-risk" class="w-auto">
              Hide identified high-risk
            </label>
            <label class="small m-0">
              <input type="checkbox" id="g-auto" ${auto ? "checked" : ""} class="w-auto">
              Auto-scan 5 min
            </label>
            <button class="btn primary" id="g-go">▶ Scan now</button>
          </div>
        </div>
        <p class="muted small">The agent crawls DEX Screener's latest boosted & newly-profiled tokens on chains with Token Shield verification (<b>${esc(chainList)}</b>), pulls their pairs and scores potential: liquidity sweet-spot, volume÷liquidity, momentum, age & early buying pressure. Memecoins can go to zero — not financial advice.</p>
      </div>
      <div class="cards" id="g-stats"></div>
      <div id="g-body">${W.ui.spinner()}</div>
    `;

    view.querySelector("#g-go").onclick = () => scan(view);
    view.querySelector("#g-min").onchange = () => scan(view);
    view.querySelector("#g-chain").onchange = () => scan(view);
    view.querySelector("#g-hide-risk").onchange = () => scan(view);
    view.querySelector("#g-auto").onchange = (e) => {
      auto = e.target.checked;
      clearInterval(timer);
      timer = null;
      if (auto) {
        timer = setInterval(
          () => {
            // Stop the timer if the user has navigated away. Without
            // this check the interval would keep firing indefinitely
            // against a detached view, issuing network requests on
            // every tick with nowhere to render them.
            if (!view.isConnected) {
              clearInterval(timer);
              timer = null;
              auto = false;
              return;
            }
            scan(view);
          },
          5 * 60 * 1000,
        );
      }
      W.ui.toast(
        auto ? "🤖 Agent armed — rescanning every 5 min" : "🤖 Agent paused",
        "info",
      );
    };
    if (auto && !timer) {
      timer = setInterval(
        () => {
          if (!view.isConnected) {
            clearInterval(timer);
            timer = null;
            auto = false;
            return;
          }
          scan(view);
        },
        5 * 60 * 1000,
      );
    }
    await scan(view);
  }

  return {
    render,
    scan,
    checkShield,
    CHAINS,
    SCORE_VERSION,
    // Exposed for tests and diagnostics only. Not part of the public API.
    _internal: {
      shieldCacheKey,
      isShieldEligible,
      isHighRisk,
      enrichShieldResults,
      getCachedShield,
      setCachedShield,
      buildObservation,
      marketStructureLine,
      fetchTrajectory,
      trajectoryLine,
      ownerLine,
      deployerLine,
      recordObservation,
      observeOwner,
      observeDeployer,
      enrichDeployerResults,
      getShieldCache: () => shieldCache,
      resetShieldCache: () => {
        shieldCache = newMap();
      },
      resetSeen: () => {
        seen = newMap();
      },
      // Exposed for tests; not for production callers.
      esc,
      safeExternalUrl,
    },
  };
})();

console.log(
  "[Gems] Module loaded (attr-safe escaping, URL validation, prototype-safe caches, scan concurrency guard).",
);
