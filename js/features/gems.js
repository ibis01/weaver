//   Gem Agent: Token Hunter

window.W = window.W || {};

W.gems = (() => {
  // ── Constants ─────────────────────────────────────────
  const DEXSCREENER_API = "https://api.dexscreener.com";
  const PROXIES = [(u) => u];

  // Only chains with a working Token Shield verification path.
  // Constitution §3.3: DISCOVERABLE_CHAINS ⊆ VERIFIED_CHAINS.
  const CHAINS = {
    solana: "🟣",
    ethereum: "🔷",
    base: "🔵",
    bsc: "🟡",
    arbitrum: "🔺",
    polygon: "🟪",
    avalanche: "❄️",
  };

  const SCORE_VERSION = "gem-v1";

  // Per-scan bounds on fresh Shield requests.
  const MAX_FRESH_SHIELD_PER_SCAN = 12;
  const SHIELD_CONCURRENCY = 4;

  // Gem-local Shield cache TTL. Must match shield.js's own W.store TTL
  // so the two caches expire in step. A Shield assessment older than
  // this is deleted on read and re-fetched on the next scan.
  const SHIELD_CACHE_TTL = 300000; // 5 minutes

  // ── Helpers ────────────────────────────────────────────
  function escapeHTML(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function chainTag(chain) {
    return `<span class="tag rank">${CHAINS[chain] || "⛓️"} ${chain}</span>`;
  }

  function kfmt(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
    return (n || 0).toFixed(0);
  }

  function ageText(hours) {
    if (hours < 1) return "<1h";
    if (hours < 48) return Math.round(hours) + "h";
    return Math.round(hours / 24) + "d";
  }

  function pctBucket(n) {
    const v = Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
    return Math.round(v / 10) * 10;
  }

  // ── Shield cache key (chain-aware) ────────────────────
  // EVM addresses are case-insensitive hex; Solana addresses are
  // case-sensitive base58. Prefix with the chain key so the same
  // 0x... address on Ethereum and Base cannot collide.
  //
  // Chains with different address-normalization rules MUST be handled
  // explicitly here rather than falling through to the EVM/Solana
  // branches.
  function shieldCacheKey(address, chainKey) {
    if (typeof address !== "string" || !address.trim()) return null;
    if (typeof chainKey !== "string" || !chainKey) return null;
    const normalized = chainKey === "solana" ? address : address.toLowerCase();
    return chainKey + ":" + normalized;
  }

  // ── Shield eligibility ─────────────────────────────────
  // A candidate is Shield-eligible only when:
  //   1. baseToken.address is a non-empty string,
  //   2. its chain is in Gem Agent's CHAINS,
  //   3. that chain is also in W.shield.CHAINS.
  // Address-format validation is deferred to W.shield.check() —
  // the authority for what constitutes a valid address per chain.
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
  // W.shield.isHighRisk() is the single authority. Gem Agent must not
  // duplicate the threshold, because a second source of truth is the
  // exact failure mode the P0 was fixing. If Shield is unavailable,
  // the answer is "not identified as high risk" — matching Shield's
  // own default for missing data. Unknown ≠ high risk, unknown ≠ safe.
  function isHighRisk(shield) {
    if (!shield) return false;
    return (
      W.shield &&
      typeof W.shield.isHighRisk === "function" &&
      W.shield.isHighRisk(shield)
    );
  }

  // ── Market structure (observation only) ───────────────
  // Produces an observation from the Shield assessment. Does NOT
  // classify or filter — Shield's isHighRisk() remains the single
  // authority for risk decisions. Degrades gracefully when
  // W.marketStructure is not loaded (test environments, load-order
  // issues): the observation is null and the renderer omits the row.
  function buildObservation(shield, pair) {
    if (!shield || !pair) return null;
    if (!W.marketStructure || typeof W.marketStructure.observe !== "function") {
      return null;
    }
    try {
      return W.marketStructure.observe(shield, pair);
    } catch (e) {
      // Observation is best-effort evidence, never a hard dependency.
      console.warn(
        "[Gems] Market structure observation failed:",
        e && e.message,
      );
      return null;
    }
  }

  // Renders the observation as an HTML row, or "" when there is
  // nothing meaningful to show. "unknown" values are hidden rather
  // than displayed as noise — but the absence of a row does NOT mean
  // the token is safe; it means the observation layer had no
  // measured values. Consumers must not read the absence of this
  // row as a positive signal.
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
    return `<div class="kv-row"><span class="muted">Structure</span><span>${escapeHTML(parts.join(" · "))}</span></div>`;
  }

  // ── Trajectory (Step 3 of trajectory design) ──────────
  // Reads the current trajectory for a token from the observations
  // module. Returns null when the module is missing, no history
  // exists, or the read fails. Never throws.
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

  // Renders a trajectory as an HTML row, or "" when there is
  // nothing to show (no trajectory, no available deltas, or the
  // market-structure module is not loaded). The absence of this
  // row does NOT mean the token is safe or stable; it means no
  // delta could be computed from the retained history.
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
    return `<div class="kv-row"><span class="muted">Trajectory</span><span>${escapeHTML(summary)}</span></div>`;
  }

  // ── Observation recording (Step 2 of trajectory design) ──
  // Persists a market-structure observation for a single candidate
  // when the cached Shield assessment is usable. Returns true on
  // success, false otherwise. Never throws.
  //
  // Guards:
  //   - W.observations must be loaded (Step 1 module)
  //   - gem must carry a pair with a baseToken address
  //   - a cached Shield assessment must exist for the token
  //   - the assessment must not be an error/noData/unsupported state
  //   - the observation must not carry source "unavailable"
  //     (Solana — the GoPlus Solana endpoint does not return
  //     holder distribution, so recording would only produce
  //     all-null entries that cannot yield trajectory deltas)
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

  // ── API call with proxy fallback ──────────────────────
  async function fetchDexScreener(url) {
    let lastErr;
    for (const proxy of PROXIES) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 9000);
      try {
        const resp = await fetch(proxy(url), { signal: controller.signal });
        clearTimeout(timeout);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return await resp.json();
      } catch (e) {
        lastErr = e;
        clearTimeout(timeout);
      }
    }
    throw lastErr || new Error("All proxies failed");
  }

  // ── Scoring Algorithm ──────────────────────────────────
  function score(pair) {
    const liq = (pair.liquidity && pair.liquidity.usd) || 0;
    const vol = (pair.volume && pair.volume.h24) || 0;
    const ageH = pair.pairCreatedAt
      ? (Date.now() - pair.pairCreatedAt) / 36e5
      : 0;
    const c = pair.priceChange || {};
    const h1 = c.h1 || 0,
      h6 = c.h6 || 0,
      h24 = c.h24 || 0;

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
  let auto = false,
    timer = null;

  // `seen` tracks notification dedup across scans. Chain-aware: the
  // same 0x... address on Ethereum and Base are two distinct candidates
  // and must not collapse into one notification. Keyed with the same
  // normalization as shieldCacheKey so the two caches stay in lockstep.
  let seen = {};

  // `shieldCache` stores { assessment, observedAt } per chain-aware key.
  // Entries expire after SHIELD_CACHE_TTL. Do not read this map
  // directly — use getCachedShield() / setCachedShield() so the TTL is
  // always enforced.
  let shieldCache = {};

  function getCachedShield(key) {
    const entry = shieldCache[key];
    if (!entry) return null;
    if (Date.now() - entry.observedAt > SHIELD_CACHE_TTL) {
      delete shieldCache[key];
      return null;
    }
    // The assessment may be a successful result, an error result, an
    // unsupported-chain result, or a noData result. All four are valid
    // cached states with the same TTL. Callers must not treat the
    // presence of a cached value as proof of a successful check.
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
      // Keep evidence registry warm for downstream consumers.
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
  // Callers pass only *uncached* candidates. Cache hits never consume a
  // fresh-request slot. One failing worker does not abort the others.
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
              // checkShield already swallows errors; this is belt-and-braces.
              console.warn("[Gems] Shield enrichment failed:", e && e.message);
            }
          }
        })(),
      );
    }
    await Promise.all(workers);
  }

  function shieldSummary(s) {
    if (!s) return "🛡️ Shield: not checked";
    if (s.unsupported) return "🛡️ Shield: not available for this chain";
    if (s.error) return "🛡️ Shield: check failed — verify manually";
    if (s.noData) return "🛡️ Shield: no security data found";
    const level = s.riskLevel && s.riskLevel[0] ? s.riskLevel[0] : "—";
    return `🛡️ Shield: ${level} (${s.riskScore}/100 identified-risk score, ${s.scoreVersion})`;
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

  async function scan(view) {
    const body = view.querySelector("#g-body");
    if (!body) return;
    body.innerHTML = W.ui.spinner();

    try {
      const [boosts, profiles] = await Promise.allSettled([
        fetchDexScreener(DEXSCREENER_API + "/token-boosts/latest/v1"),
        fetchDexScreener(DEXSCREENER_API + "/token-profiles/latest/v1"),
      ]);

      const map = new Map();
      if (boosts.status === "fulfilled" && boosts.value) {
        boosts.value.forEach((b) =>
          map.set(b.tokenAddress, b.totalBoosts || 1),
        );
      }
      if (profiles.status === "fulfilled" && profiles.value) {
        profiles.value.forEach((p) => {
          if (!map.has(p.tokenAddress)) map.set(p.tokenAddress, 0);
        });
      }

      const addresses = [...map.keys()].slice(0, 30);
      if (!addresses.length) throw new Error("No candidates");

      const pairsResp = await fetchDexScreener(
        DEXSCREENER_API + "/latest/dex/tokens/" + addresses.join(","),
      );
      const pairs = Array.isArray(pairsResp)
        ? pairsResp
        : pairsResp && Array.isArray(pairsResp.pairs)
          ? pairsResp.pairs
          : [];
      const byToken = {};
      pairs.forEach((p) => {
        const a = p.baseToken?.address;
        if (!a) return;
        if (!CHAINS[p.chainId]) return;
        if (
          !byToken[a] ||
          (p.liquidity?.usd || 0) > (byToken[a].liquidity?.usd || 0)
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

      // ── Shield enrichment — MUST run before hideRisk filtering ──
      // Reuse cached results; issue at most MAX_FRESH_SHIELD_PER_SCAN
      // fresh checks for the highest-scoring uncached eligible
      // candidates, with bounded concurrency.
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
      }

      // ── Record observations (Step 2 of trajectory design) ──
      // Persist a market-structure observation for every candidate
      // with a usable cached Shield assessment, regardless of
      // whether it survives the chain and hide-risk filters below.
      // The trajectory layer must reflect what this scan observed,
      // not what the user is currently looking at.
      //
      // MAX_FRESH_SHIELD_PER_SCAN bounds network requests; it does
      // not bound observation recording. Cached assessments are
      // recorded too — the observation captures what Weaver knew at
      // scan time, not when GoPlus originally fetched the data.
      //
      // Solana assessments are skipped inside recordObservation
      // because the provider does not return holder distribution
      // for them.
      for (const g of results) {
        recordObservation(g);
      }

      // ── Apply filters (chain + hideRisk) on enriched data ──
      const shown = results.filter((g) => {
        if (chainFilter && g.pair.chainId !== chainFilter) return false;
        if (!hideRisk) return true;
        const key = shieldCacheKey(g.pair.baseToken.address, g.pair.chainId);
        const sc = key ? getCachedShield(key) : null;
        if (!sc) return true; // unknown ≠ safe, but also not high-risk
        return !isHighRisk(sc);
      });

      // ── Notifications / theses (post-enrichment, cache-only) ──
      // `seen` is chain-aware. Telegram notify key uses the same
      // chain-aware identity, otherwise Telegram's own dedup would
      // suppress the second chain's alert.
      for (const g of results) {
        const addr = g.pair.baseToken.address;
        const chainKey = g.pair.chainId;
        const cacheKey = shieldCacheKey(addr, chainKey);
        if (g.analysis.score >= 70 && cacheKey && !seen[cacheKey]) {
          const shield = getCachedShield(cacheKey) || null;
          const reasonLines = (g.analysis.reasons || [])
            .slice(0, 4)
            .map((r) => "• " + r)
            .join("\n");
          const msg =
            `🤖 <b>Gem detected:</b> ${g.pair.baseToken.symbol} on ${chainKey} — score ${g.analysis.score} (${g.analysis.scoreVersion})\n` +
            (reasonLines ? reasonLines + "\n" : "") +
            shieldSummary(shield);
          W.ui.toast(
            `Gem detected: ${g.pair.baseToken.symbol} — score ${g.analysis.score}`,
            "ok",
            6000,
          );
          if (W.tg) W.tg.notify("gem:" + cacheKey, msg);
          autoCreateThesis(g, addr, shield);
          if (W.trackRecord) {
            const priceAtCapture = parseFloat(g.pair.priceUsd);
            W.trackRecord.createFromGemAlert({
              symbol: g.pair.baseToken.symbol,
              chainId: chainKey,
              contractAddress: addr,
              priceAtCapture: Number.isFinite(priceAtCapture)
                ? priceAtCapture
                : null,
              scenario: "Bullish scenario",
              confidence: g.analysis.score,
              reasons: g.analysis.reasons,
              methodologyVersion: g.analysis.scoreVersion,
            });
          }
        }
        if (cacheKey) seen[cacheKey] = 1;
      }

      view.querySelector("#g-stats").innerHTML = `
        <div class="card stat"><div class="stat-label">Candidates scanned</div><div class="stat-big">${addresses.length}</div></div>
        <div class="card stat"><div class="stat-label">Chains covered</div><div class="stat-big">${new Set(results.map((g) => g.pair.chainId)).size}</div></div>
        <div class="card stat"><div class="stat-label">Gems ≥ ${minScore}</div><div class="stat-big">${results.length}${shown.length < results.length ? " (showing " + shown.length + ")" : ""}</div></div>
      `;

      if (shown.length) {
        body.innerHTML = `<div class="grid-2">${shown
          .map((g) => {
            const p = g.pair,
              a = g.analysis,
              t = p.baseToken;
            const addr = t.address;
            const key = shieldCacheKey(addr, p.chainId);
            const shield = key ? getCachedShield(key) : null;
            const shieldSection = shield
              ? `<div class="kv-row"><span class="muted">Security</span><span>${escapeHTML(shieldSummary(shield))}</span></div>`
              : `<button class="btn tiny mt" data-shield-check data-addr="${escapeHTML(addr)}" data-symbol="${escapeHTML(t.symbol)}" data-chain="${escapeHTML(p.chainId)}">🛡️ Verify Security</button>`;

            // Market structure observation. Derived from the cached
            // shield assessment and the DexScreener pair — no new
            // network call. Renders as an additional row when there is
            // something measured; omitted when both concentration and
            // LP status are unknown.
            const observation = buildObservation(shield, p);
            const structureSection = marketStructureLine(observation);

            // Trajectory. Reads persisted history for the token and
            // computes deltas for the standard intervals. Renders as
            // a second row when at least one delta is available.
            const trajectory = fetchTrajectory(p.chainId, addr);
            const trajectorySection = trajectoryLine(trajectory);

            return `
            <div class="card" data-gem-card="${escapeHTML(addr)}">
              <div class="watch-head">
                <div>
                  <b>${escapeHTML(t.symbol)}</b> <span class="muted small">${escapeHTML(t.name)}</span><br>
                  ${chainTag(p.chainId)} <span class="muted small">age ${ageText(a.ageH)}</span>
                </div>
                <div class="text-right">
                  <span class="tag tag-lg ${a.verdict[1]}">${a.verdict[0]}</span>
                  <div class="alt-num text-3xl">${a.score}</div>
                  <div class="muted text-2xs">${a.scoreVersion}</div>
                </div>
              </div>
              <div class="meter-bar"><div class="meter-fill meter-fill-${pctBucket(a.score)}"></div></div>
              <div class="kv-row"><span class="muted">Price</span><span>$${p.priceUsd}</span></div>
              <div class="kv-row"><span class="muted">Liquidity / 24h Vol</span><span>$${kfmt(a.liq)} / $${kfmt(a.vol)}</span></div>
              <div class="kv-row"><span class="muted">1h / 6h / 24h</span><span>${W.fmt.pct(a.h1)} ${W.fmt.pct(a.h6)} ${W.fmt.pct(a.h24)}</span></div>
              <div class="shield-slot">${shieldSection}</div>
              ${structureSection}
              ${trajectorySection}
              <p class="small muted mt-8"><b>Why it appeared:</b> ${escapeHTML(a.reasons[0] || "Insufficient evidence to summarize.")}</p>
              ${
                a.reasons.length > 1
                  ? `<ul class="tx-list">${a.reasons
                      .slice(1, 4)
                      .map((r) => `<li>${escapeHTML(r)}</li>`)
                      .join("")}</ul>`
                  : ""
              }
              <a class="btn tiny mt" href="#/token/${encodeURIComponent(t.symbol)}">📈 Analyze ${escapeHTML(t.symbol)}</a>
              <a class="btn tiny mt" target="_blank" href="${p.url || "https://dexscreener.com/" + p.chainId + "/" + p.pairAddress}">📊 Open in DEX Screener ↗</a>
            </div>
          `;
          })
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
              slot.innerHTML = `<div class="kv-row"><span class="muted">Security</span><span>${escapeHTML(shieldSummary(shield))}</span></div>`;
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
      body.innerHTML = `<p class="muted">Gem scan failed: ${escapeHTML(e.message)} — DEX Screener unreachable on this network (try ⟳ or another network).</p>`;
    }
  }

  // ── Render ─────────────────────────────────────────────
  async function render(view) {
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
                  .map((c) => `<option value="${c}">${c}</option>`)
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
        <p class="muted small">The agent crawls DEX Screener's latest boosted & newly-profiled tokens on chains with Token Shield verification (<b>${escapeHTML(chainList)}</b>), pulls their pairs and scores potential: liquidity sweet-spot, volume÷liquidity, momentum, age & early buying pressure. Memecoins can go to zero — not financial advice.</p>
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
      if (auto) timer = setInterval(() => scan(view), 5 * 60 * 1000);
      W.ui.toast(
        auto ? "🤖 Agent armed — rescanning every 5 min" : "🤖 Agent paused",
        "info",
      );
    };
    if (auto && !timer) timer = setInterval(() => scan(view), 5 * 60 * 1000);
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
      // TTL-aware helpers — tests should use these, not the raw map.
      getCachedShield,
      setCachedShield,
      // Market structure wiring — exposed for isolated tests.
      buildObservation,
      marketStructureLine,
      fetchTrajectory,
      trajectoryLine,
      // Observation recording — exposed for isolated tests.
      recordObservation,
      // Raw map for diagnostics only. Entries are {assessment, observedAt}.
      getShieldCache: () => shieldCache,
      resetShieldCache: () => {
        shieldCache = {};
      },
      resetSeen: () => {
        seen = {};
      },
    },
  };
})();

console.log("[Gems] Module loaded.");
