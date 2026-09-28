// ═══════════════════════════════════════════════════════════════════
//   Gem Agent  — Token Hunter
//   Modules: walletGraph · securityAdapters · gems
//   Guarantees: attribute-safe escaping, https-only external URLs,
//   prototype-safe caches, bounded concurrency, per-scan caps,
//   composite risk veto, persistent deployer reputation.
// ═══════════════════════════════════════════════════════════════════

window.W = window.W || {};

// ═══════════════════════════════════════════════════════════════════
// MODULE 1 — W.walletGraph
// Local behavioural clustering for meme-token launches.
// No new network calls. Consumes holder lists already returned by
// the observation pipeline, optionally merged with caller-supplied
// funding edges (from an indexer). Prototype-safe. Bounded.
// ═══════════════════════════════════════════════════════════════════

W.walletGraph = (() => {
  // ── Constants ───────────────────────────────────────
  const MAX_NODES = 2000; // per token
  const MAX_EDGES = 8000; // per token
  const MAX_GRAPH_CACHE = 64; // session

  const CONF = Object.freeze({
    STRONG: 0.85, // direct funding edge, or same-tx co-buy
    MEDIUM: 0.6, // near-identical amounts + tight timing
    WEAK: 0.35, // shared source tag + loose timing
  });

  const CO_TIMING_WINDOW_MS = 4000;
  const AMOUNT_TOLERANCE = 0.08;
  const MATERIAL_SHARE_PCT = 8;

  // ── Prototype-safe map ─────────────────────────────
  function newMap() {
    return Object.create(null);
  }

  // ── Normalisation ───────────────────────────────────
  function addrKey(chainKey, address) {
    if (typeof address !== "string" || !address) return null;
    if (typeof chainKey !== "string" || !chainKey) return null;
    return chainKey === "solana" ? address : address.toLowerCase();
  }

  function timingProximity(t1, t2) {
    if (!Number.isFinite(t1) || !Number.isFinite(t2)) return 0;
    const d = Math.abs(t1 - t2);
    if (d <= CO_TIMING_WINDOW_MS) return 1;
    if (d <= CO_TIMING_WINDOW_MS * 4) return 0.5;
    if (d <= CO_TIMING_WINDOW_MS * 20) return 0.2;
    return 0;
  }

  function amountProximity(a, b) {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
    if (a <= 0 && b <= 0) return 1;
    const denom = Math.max(Math.abs(a), Math.abs(b), 1);
    const delta = Math.abs(a - b) / denom;
    if (delta <= AMOUNT_TOLERANCE) return 1;
    if (delta <= AMOUNT_TOLERANCE * 3) return 0.5;
    return 0;
  }

  function sourceSimilarity(srcA, srcB) {
    if (!srcA || !srcB) return 0;
    if (srcA === srcB) return 0.5; // shared CEX hot wallet is weak evidence
    return 0;
  }

  // ── Union-Find ─────────────────────────────────────
  function makeUF(size) {
    const parent = new Int32Array(size);
    for (let i = 0; i < size; i++) parent[i] = i;
    function find(x) {
      let r = x;
      while (parent[r] !== r) r = parent[r];
      while (parent[x] !== r) {
        const n = parent[x];
        parent[x] = r;
        x = n;
      }
      return r;
    }
    function union(a, b) {
      const ra = find(a),
        rb = find(b);
      if (ra === rb) return false;
      parent[rb] = ra;
      return true;
    }
    return { find, union };
  }

  // ── Edge builders ──────────────────────────────────
  function buildHolderEdges(holders) {
    const nodes = [];
    const edges = [];
    if (!Array.isArray(holders) || holders.length < 2) return { nodes, edges };

    const idx = newMap();
    for (let i = 0; i < holders.length && nodes.length < MAX_NODES; i++) {
      const h = holders[i];
      if (!h || typeof h.address !== "string" || !h.address) continue;
      const key = h.address.toLowerCase();
      if (key in idx) continue;
      idx[key] = nodes.length;
      nodes.push({
        address: h.address,
        pct: Number(h.pct) || 0,
        boughtAt: Number(h.boughtAt) || 0,
        amount: Number(h.amount) || 0,
        fundingSource:
          typeof h.fundingSource === "string" ? h.fundingSource : null,
      });
    }
    if (nodes.length < 2) return { nodes, edges };

    outer: for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (edges.length >= MAX_EDGES) break outer;
        const a = nodes[i],
          b = nodes[j];

        const tScore = timingProximity(a.boughtAt, b.boughtAt);
        const aScore = amountProximity(a.amount, b.amount);
        const sScore = sourceSimilarity(a.fundingSource, b.fundingSource);

        let weight = 0;
        if (tScore && aScore) weight = Math.max(weight, tScore * aScore);
        if (sScore && tScore) weight = Math.max(weight, sScore * tScore * 0.8);
        if (sScore && aScore) weight = Math.max(weight, sScore * aScore * 0.6);

        if (weight >= CONF.WEAK) {
          edges.push({ a: i, b: j, weight, kind: "behavioral" });
        }
      }
    }
    return { nodes, edges };
  }

  function mergeFundingEdges(nodes, edges, fundingEdges) {
    if (!Array.isArray(fundingEdges) || !fundingEdges.length) return;
    const idx = newMap();
    for (let i = 0; i < nodes.length; i++)
      idx[nodes[i].address.toLowerCase()] = i;
    for (const fe of fundingEdges) {
      if (!fe || typeof fe.from !== "string" || typeof fe.to !== "string")
        continue;
      const ai = idx[fe.from.toLowerCase()];
      const bi = idx[fe.to.toLowerCase()];
      if (ai === undefined || bi === undefined) continue;
      const w = Number.isFinite(Number(fe.weight))
        ? Number(fe.weight)
        : CONF.STRONG;
      edges.push({
        a: ai,
        b: bi,
        weight: Math.max(0, Math.min(1, w)),
        kind: "funding",
      });
    }
  }

  // ── Clustering ─────────────────────────────────────
  function cluster(nodes, edges) {
    const uf = makeUF(nodes.length);
    const sorted = edges.slice().sort((x, y) => y.weight - x.weight);
    for (const e of sorted) {
      if (e.weight >= CONF.MEDIUM) uf.union(e.a, e.b);
    }

    const groups = newMap();
    for (let i = 0; i < nodes.length; i++) {
      const r = uf.find(i);
      if (!(r in groups)) groups[r] = [];
      groups[r].push(i);
    }

    // Strongest edge per root.
    const maxWeightByRoot = newMap();
    for (const e of edges) {
      const ra = uf.find(e.a);
      const rb = uf.find(e.b);
      if (ra !== rb) continue; // cross-cluster edge
      const rs = String(ra);
      if (!(rs in maxWeightByRoot) || e.weight > maxWeightByRoot[rs]) {
        maxWeightByRoot[rs] = e.weight;
      }
    }

    const clusters = [];
    for (const rootStr of Object.keys(groups)) {
      const memberIdx = groups[rootStr];
      if (memberIdx.length < 2) continue;

      let totalPct = 0;
      let totalAmount = 0;
      const addrs = [];
      for (const i of memberIdx) {
        totalPct += nodes[i].pct;
        totalAmount += nodes[i].amount;
        addrs.push(nodes[i].address);
      }

      const confidence = Math.min(1, maxWeightByRoot[rootStr] || 0);
      clusters.push({
        members: addrs,
        memberCount: memberIdx.length,
        totalPct,
        totalAmount,
        confidence,
        material: totalPct >= MATERIAL_SHARE_PCT && memberIdx.length >= 3,
      });
    }

    clusters.sort((a, b) => b.totalPct - a.totalPct);
    return clusters;
  }

  // ── Public analyse ─────────────────────────────────
  function analyse(chainKey, address, holders, fundingEdges) {
    const key = addrKey(chainKey, address);
    if (!key) return null;

    const { nodes, edges } = buildHolderEdges(holders);
    if (!nodes || nodes.length < 2) {
      return {
        clusters: [],
        materialClusters: [],
        clusteredSharePct: 0,
        topClusterPct: 0,
        nodeCount: nodes ? nodes.length : 0,
        edgeCount: 0,
        truncated: false,
      };
    }

    mergeFundingEdges(nodes, edges, fundingEdges);

    const truncated = nodes.length >= MAX_NODES || edges.length >= MAX_EDGES;
    const clusters = cluster(nodes, edges);

    // Precompute address → pct for the clustered-share calculation.
    const pctByAddr = newMap();
    for (const n of nodes) pctByAddr[n.address.toLowerCase()] = n.pct;

    const seen = newMap();
    let clusteredShare = 0;
    for (const c of clusters) {
      for (const a of c.members) {
        const k = a.toLowerCase();
        if (!(k in seen)) {
          seen[k] = 1;
          clusteredShare += pctByAddr[k] || 0;
        }
      }
    }

    return {
      clusters,
      materialClusters: clusters.filter((c) => c.material),
      clusteredSharePct: clusteredShare,
      topClusterPct: clusters.length ? clusters[0].totalPct : 0,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      truncated,
    };
  }

  // ── Cache ──────────────────────────────────────────
  let cache = newMap();
  let cacheOrder = [];

  function cacheKey(chainKey, address) {
    const k = addrKey(chainKey, address);
    return k ? chainKey + ":" + k : null;
  }

  function get(chainKey, address) {
    const k = cacheKey(chainKey, address);
    if (!k) return null;
    return cache[k] || null;
  }

  function set(chainKey, address, report) {
    const k = cacheKey(chainKey, address);
    if (!k) return;
    cache[k] = report;
    cacheOrder.push(k);
    while (cacheOrder.length > MAX_GRAPH_CACHE) {
      const evict = cacheOrder.shift();
      delete cache[evict];
    }
  }

  // ── Summary & risk contribution ────────────────────
  function summarise(report) {
    if (!report) return "";
    if (!report.clusters.length) return "No behavioural clusters detected";
    const top = report.clusters[0];
    const pct = top.totalPct.toFixed(1);
    const conf = Math.round(top.confidence * 100);
    const mat = report.materialClusters.length
      ? ` · ${report.materialClusters.length} material`
      : "";
    return `${top.memberCount} wallets · ${pct}% supply · ${conf}% conf${mat}`;
  }

  function riskContribution(report) {
    if (!report) return { weight: 0, flags: [] };
    const flags = [];
    let weight = 0;

    if (report.materialClusters.length >= 1) {
      const top = report.materialClusters[0];
      const pct = top.totalPct;
      const conf = top.confidence;
      if (pct >= 20 && conf >= CONF.STRONG) {
        weight += 35;
        flags.push(
          `🚩 ${top.memberCount} linked wallets hold ${pct.toFixed(1)}% (${Math.round(conf * 100)}% conf)`,
        );
      } else if (pct >= 12 && conf >= CONF.MEDIUM) {
        weight += 20;
        flags.push(
          `⚠️ ${top.memberCount} linked wallets hold ${pct.toFixed(1)}%`,
        );
      } else if (pct >= MATERIAL_SHARE_PCT) {
        weight += 10;
        flags.push(
          `ℹ️ ${top.memberCount} weakly-linked wallets hold ${pct.toFixed(1)}%`,
        );
      }
    }

    if (report.clusteredSharePct >= 40) {
      weight += 15;
      flags.push(
        `⚠️ ${report.clusteredSharePct.toFixed(1)}% of supply sits in behavioural clusters`,
      );
    }

    return { weight: Math.min(50, weight), flags };
  }

  return {
    analyse,
    get,
    set,
    summarise,
    riskContribution,
    _internal: {
      addrKey,
      timingProximity,
      amountProximity,
      sourceSimilarity,
      buildHolderEdges,
      mergeFundingEdges,
      cluster,
      CONF,
      resetCache: () => {
        cache = newMap();
        cacheOrder = [];
      },
    },
  };
})();

console.log(
  "[WalletGraph] Module loaded — behavioural clustering, prototype-safe.",
);

// ═══════════════════════════════════════════════════════════════════
// MODULE 2 — W.securityAdapters
// External security API adapters: GoPlus (EVM), RugCheck (Solana),
// honeypot.is (both). Returns a normalised assessment shape so the
// risk engine does not care which provider answered.
// ═══════════════════════════════════════════════════════════════════

W.securityAdapters = (() => {
  const TIMEOUT_MS = 9000;
  const GOPLUS_BASE = "https://api.gopluslabs.io/api/v1";
  const RUGCHECK_BASE = "https://api.rugcheck.xyz/v1";
  const HONEYPOT_BASE = "https://api.honeypot.is/v2";

  const GOPLUS_CHAIN_IDS = Object.freeze({
    ethereum: "1",
    bsc: "56",
    polygon: "137",
    arbitrum: "42161",
    base: "8453",
    avalanche: "43114",
    optimism: "10",
  });

  const HONEYPOT_CHAINS = Object.freeze({
    ethereum: "1",
    bsc: "56",
    base: "8453",
    arbitrum: "42161",
    polygon: "137",
    avalanche: "43114",
    solana: "solana",
  });

  async function fetchJson(url, opts = {}) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const resp = await fetch(url, { ...opts, signal: controller.signal });
      clearTimeout(t);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    } catch (e) {
      clearTimeout(t);
      throw e;
    }
  }

  function bool(v) {
    if (v === true || v === "1" || v === 1) return true;
    if (v === false || v === "0" || v === 0) return false;
    return null;
  }

  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── GoPlus (EVM) ───────────────────────────────────
  async function fromGoPlus(chainKey, address) {
    const chainId = GOPLUS_CHAIN_IDS[chainKey];
    if (!chainId)
      return { source: "goplus", ok: false, reason: "unsupported-chain" };
    if (typeof address !== "string" || !address) {
      return { source: "goplus", ok: false, reason: "no-address" };
    }
    const url = `${GOPLUS_BASE}/token_security/${chainId}?contract_addresses=${encodeURIComponent(address)}`;
    let json;
    try {
      json = await fetchJson(url);
    } catch (e) {
      return { source: "goplus", ok: false, reason: e.message };
    }

    const entry = json && json.result && json.result[address.toLowerCase()];
    if (!entry) return { source: "goplus", ok: false, reason: "no-data" };

    const notAssessed = [];
    if (entry.is_honeypot === undefined) notAssessed.push("honeypot");
    if (entry.cannot_sell_all === undefined)
      notAssessed.push("cannot_sell_all");
    if (entry.is_mintable === undefined) notAssessed.push("mintable");
    if (entry.lp_holder_count === undefined)
      notAssessed.push("lp_holder_count");

    const buyTax = num(entry.buy_tax);
    const sellTax = num(entry.sell_tax);
    const ownerPct = num(entry.owner_percent);
    const top10 = num(entry.top_10_holder_rate);

    return {
      source: "goplus",
      ok: true,
      honeypot: bool(entry.is_honeypot),
      canSell:
        bool(entry.cannot_sell_all) === true
          ? false
          : bool(entry.cannot_sell_all) === false
            ? true
            : null,
      ownerCanMint: bool(entry.is_mintable),
      liquidityLocked: null,
      lockDurationDays: null,
      ownerBalancePct: ownerPct !== null ? ownerPct * 100 : null,
      top10Pct: top10 !== null ? top10 * 100 : null,
      buyTax: buyTax !== null ? buyTax * 100 : null,
      sellTax: sellTax !== null ? sellTax * 100 : null,
      rawFlags: Array.isArray(entry.risk_flags) ? entry.risk_flags : [],
      notAssessed,
    };
  }

  // ── RugCheck (Solana) ──────────────────────────────
  async function fromRugCheck(chainKey, address) {
    if (chainKey !== "solana")
      return { source: "rugcheck", ok: false, reason: "unsupported-chain" };
    if (typeof address !== "string" || !address) {
      return { source: "rugcheck", ok: false, reason: "no-address" };
    }
    const url = `${RUGCHECK_BASE}/tokens/${encodeURIComponent(address)}/report/summary`;
    let json;
    try {
      json = await fetchJson(url);
    } catch (e) {
      return { source: "rugcheck", ok: false, reason: e.message };
    }

    const risks = Array.isArray(json.risks) ? json.risks : [];
    const riskNames = risks
      .map((r) => (r && (r.name || r.type)) || "")
      .filter(Boolean);
    const has = (needle) =>
      riskNames.some((n) => n.toLowerCase().includes(needle));

    const notAssessed = [];
    if (json.mintAuthority === undefined) notAssessed.push("mint_authority");
    if (json.freezeAuthority === undefined)
      notAssessed.push("freeze_authority");
    if (json.topHoldersPercent === undefined) notAssessed.push("top_holders");

    const creatorBalance = num(json.creatorBalance);
    const topHolders = num(json.topHoldersPercent);

    return {
      source: "rugcheck",
      ok: true,
      honeypot: has("honeypot") || null,
      canSell: has("cannot sell") ? false : null,
      ownerCanMint:
        bool(json.mintAuthority) === true
          ? true
          : bool(json.mintAuthority) === false
            ? false
            : null,
      liquidityLocked: has("lp unlocked")
        ? false
        : has("lp locked")
          ? true
          : null,
      lockDurationDays: null,
      ownerBalancePct: creatorBalance !== null ? creatorBalance * 100 : null,
      top10Pct: topHolders !== null ? topHolders : null,
      buyTax: null,
      sellTax: null,
      rawFlags: riskNames,
      notAssessed,
      providerScore: num(json.score),
    };
  }

  // ── honeypot.is (EVM + Solana) ─────────────────────
  async function fromHoneypotIs(chainKey, address) {
    const chain = HONEYPOT_CHAINS[chainKey];
    if (!chain)
      return { source: "honeypot", ok: false, reason: "unsupported-chain" };
    if (typeof address !== "string" || !address) {
      return { source: "honeypot", ok: false, reason: "no-address" };
    }
    const url = `${HONEYPOT_BASE}/IsHoneypot?address=${encodeURIComponent(address)}&chainID=${encodeURIComponent(chain)}`;
    let json;
    try {
      json = await fetchJson(url);
    } catch (e) {
      return { source: "honeypot", ok: false, reason: e.message };
    }

    const flags = [];
    if (json.honeypotResult && json.honeypotResult.isHoneypot === true)
      flags.push("honeypot");
    if (Array.isArray(json.summary && json.summary.flags))
      flags.push(...json.summary.flags);

    const simulationSuccess = json.simulationSuccess === true;
    const buyTax = num(json.simulationResult && json.simulationResult.buyTax);
    const sellTax = num(json.simulationResult && json.simulationResult.sellTax);

    const notAssessed = [];
    if (!simulationSuccess) notAssessed.push("simulation");

    return {
      source: "honeypot",
      ok: true,
      honeypot: json.honeypotResult
        ? bool(json.honeypotResult.isHoneypot)
        : null,
      canSell: simulationSuccess
        ? json.simulationResult && json.simulationResult.sellTax !== undefined
          ? true
          : null
        : null,
      ownerCanMint: null,
      liquidityLocked: null,
      lockDurationDays: null,
      ownerBalancePct: null,
      top10Pct: null,
      buyTax: buyTax !== null ? buyTax : null,
      sellTax: sellTax !== null ? sellTax : null,
      rawFlags: flags,
      notAssessed,
    };
  }

  // ── Merge ──────────────────────────────────────────
  function mergeAssessments(list) {
    const merged = {
      source: list.map((a) => a.source).join("+"),
      ok: true,
      honeypot: null,
      canSell: null,
      ownerCanMint: null,
      liquidityLocked: null,
      lockDurationDays: null,
      ownerBalancePct: null,
      top10Pct: null,
      buyTax: null,
      sellTax: null,
      rawFlags: [],
      notAssessed: [],
    };

    for (const a of list) {
      // Boolean OR-with-pessimism: any `true` for a risk wins.
      if (a.honeypot === true) merged.honeypot = true;
      else if (merged.honeypot === null && a.honeypot === false)
        merged.honeypot = false;

      if (a.canSell === false) merged.canSell = false;
      else if (merged.canSell === null && a.canSell === true)
        merged.canSell = true;

      if (a.ownerCanMint === true) merged.ownerCanMint = true;
      else if (merged.ownerCanMint === null && a.ownerCanMint === false)
        merged.ownerCanMint = false;

      if (a.liquidityLocked === false) merged.liquidityLocked = false;
      else if (merged.liquidityLocked === null && a.liquidityLocked === true)
        merged.liquidityLocked = true;

      if (a.lockDurationDays !== null && a.lockDurationDays !== undefined) {
        merged.lockDurationDays =
          merged.lockDurationDays === null
            ? a.lockDurationDays
            : Math.min(merged.lockDurationDays, a.lockDurationDays);
      }
      if (a.ownerBalancePct !== null) {
        merged.ownerBalancePct =
          merged.ownerBalancePct === null
            ? a.ownerBalancePct
            : Math.max(merged.ownerBalancePct, a.ownerBalancePct);
      }
      if (a.top10Pct !== null) {
        merged.top10Pct =
          merged.top10Pct === null
            ? a.top10Pct
            : Math.max(merged.top10Pct, a.top10Pct);
      }
      if (a.buyTax !== null) {
        merged.buyTax =
          merged.buyTax === null ? a.buyTax : Math.max(merged.buyTax, a.buyTax);
      }
      if (a.sellTax !== null) {
        merged.sellTax =
          merged.sellTax === null
            ? a.sellTax
            : Math.max(merged.sellTax, a.sellTax);
      }

      merged.rawFlags.push(...(a.rawFlags || []));
      merged.notAssessed.push(...(a.notAssessed || []));
    }

    merged.rawFlags = Array.from(new Set(merged.rawFlags));
    merged.notAssessed = Array.from(new Set(merged.notAssessed));
    return merged;
  }

  // ── Router ─────────────────────────────────────────
  async function assess(chainKey, address, { merge = false } = {}) {
    const calls = [];
    if (chainKey === "solana") {
      calls.push(fromRugCheck(chainKey, address));
      if (merge) calls.push(fromHoneypotIs(chainKey, address));
    } else {
      calls.push(fromGoPlus(chainKey, address));
      if (merge) calls.push(fromHoneypotIs(chainKey, address));
    }
    const results = await Promise.allSettled(calls);
    const ok = results
      .filter((r) => r.status === "fulfilled" && r.value && r.value.ok)
      .map((r) => r.value);
    if (!ok.length) {
      return {
        ok: false,
        reason: "all-providers-failed",
        attempts: results.length,
      };
    }
    if (ok.length === 1) return { ...ok[0], ok: true };
    return mergeAssessments(ok);
  }

  return {
    assess,
    fromGoPlus,
    fromRugCheck,
    fromHoneypotIs,
    GOPLUS_CHAIN_IDS,
    HONEYPOT_CHAINS,
    _internal: { mergeAssessments, bool, num },
  };
})();

console.log(
  "[SecurityAdapters] Module loaded — GoPlus / RugCheck / honeypot.is.",
);

// ═══════════════════════════════════════════════════════════════════
// MODULE 3 — W.gems
// Scanner, composite risk engine, persistent deployer reputation,
// UI rendering. Consumes W.walletGraph and W.securityAdapters.
// ═══════════════════════════════════════════════════════════════════

W.gems = (() => {
  // ── Constants ──────────────────────────────────────
  const DEXSCREENER_API = "https://api.dexscreener.com";
  const PROXIES = [(u) => u];

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
  const RISK_VERSION = "risk-v1";

  const MAX_FRESH_SHIELD_PER_SCAN = 12;
  const SHIELD_CONCURRENCY = 4;
  const MAX_FRESH_DEPLOYER_PER_SCAN = 6;
  const DEPLOYER_CONCURRENCY = 3;
  const SHIELD_CACHE_TTL = 300000;
  const FETCH_TIMEOUT_MS = 9000;

  const DEPLOYER_STORE_KEY = "gems.deployerHistory.v1";
  const DEPLOYER_STORE_MAX = 500;

  // ── Risk weights (explicit, auditable) ─────────────
  const RISK_WEIGHTS = Object.freeze({
    honeypot: 100,
    cannotSell: 100,
    highSellTax: 20,
    midSellTax: 10,
    simulationUnavailable: 10,
    deployerRugHistory: 50,
    deployerSerialLauncher: 30,
    ownerCanMint: 30,
    liquidityUnlockedNew: 25,
    liquidityShortLock: 15,
    concentrationExtreme: 25,
    concentrationHigh: 15,
    sybilPattern: 30,
    microLiquidity: 20,
    newPairHighMomentum: 15,
    ownerRetainsSupply: 20,
  });

  const VERDICT = Object.freeze({
    PASS: { key: "pass", label: "✅ Pass", cls: "verdict-pass" },
    CAUTION: { key: "caution", label: "⚠️ Caution", cls: "verdict-caution" },
    DANGER: { key: "danger", label: "🚫 Danger", cls: "verdict-danger" },
    UNKNOWN: { key: "unknown", label: "❔ Unverified", cls: "verdict-unknown" },
  });

  // ── Escaping (attribute-safe) ──────────────────────
  function esc(v) {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (!/[&<>"']/.test(s)) return s;
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

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

  function newMap() {
    return Object.create(null);
  }

  // ── Format helpers ─────────────────────────────────
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

  function shieldCacheKey(address, chainKey) {
    if (typeof address !== "string" || !address.trim()) return null;
    if (typeof chainKey !== "string" || !chainKey) return null;
    if (!CHAINS[chainKey]) return null;
    const normalized = chainKey === "solana" ? address : address.toLowerCase();
    return chainKey + ":" + normalized;
  }

  // ── Deployer reputation store ──────────────────────
  function loadDeployerStore() {
    try {
      const raw = localStorage.getItem(DEPLOYER_STORE_KEY);
      if (!raw) return newMap();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return newMap();
      const out = newMap();
      for (const k of Object.keys(parsed)) {
        const v = parsed[k];
        if (v && typeof v === "object") {
          const rugs = Number(v.rugs);
          const tokens = Number(v.tokens);
          const lastSeen = Number(v.lastSeen);
          out[k] = {
            rugs: Number.isFinite(rugs) && rugs > 0 ? Math.floor(rugs) : 0,
            tokens:
              Number.isFinite(tokens) && tokens > 0 ? Math.floor(tokens) : 0,
            lastSeen: Number.isFinite(lastSeen) && lastSeen > 0 ? lastSeen : 0,
          };
        }
      }
      return out;
    } catch {
      return newMap();
    }
  }

  let deployerStore = loadDeployerStore();

  function saveDeployerStore() {
    try {
      const keys = Object.keys(deployerStore);
      if (keys.length > DEPLOYER_STORE_MAX) {
        keys
          .sort(
            (a, b) =>
              (deployerStore[a].lastSeen || 0) -
              (deployerStore[b].lastSeen || 0),
          )
          .slice(0, keys.length - DEPLOYER_STORE_MAX)
          .forEach((k) => {
            delete deployerStore[k];
          });
      }
      localStorage.setItem(DEPLOYER_STORE_KEY, JSON.stringify(deployerStore));
    } catch (e) {
      console.warn("[Gems] Deployer store write failed:", e && e.message);
    }
  }

  function deployerStoreKey(chainKey, deployer) {
    if (typeof deployer !== "string" || !deployer.trim()) return null;
    if (!CHAINS[chainKey]) return null;
    const norm = chainKey === "solana" ? deployer : deployer.toLowerCase();
    return chainKey + ":" + norm;
  }

  function getDeployerHistory(chainKey, deployer) {
    const k = deployerStoreKey(chainKey, deployer);
    if (!k) return null;
    return deployerStore[k] || null;
  }

  function recordDeployerSeen(chainKey, deployer, isRug) {
    const k = deployerStoreKey(chainKey, deployer);
    if (!k) return;
    const cur = deployerStore[k] || { rugs: 0, tokens: 0, lastSeen: 0 };
    cur.tokens += 1;
    if (isRug) cur.rugs += 1;
    cur.lastSeen = Date.now();
    deployerStore[k] = cur;
    saveDeployerStore();
  }

  // ── Shield eligibility ─────────────────────────────
  function isShieldEligible(gem) {
    const addr =
      gem && gem.pair && gem.pair.baseToken ? gem.pair.baseToken.address : null;
    if (typeof addr !== "string" || !addr.trim()) return false;
    const chainKey = gem.pair.chainId;
    if (!chainKey || !CHAINS[chainKey]) return false;
    if (!W.shield || !W.shield.CHAINS || !W.shield.CHAINS[chainKey]) {
      // External adapters can still cover this chain even if internal
      // Shield can't. Treat as eligible so the fallback path runs.
      return !!W.securityAdapters;
    }
    return true;
  }

  function isHighRisk(shield) {
    if (!shield) return false;
    return (
      W.shield &&
      typeof W.shield.isHighRisk === "function" &&
      W.shield.isHighRisk(shield)
    );
  }

  // ── Composite risk engine ──────────────────────────
  function computeRiskAssessment(gem, shield, observation, graphReport) {
    const flags = [];
    let risk = 0;
    const add = (weight, text) => {
      risk += weight;
      flags.push({ weight, text });
    };

    const pair = gem && gem.pair;
    const analysis = gem && gem.analysis;
    const chainKey = pair && pair.chainId;
    const baseToken = (pair && pair.baseToken) || {};

    // ── Shield-derived signals ───────────────────────
    let shieldPresent = false;
    if (shield && !shield.unsupported && !shield.error && !shield.noData) {
      shieldPresent = true;

      // ── Authoritative high-risk check ─────────────────────
      // Defer to W.shield.isHighRisk as the single source of truth.
      if (isHighRisk(shield)) {
        add(RISK_WEIGHTS.honeypot, "🚩 Shield identified high risk");
      }

      const honeypot =
        shield.honeypot === true ||
        shield.isHoneypot === true ||
        shield.canSell === false ||
        shield.sellable === false;
      if (honeypot) add(RISK_WEIGHTS.honeypot, "🚩 Honeypot — cannot sell");

      const canMint =
        shield.ownerCanMint === true ||
        shield.mintable === true ||
        shield.canMint === true;
      if (canMint)
        add(RISK_WEIGHTS.ownerCanMint, "🚩 Owner can mint new supply");

      const ownerPct = Number(shield.ownerBalancePct);
      const ownerRetains =
        shield.ownerRetainsSupply === true ||
        (Number.isFinite(ownerPct) && ownerPct >= 5);
      if (ownerRetains)
        add(RISK_WEIGHTS.ownerRetainsSupply, "⚠️ Owner holds ≥5% supply");

      const sellTax = Number(shield.sellTax);
      if (Number.isFinite(sellTax) && sellTax > 10) {
        add(RISK_WEIGHTS.highSellTax, `🚩 Sell tax ${sellTax.toFixed(0)}%`);
      } else if (Number.isFinite(sellTax) && sellTax > 5) {
        add(RISK_WEIGHTS.midSellTax, `⚠️ Sell tax ${sellTax.toFixed(0)}%`);
      }

      const locked =
        shield.liquidityLocked === true || shield.lpLocked === true;
      const lockDays = Number(shield.lockDurationDays);
      const ageH =
        analysis && Number.isFinite(analysis.ageH) ? analysis.ageH : 0;
      if (!locked && ageH < 24) {
        add(
          RISK_WEIGHTS.liquidityUnlockedNew,
          "🚩 Liquidity unlocked on a <24h pair",
        );
      } else if (Number.isFinite(lockDays) && lockDays > 0 && lockDays < 7) {
        add(
          RISK_WEIGHTS.liquidityShortLock,
          `⚠️ LP locked only ${Math.round(lockDays)}d`,
        );
      }

      if (
        Array.isArray(shield.notAssessed) &&
        shield.notAssessed.includes("simulation")
      ) {
        add(
          RISK_WEIGHTS.simulationUnavailable,
          "ℹ️ Sell simulation unavailable — verify manually",
        );
      }
    }

    // ── Market structure signals ─────────────────────
    let structurePresent = false;
    if (observation && observation.concentration) {
      const c = observation.concentration;
      const top10 = Number(c.top10Pct);
      if (Number.isFinite(top10)) {
        structurePresent = true;
        if (top10 >= 70) {
          add(
            RISK_WEIGHTS.concentrationExtreme,
            `🚩 Top 10 hold ${top10.toFixed(1)}%`,
          );
        } else if (top10 >= 50) {
          add(
            RISK_WEIGHTS.concentrationHigh,
            `⚠️ Top 10 hold ${top10.toFixed(1)}%`,
          );
        }
      }
    }

    // ── Coordination heuristic ───────────────────────
    if (
      analysis &&
      Number.isFinite(analysis.ageH) &&
      analysis.ageH < 6 &&
      Number.isFinite(analysis.h24) &&
      analysis.h24 > 100 &&
      structurePresent
    ) {
      const top10 = Number(observation.concentration.top10Pct);
      if (Number.isFinite(top10) && top10 >= 40) {
        add(
          RISK_WEIGHTS.sybilPattern,
          "🚩 Young + concentrated + pumped — possible coordinated launch",
        );
      }
    }

    // ── Micro-liquidity ──────────────────────────────
    if (analysis && Number.isFinite(analysis.liq) && analysis.liq < 30000) {
      add(RISK_WEIGHTS.microLiquidity, "⚠️ Micro liquidity (<$30k)");
    }

    // ── New-pair momentum anomaly ────────────────────
    if (
      analysis &&
      Number.isFinite(analysis.ageH) &&
      analysis.ageH < 6 &&
      Number.isFinite(analysis.h24) &&
      analysis.h24 > 100 &&
      !flags.some((f) => f.text.startsWith("🚩 Young"))
    ) {
      add(
        RISK_WEIGHTS.newPairHighMomentum,
        "⚠️ <6h old with +100% 24h — dump setup risk",
      );
    }

    // ── Wallet-graph signal ──────────────────────────
    let graphPresent = false;
    if (graphReport && W.walletGraph) {
      graphPresent = true;
      const contrib = W.walletGraph.riskContribution(graphReport);
      if (contrib.weight > 0) {
        risk += contrib.weight;
        contrib.flags.forEach((t) =>
          flags.push({ weight: contrib.weight, text: t }),
        );
      }
    }

    // ── Deployer reputation ──────────────────────────
    let deployerPresent = false;
    let deployerAddr = null;
    if (shield && shield.creator && typeof shield.creator === "object") {
      const c = shield.creator;
      if (typeof c.address === "string" && c.address.trim()) {
        deployerAddr = c.address;
        const hist = getDeployerHistory(chainKey, deployerAddr);
        if (hist) {
          deployerPresent = true;
          if (hist.rugs >= 2) {
            add(
              RISK_WEIGHTS.deployerRugHistory,
              `🚩 Deployer linked to ${hist.rugs} prior high-risk launches`,
            );
          } else if (hist.tokens >= 5) {
            add(
              RISK_WEIGHTS.deployerSerialLauncher,
              `⚠️ Serial launcher — ${hist.tokens} tokens deployed`,
            );
          }
        }
      }
    }

    // ── Verdict ──────────────────────────────────────
    const capped = Math.max(0, Math.min(100, risk));
    const anySignal =
      shieldPresent || structurePresent || deployerPresent || graphPresent;

    let verdict;
    if (!anySignal) {
      verdict = VERDICT.UNKNOWN;
    } else if (capped >= 60) {
      verdict = VERDICT.DANGER;
    } else if (capped >= 25) {
      verdict = VERDICT.CAUTION;
    } else {
      verdict = VERDICT.PASS;
    }

    flags.sort((a, b) => b.weight - a.weight);

    return {
      risk: capped,
      flags,
      verdict,
      version: RISK_VERSION,
      deployerAddr,
      shieldPresent,
      structurePresent,
      deployerPresent,
      graphPresent,
    };
  }

  // ── Risk badge / flag renderers ────────────────────
  function riskBadge(assessment) {
    const v = (assessment && assessment.verdict) || VERDICT.UNKNOWN;
    const risk = assessment ? assessment.risk : null;
    const suffix = Number.isFinite(risk) ? ` · risk ${risk}` : "";
    return `<span class="tag risk-badge ${esc(v.cls)}" title="Composite risk ${esc(assessment?.version || "")}">${esc(v.label)}${esc(suffix)}</span>`;
  }

  function riskFlagsBlock(assessment) {
    if (!assessment || !assessment.flags.length) return "";
    const items = assessment.flags
      .slice(0, 5)
      .map((f) => `<li>${esc(f.text)}</li>`)
      .join("");
    return `<div class="kv-row"><span class="muted">Risk flags</span><span></span></div><ul class="tx-list risk-flags">${items}</ul>`;
  }

  // ── Market structure / trajectory / owner / deployer ──
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
    if (l && l.status !== "unknown") parts.push(`LP: ${l.status}`);
    if (!parts.length) return "";
    return `<div class="kv-row"><span class="muted">Structure</span><span>${esc(parts.join(" · "))}</span></div>`;
  }

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

  // ── Observation recording ──────────────────────────
  function recordObservation(gem) {
    if (!W.observations || typeof W.observations.record !== "function")
      return false;
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

  function observeOwner(gem) {
    if (
      !W.ownerAssociations ||
      typeof W.ownerAssociations.observe !== "function"
    )
      return null;
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

  async function observeDeployer(gem) {
    if (!W.deployerGraph || typeof W.deployerGraph.observe !== "function")
      return null;
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
    if (typeof creator.address !== "string" || !creator.address.trim())
      return null;

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

  // ── Momentum scoring ───────────────────────────────
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

  // ── Scan state ─────────────────────────────────────
  let auto = false;
  let timer = null;
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

  // ── Shield check with external fallback/merge ──────
  async function checkShield(addr, chainKey, identity = {}) {
    const key = shieldCacheKey(addr, chainKey);
    if (!key) return { error: true, message: "Invalid address or chain" };

    const cached = getCachedShield(key);
    if (cached) {
      W.shield?.rememberEvidence?.(
        { ...identity, address: addr, chain: chainKey },
        cached,
      );
      return cached;
    }

    // Path 1: no internal Shield for this chain → external only.
    if (!W.shield || !W.shield.CHAINS || !W.shield.CHAINS[chainKey]) {
      if (W.securityAdapters) {
        try {
          const ext = await W.securityAdapters.assess(chainKey, addr, {
            merge: true,
          });
          const result = ext.ok ? { ...ext, external: true } : { noData: true };
          setCachedShield(key, result);
          return result;
        } catch (e) {
          const result = { error: true, message: e.message };
          setCachedShield(key, result);
          return result;
        }
      }
      const result = { unsupported: true };
      setCachedShield(key, result);
      return result;
    }

    // Path 2: internal Shield available → use it, merge externals if thin.
    try {
      const assessment = await W.shield.check(addr, chainKey);
      let result = assessment ? { ...assessment, ok: true } : { noData: true };

      const thin =
        !result ||
        result.noData ||
        (result.honeypot === undefined && result.ownerCanMint === undefined);

      if (thin && W.securityAdapters) {
        try {
          const ext = await W.securityAdapters.assess(chainKey, addr, {
            merge: true,
          });
          if (ext.ok) result = { ...result, ...ext, mergedExternal: true };
        } catch {
          /* non-fatal: internal result still used */
        }
      }

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

  function shieldSummary(s) {
    if (!s) return "🛡️ Shield: not checked";
    if (s.unsupported) return "🛡️ Shield: not available for this chain";
    if (s.error) return "🛡️ Shield: check failed — verify manually";
    if (s.noData) return "🛡️ Shield: no security data found";
    const level = s.riskLevel && s.riskLevel[0] ? s.riskLevel[0] : "—";
    const score = Number.isFinite(s.riskScore) ? s.riskScore : "—";
    const version = typeof s.scoreVersion === "string" ? s.scoreVersion : null;
    const external = s.external || s.mergedExternal ? " · ext" : "";
    return version
      ? `🛡️ Shield: ${level} (${score}/100 identified-risk score, ${version}${external})`
      : `🛡️ Shield: ${level} (${score}/100 identified-risk score${external})`;
  }

  function autoCreateThesis(gem, addr, shield, assessment) {
    if (!W.theses) return;
    const chain = gem.pair.chainId;
    const sourceRef = { type: "gem", addr, chain };
    if (W.theses.findBySourceRef && W.theses.findBySourceRef(sourceRef)) return;

    const asset = `$${gem.pair.baseToken.symbol} (${chain})`;
    const reasons = (gem.analysis.reasons || []).join("; ");
    const signals = shieldSummary(shield);
    const riskLine = assessment
      ? `Risk verdict: ${assessment.verdict.label} (${assessment.risk}/100, ${assessment.version}). ${assessment.flags.map((f) => f.text).join("; ")}`
      : "";

    W.theses.create({
      asset,
      statement: `Gem Agent alert — score ${gem.analysis.score} (${gem.analysis.scoreVersion}); risk ${assessment ? assessment.verdict.key : "unknown"}. Not financial advice; log the reasoning, decide for yourself.`,
      reasons,
      signals: riskLine ? `${signals}\n${riskLine}` : signals,
      invalidation:
        "Shield verdict turns high-risk, risk flags escalate, liquidity is pulled, or momentum reverses hard — review before acting further.",
      horizon: "Short-term",
      sourceRef,
    });
  }

  // ── Scan ───────────────────────────────────────────
  async function scan(view) {
    if (!view) return;
    const body = view.querySelector("#g-body");
    if (!body) return;
    await _scanImpl(view, body);
  }

  async function _scanImpl(view, body) {
    body.innerHTML = W.ui.spinner();

    try {
      const [boosts, profiles] = await Promise.allSettled([
        fetchDexScreener(DEXSCREENER_API + "/token-boosts/latest/v1"),
        fetchDexScreener(DEXSCREENER_API + "/token-profiles/latest/v1"),
      ]);

      const map = newMap();
      if (boosts.status === "fulfilled" && boosts.value) {
        boosts.value.forEach((b) => {
          if (b && b.tokenAddress) map[b.tokenAddress] = b.totalBoosts || 1;
        });
      }
      if (profiles.status === "fulfilled" && profiles.value) {
        profiles.value.forEach((p) => {
          if (p && p.tokenAddress && !(p.tokenAddress in map))
            map[p.tokenAddress] = 0;
        });
      }

      const addresses = Object.keys(map).slice(0, 30);
      if (!addresses.length) throw new Error("No candidates");

      const pairsResp = await fetchDexScreener(
        DEXSCREENER_API + "/latest/dex/tokens/" + addresses.join(","),
      );

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
      const onlyPass = view.querySelector("#g-only-pass")?.checked || false;

      const results = Object.values(byToken)
        .map((p) => ({ pair: p, analysis: score(p) }))
        .filter((g) => g.analysis.score >= minScore)
        .sort((a, b) => b.analysis.score - a.analysis.score)
        .slice(0, 24);

      // ── Shield enrichment ──────────────────────────
      const eligible = results.filter(isShieldEligible);
      const uncached = [];
      for (const g of eligible) {
        if (uncached.length >= MAX_FRESH_SHIELD_PER_SCAN) break;
        const key = shieldCacheKey(g.pair.baseToken.address, g.pair.chainId);
        if (key && getCachedShield(key)) continue;
        uncached.push(g);
      }
      if (uncached.length)
        await enrichShieldResults(uncached, SHIELD_CONCURRENCY);

      // ── Record observations ────────────────────────
      for (const g of results) {
        recordObservation(g);
        observeOwner(g);
      }

      // ── Deployer enrichment ────────────────────────
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
          if (typeof creator.address !== "string" || !creator.address.trim())
            continue;

          const cached = W.deployerGraph.get(chainKey, addr);
          if (cached) continue;
          deployerUncached.push(g);
        }
        if (deployerUncached.length) {
          await enrichDeployerResults(deployerUncached, DEPLOYER_CONCURRENCY);
        }
      }

      // ── Per-candidate risk assessment ──────────────
      for (const g of results) {
        const addr = g.pair.baseToken.address;
        const chainKey = g.pair.chainId;
        const key = shieldCacheKey(addr, chainKey);
        const shield = key ? getCachedShield(key) : null;
        const observation = buildObservation(shield, g.pair);

        // Wallet graph: build or reuse cluster report.
        let graphReport = null;
        if (
          W.walletGraph &&
          observation &&
          Array.isArray(observation.holders)
        ) {
          graphReport = W.walletGraph.get(chainKey, addr);
          if (!graphReport) {
            graphReport = W.walletGraph.analyse(
              chainKey,
              addr,
              observation.holders,
              observation.fundingEdges || null,
            );
            if (graphReport) W.walletGraph.set(chainKey, addr, graphReport);
          }
        }

        g.risk = computeRiskAssessment(g, shield, observation, graphReport);
        g.shield = shield;
        g.observation = observation;
        g.graphReport = graphReport;
      }

      // ── Deployer reputation bookkeeping ────────────
      for (const g of results) {
        if (!g.risk || !g.risk.deployerAddr) continue;
        recordDeployerSeen(
          g.pair.chainId,
          g.risk.deployerAddr,
          g.risk.verdict.key === "danger",
        );
      }

      // ── Filters ────────────────────────────────────
      const shown = results.filter((g) => {
        if (chainFilter && g.pair.chainId !== chainFilter) return false;
        if (hideRisk && g.risk && g.risk.verdict.key === "danger") return false;
        if (onlyPass && (!g.risk || g.risk.verdict.key !== "pass"))
          return false;
        return true;
      });

      // ── Notifications / theses ─────────────────────
      for (const g of results) {
        const addr = g.pair.baseToken.address;
        const chainKey = g.pair.chainId;
        const cacheKey = shieldCacheKey(addr, chainKey);
        const isDanger = g.risk && g.risk.verdict.key === "danger";
        if (
          g.analysis.score >= 70 &&
          cacheKey &&
          !seen[cacheKey] &&
          !isDanger
        ) {
          const shield = g.shield || null;
          const symbolRaw = g.pair.baseToken.symbol;
          const symbolSafe = esc(symbolRaw);
          const reasonLines = (g.analysis.reasons || [])
            .slice(0, 4)
            .map((r) => "• " + r)
            .join("\n");
          const riskLine = g.risk
            ? `\n${g.risk.verdict.label} — risk ${g.risk.risk}/100` +
              (g.risk.flags.length
                ? "\n" +
                  g.risk.flags
                    .slice(0, 3)
                    .map((f) => "• " + f.text)
                    .join("\n")
                : "")
            : "";
          const msg =
            `🤖 <b>Gem detected:</b> ${symbolSafe} on ${esc(chainKey)} — score ${g.analysis.score} (${esc(g.analysis.scoreVersion)})\n` +
            (reasonLines ? reasonLines + "\n" : "") +
            shieldSummary(shield) +
            riskLine;
          W.ui.toast(
            `Gem detected: ${symbolSafe} — score ${g.analysis.score}`,
            "ok",
            6000,
          );
          if (W.tg) W.tg.notify("gem:" + cacheKey, msg);
          autoCreateThesis(g, addr, shield, g.risk);
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

      // ── Render stats ───────────────────────────────
      const statsEl = view.querySelector("#g-stats");
      if (statsEl) {
        const passed = results.filter(
          (g) => g.risk && g.risk.verdict.key === "pass",
        ).length;
        const danger = results.filter(
          (g) => g.risk && g.risk.verdict.key === "danger",
        ).length;
        statsEl.innerHTML = `
          <div class="card stat"><div class="stat-label">Candidates scanned</div><div class="stat-big">${esc(addresses.length)}</div></div>
          <div class="card stat"><div class="stat-label">Chains covered</div><div class="stat-big">${esc(new Set(results.map((g) => g.pair.chainId)).size)}</div></div>
          <div class="card stat"><div class="stat-label">Gems ≥ ${esc(minScore)}</div><div class="stat-big">${esc(results.length)}${shown.length < results.length ? " (showing " + esc(shown.length) + ")" : ""}</div></div>
          <div class="card stat"><div class="stat-label">✅ Pass / 🚫 Danger</div><div class="stat-big">${esc(passed)} / ${esc(danger)}</div></div>
        `;
      }

      // ── Render cards ───────────────────────────────
      if (shown.length) {
        body.innerHTML = `<div class="grid-2">${shown.map((g) => _renderGemCard(g)).join("")}</div>`;
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
      body.innerHTML = `<p class="muted">Gem scan failed: ${esc(e.message)} — DEX Screener unreachable on this network (try ⟳ or another network).</p>`;
    }
  }

  // ── Card renderer ──────────────────────────────────
  function _renderGemCard(g) {
    const p = g.pair;
    const a = g.analysis;
    const t = p.baseToken || {};
    const addr = t.address;
    const shield = g.shield;
    const assessment = g.risk;

    const shieldSection = shield
      ? `<div class="kv-row"><span class="muted">Security</span><span>${esc(shieldSummary(shield))}</span></div>`
      : `<button class="btn tiny mt" data-shield-check data-addr="${esc(addr)}" data-symbol="${esc(t.symbol)}" data-chain="${esc(p.chainId)}">🛡️ Verify Security</button>`;

    const observation = g.observation;
    const structureSection = marketStructureLine(observation);
    const trajectory = fetchTrajectory(p.chainId, addr);
    const trajectorySection = trajectoryLine(trajectory);

    const graphSection =
      g.graphReport && W.walletGraph
        ? `<div class="kv-row"><span class="muted">Clusters</span><span>${esc(W.walletGraph.summarise(g.graphReport))}</span></div>`
        : "";

    const ownerObservation = W.ownerAssociations
      ? W.ownerAssociations.get(p.chainId, addr)
      : null;
    const ownerSection = ownerLine(ownerObservation);

    const deployerObservation = W.deployerGraph
      ? W.deployerGraph.get(p.chainId, addr)
      : null;
    const deployerSection = deployerLine(deployerObservation);

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
            <div class="mt-8">${riskBadge(assessment)}</div>
          </div>
        </div>
        <div class="meter-bar"><div class="meter-fill meter-fill-${pctBucket(a.score)}"></div></div>
        <div class="kv-row"><span class="muted">Price</span><span>$${esc(p.priceUsd)}</span></div>
        <div class="kv-row"><span class="muted">Liquidity / 24h Vol</span><span>$${esc(kfmt(a.liq))} / $${esc(kfmt(a.vol))}</span></div>
        <div class="kv-row"><span class="muted">1h / 6h / 24h</span><span>${esc(W.fmt.pct(a.h1))} ${esc(W.fmt.pct(a.h6))} ${esc(W.fmt.pct(a.h24))}</span></div>
        <div class="shield-slot">${shieldSection}</div>
        ${riskFlagsBlock(assessment)}
        ${structureSection}
        ${graphSection}
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

  // ── Render ─────────────────────────────────────────
  async function render(view) {
    if (!view) return;
    const chainList = Object.keys(CHAINS).join(", ");
    view.innerHTML = `
      <div class="card">
        <div class="watch-head">
          <h3>🤖 Gem Agent — new-token scanner (v3 · composite risk + wallet graph)</h3>
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
            <label class="small m-0" title="Hides tokens whose composite risk verdict is Danger.">
              <input type="checkbox" id="g-hide-risk" class="w-auto">
              Hide 🚫 Danger
            </label>
            <label class="small m-0" title="Only shows tokens whose composite risk verdict is Pass.">
              <input type="checkbox" id="g-only-pass" class="w-auto">
              ✅ Pass only
            </label>
            <label class="small m-0">
              <input type="checkbox" id="g-auto" ${auto ? "checked" : ""} class="w-auto">
              Auto-scan 5 min
            </label>
            <button class="btn primary" id="g-go">▶ Scan now</button>
          </div>
        </div>
        <p class="muted small">Crawls DEX Screener's latest boosted & newly-profiled tokens on chains with Token Shield verification (<b>${esc(chainList)}</b>). Every candidate gets <b>two independent scores</b>: a momentum score (liquidity, volume/liquidity, price action, age) and a composite risk score (honeypot, mint authority, LP lock, holder concentration, deployer reputation, wallet-graph coordination, external security APIs where available). A token must pass <b>both</b> to alert. Memecoins can still go to zero — not financial advice, always verify with a small buy/sell first.</p>
      </div>
      <div class="cards" id="g-stats"></div>
      <div id="g-body">${W.ui.spinner()}</div>
    `;

    view.querySelector("#g-go").onclick = () => scan(view);
    view.querySelector("#g-min").onchange = () => scan(view);
    view.querySelector("#g-chain").onchange = () => scan(view);
    view.querySelector("#g-hide-risk").onchange = () => scan(view);
    view.querySelector("#g-only-pass").onchange = () => scan(view);
    view.querySelector("#g-auto").onchange = (e) => {
      auto = e.target.checked;
      clearInterval(timer);
      timer = null;
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
    RISK_VERSION,
    RISK_WEIGHTS,
    VERDICT,
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
      esc,
      safeExternalUrl,
      computeRiskAssessment,
      riskBadge,
      riskFlagsBlock,
      getDeployerHistory,
      recordDeployerSeen,
      getDeployerStore: () => deployerStore,
      resetDeployerStore: () => {
        deployerStore = newMap();
        saveDeployerStore();
      },
    },
  };
})();

console.log(
  "[Gems] Module loaded  — composite risk engine, deployer reputation, wallet graph, external adapters.",
);
