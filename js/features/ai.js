//  Premium AI Intelligence Engine
// ================================================================
//
// 🧠 Weaver AI – Your Personal Crypto Intelligence Analyst
//
// Unique Features:
//   • Multi-model LLM support (OpenAI, Anthropic, Custom)
//   • On-chain data enrichment (wallet tracking, whale alerts)
//   • Portfolio correlation analysis (which assets move together)
//   • Risk decomposition (liquidity, volatility, concentration)
//   • Sentiment-aware market analysis
//   • Proactive insights (alerts triggered by AI)
//   • Memory system (learns from your portfolio behavior)
//   • Natural language portfolio queries
// ================================================================

window.W = window.W || {};

W.ai = (() => {
  // ── Constants ─────────────────────────────────────────
  const MEMORY_KEY = "ai_memory";
  const INSIGHTS_KEY = "ai_insights";
  const MAX_HISTORY = 50;

  // ── LLM Providers ─────────────────────────────────────
  const PROVIDERS = {
    openai: {
      name: "OpenAI",
      endpoint: "https://api.openai.com/v1/chat/completions",
      models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
      defaultModel: "gpt-4o-mini",
    },
    anthropic: {
      name: "Anthropic",
      endpoint: "https://api.anthropic.com/v1/messages",
      models: ["claude-3-opus", "claude-3-sonnet", "claude-3-haiku"],
      defaultModel: "claude-3-sonnet",
    },
    custom: {
      name: "Custom",
      endpoint: "",
      models: [],
      defaultModel: "",
    },
  };

  // ── State ──────────────────────────────────────────────
  let memory = W.store.get(MEMORY_KEY, { conversations: [], insights: [] });
  let insightsCache = W.store.get(INSIGHTS_KEY, []);

  // ── Helpers ────────────────────────────────────────────
  function escapeHTML(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function saveMemory() {
    W.store.set(MEMORY_KEY, memory);
  }

  function saveInsights() {
    W.store.set(INSIGHTS_KEY, insightsCache);
  }

  function getSettings() {
    const s = W.store.get("settings", {});
    return s.ai || {};
  }

  // ── 1. ADVANCED PORTFOLIO ANALYSIS ──────────────────

  /**
   * Decompose portfolio risk into components
   */
  function decomposeRisk(rows, totals) {
    if (!rows || !rows.length) return null;

    // Concentration risk (top holdings)
    const sorted = [...rows].sort((a, b) => b.value - a.value);
    const top3 = sorted.slice(0, 3);
    const top3Concentration = totals.value
      ? (top3.reduce((s, r) => s + r.value, 0) / totals.value) * 100
      : 0;

    // Volatility (if we have 7d data)
    const vol = rows.reduce((s, r) => s + Math.abs(r.p7 || 0), 0) / rows.length;

    // Correlation proxy: how many assets move together
    let correlated = 0;
    for (let i = 0; i < Math.min(rows.length, 5); i++) {
      for (let j = i + 1; j < Math.min(rows.length, 5); j++) {
        const a = rows[i].p7 || 0;
        const b = rows[j].p7 || 0;
        if (a > 0 && b > 0) correlated++;
        if (a < 0 && b < 0) correlated++;
      }
    }
    const maxPairs =
      (Math.min(rows.length, 5) * (Math.min(rows.length, 5) - 1)) / 2;
    const correlationScore = maxPairs ? (correlated / maxPairs) * 100 : 0;

    // Liquidity risk (if we have volume data)
    const liquidityScore =
      (rows.reduce((s, r) => {
        const vol = r.total_volume || 0;
        return s + (vol > 1000000 ? 1 : 0);
      }, 0) /
        rows.length) *
      100;

    // Sector diversification (if we have sector data)
    const sectors = new Set(rows.map((r) => r.sector || "Other"));
    const sectorScore = (sectors.size / Math.max(rows.length, 1)) * 100;

    return {
      concentration: top3Concentration,
      volatility: vol,
      correlation: correlationScore,
      liquidity: liquidityScore,
      diversification: sectorScore,
      riskScore:
        top3Concentration * 0.3 +
        vol * 0.2 +
        (100 - correlationScore) * 0.2 +
        (100 - liquidityScore) * 0.15 +
        (100 - sectorScore) * 0.15,
    };
  }

  /**
   * Identify hidden patterns in portfolio
   */
  function findPatterns(rows) {
    if (!rows || rows.length < 2) return [];

    const patterns = [];
    const symbols = rows.map((r) => r.symbol.toUpperCase());

    // Check for sector concentration
    const sectorCount = {};
    rows.forEach((r) => {
      const sector = r.sector || "Other";
      sectorCount[sector] = (sectorCount[sector] || 0) + 1;
    });
    const concentratedSector = Object.entries(sectorCount).find(
      ([, count]) => count > rows.length / 2,
    );
    if (concentratedSector) {
      patterns.push({
        type: "concentration",
        severity: "warning",
        message: `${concentratedSector[0]} makes up ${((concentratedSector[1] / rows.length) * 100).toFixed(0)}% of your assets`,
        suggestion: "Consider diversifying into other sectors",
      });
    }

    // Check for overlapping assets (same ecosystem)
    const ecosystems = ["bitcoin", "ethereum", "solana", "polygon", "arbitrum"];
    const ecoCount = {};
    rows.forEach((r) => {
      const eco = ecosystems.find((e) => r.coinId.includes(e)) || "other";
      ecoCount[eco] = (ecoCount[eco] || 0) + 1;
    });
    const dominantEco = Object.entries(ecoCount).sort((a, b) => b[1] - a[1])[0];
    if (dominantEco && dominantEco[1] > rows.length / 3) {
      patterns.push({
        type: "ecosystem",
        severity: "info",
        message: `${dominantEco[0]} ecosystem dominates your portfolio (${dominantEco[1]} assets)`,
        suggestion: `Look into assets from other ecosystems for better diversification`,
      });
    }

    // Check for correlated performance
    const with7d = rows.filter((r) => r.p7 !== null);
    if (with7d.length >= 3) {
      const positive = with7d.filter((r) => r.p7 > 0).length;
      const negative = with7d.filter((r) => r.p7 < 0).length;
      if (positive === with7d.length) {
        patterns.push({
          type: "momentum",
          severity: "bullish",
          message: "All your assets are in positive territory this week",
          suggestion: "Strong bull momentum — consider taking some profits",
        });
      } else if (negative === with7d.length) {
        patterns.push({
          type: "momentum",
          severity: "bearish",
          message: "All your assets are down this week",
          suggestion: "Dollar-cost average into quality projects during dips",
        });
      }
    }

    return patterns;
  }

  // ── 2. ON-CHAIN INTELLIGENCE ──────────────────────────

  /**
   * Get whale activity for a token
   */
  async function getWhaleActivity(coinId, minUsd = 100000) {
    try {
      const coin = await W.api.coin(coinId);
      const contract = coin?.platforms?.ethereum;
      if (!contract) return null;

      // Fetch recent large transfers
      const txs = await fetch(
        `https://eth.blockscout.com/api/v2/tokens/${contract}/transfers`,
      ).then((r) => r.json());
      const price = coin?.market_data?.current_price?.usd || 0;

      const whales = (txs.items || [])
        .filter(
          (t) => (parseFloat(t.total?.value || 0) / 1e18) * price >= minUsd,
        )
        .slice(0, 5)
        .map((t) => ({
          from: t.from?.hash || "unknown",
          to: t.to?.hash || "unknown",
          amount: parseFloat(t.total?.value || 0) / 1e18,
          value: (parseFloat(t.total?.value || 0) / 1e18) * price,
          timestamp: new Date(t.timestamp).getTime(),
        }));

      return whales;
    } catch (e) {
      console.warn("[AI] Whale activity error:", e);
      return null;
    }
  }

  /**
   * Analyze Smart Money sentiment
   */
  async function getSmartMoneySentiment(coinId) {
    try {
      // Use W.smart module if available
      if (!W.smart) return null;
      const coin = await W.api.coin(coinId);
      const contract = coin?.platforms?.ethereum;
      if (!contract) return null;

      const holders = await fetch(
        `https://eth.blockscout.com/api/v2/tokens/${contract}/holders`,
      ).then((r) => r.json());

      if (!holders?.items) return null;

      // Analyze top 5 holders
      const top5 = holders.items.slice(0, 5);
      let accumulating = 0;
      for (const h of top5) {
        try {
          const txs = await fetch(
            `https://eth.blockscout.com/api/v2/addresses/${h.address.hash}/token-transfers?token=${contract}`,
          ).then((r) => r.json());
          // Check last 7 days activity
          const weekAgo = Date.now() - 7 * 864e5;
          const recent = (txs.items || []).filter(
            (t) => new Date(t.timestamp).getTime() > weekAgo,
          );
          const netFlow = recent.reduce((sum, t) => {
            if (t.to?.hash === h.address.hash)
              sum += parseFloat(t.total?.value || 0);
            if (t.from?.hash === h.address.hash)
              sum -= parseFloat(t.total?.value || 0);
            return sum;
          }, 0);
          if (netFlow > 0) accumulating++;
        } catch (e) {}
      }

      return {
        topHolders: top5.length,
        accumulating: accumulating,
        sentiment:
          accumulating >= 3
            ? "bullish"
            : accumulating >= 2
              ? "neutral"
              : "bearish",
        score: (accumulating / Math.max(top5.length, 1)) * 100,
      };
    } catch (e) {
      console.warn("[AI] Smart money error:", e);
      return null;
    }
  }

  // ── 3. MEMORY SYSTEM ──────────────────────────────────

  /**
   * Remember a conversation interaction
   */
  function remember(query, response, context = {}) {
    memory.conversations.push({
      timestamp: Date.now(),
      query,
      response,
      context,
    });
    if (memory.conversations.length > MAX_HISTORY) {
      memory.conversations = memory.conversations.slice(-MAX_HISTORY);
    }
    saveMemory();
  }

  /**
   * Get relevant past conversations
   */
  function recall(query, limit = 3) {
    const words = query.toLowerCase().split(" ");
    return memory.conversations
      .filter((c) => words.some((w) => c.query.toLowerCase().includes(w)))
      .slice(-limit);
  }

  // ── 4. PROACTIVE INSIGHTS ─────────────────────────────

  /**
   * Generate proactive insights based on portfolio state
   */
  async function generateInsights() {
    const holdings = W.portfolio?.all() || [];
    if (!holdings.length) return [];

    const { rows, totals } = (await W.dashboard?.enrich?.()) || {
      rows: [],
      totals: null,
    };
    if (!rows.length || !totals) return [];

    const risk = decomposeRisk(rows, totals);
    const patterns = findPatterns(rows);
    const insights = [];

    // Risk insights
    if (risk) {
      if (risk.concentration > 70) {
        insights.push({
          type: "risk",
          severity: "warning",
          icon: "⚠️",
          title: "High Concentration Risk",
          message: `Your top 3 holdings make up ${risk.concentration.toFixed(0)}% of your portfolio`,
          suggestion: "Consider diversifying to reduce single-asset risk",
        });
      }
      if (risk.volatility > 10) {
        insights.push({
          type: "risk",
          severity: "info",
          icon: "📊",
          title: "High Volatility Detected",
          message: `Average 7-day swing is ${risk.volatility.toFixed(1)}%`,
          suggestion: "Consider hedging or reducing position sizes",
        });
      }
      if (risk.correlation > 70) {
        insights.push({
          type: "correlation",
          severity: "info",
          icon: "🔗",
          title: "High Correlation",
          message: "Your assets tend to move together",
          suggestion: "Add uncorrelated assets for better diversification",
        });
      }
    }

    // Pattern insights
    patterns.forEach((p) => {
      insights.push({
        type: p.type,
        severity: p.severity,
        icon:
          p.type === "concentration"
            ? "🎯"
            : p.type === "ecosystem"
              ? "🌿"
              : "📈",
        title: p.type.charAt(0).toUpperCase() + p.type.slice(1),
        message: p.message,
        suggestion: p.suggestion,
      });
    });

    // On-chain insights (if available)
    if (W.whales) {
      try {
        const topAsset = rows.sort((a, b) => b.value - a.value)[0];
        if (topAsset) {
          const whaleActivity = await getWhaleActivity(topAsset.coinId);
          if (whaleActivity && whaleActivity.length > 2) {
            insights.push({
              type: "whale",
              severity: "info",
              icon: "🐋",
              title: `Whale Activity Detected on ${topAsset.name}`,
              message: `${whaleActivity.length} large transfers in recent hours`,
              suggestion: "Monitor for potential price impact",
            });
          }
        }
      } catch (e) {}
    }

    // Smart money sentiment
    if (W.smart && rows.length) {
      try {
        const topAsset = rows.sort((a, b) => b.value - a.value)[0];
        if (topAsset) {
          const sentiment = await getSmartMoneySentiment(topAsset.coinId);
          if (sentiment && sentiment.sentiment === "bullish") {
            insights.push({
              type: "smartmoney",
              severity: "bullish",
              icon: "🧠",
              title: `Smart Money Accumulating ${topAsset.name}`,
              message: `${sentiment.accumulating}/${sentiment.topHolders} top holders accumulating`,
              suggestion:
                "Smart money signal — consider adding to your position",
            });
          }
        }
      } catch (e) {}
    }

    // Cache insights
    insightsCache = insights;
    saveInsights();

    return insights;
  }

  // ── 5. LLM QUERY ENGINE ──────────────────────────────

  /**
   * Query an LLM with context
   */
  async function queryLLM(prompt, systemPrompt = null) {
    const settings = getSettings();
    const provider = settings.provider || "openai";
    const config = PROVIDERS[provider];
    if (!config) throw new Error("Unknown provider");

    const apiKey = settings.key;
    const model = settings.model || config.defaultModel;
    const endpoint = settings.url || config.endpoint;

    if (!apiKey) {
      throw new Error("API key required. Add one in Settings.");
    }

    const messages = [];
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: prompt });

    let body;
    let headers;

    if (provider === "openai" || provider === "custom") {
      body = JSON.stringify({
        model: model,
        messages: messages,
        temperature: 0.7,
        max_tokens: 1000,
      });
      headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      };
    } else if (provider === "anthropic") {
      body = JSON.stringify({
        model: model,
        messages: messages,
        max_tokens: 1000,
        temperature: 0.7,
      });
      headers = {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      };
    } else {
      throw new Error("Unsupported provider");
    }

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: headers,
        body: body,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || `HTTP ${response.status}`);
      }

      const data = await response.json();

      let result;
      if (provider === "anthropic") {
        result = data.content?.[0]?.text || "";
      } else {
        result = data.choices?.[0]?.message?.content || "";
      }

      return result;
    } catch (e) {
      console.error("[AI] LLM query error:", e);
      throw new Error(`LLM query failed: ${e.message}`);
    }
  }

  // ── 6. NATURAL LANGUAGE QUERIES ──────────────────────

  /**
   * Ask Weaver a question about crypto, portfolio, or market
   */
  async function ask(question, useLLM = true) {
    // Check if this is a portfolio query
    const isPortfolioQuery =
      /portfolio|holdings|own|invest|balance|worth|value/i.test(question);
    const isPriceQuery = /price|worth|cost|value|how much/i.test(question);
    const isMarketQuery =
      /market|sentiment|trend|fear|greed|dominance|cap/i.test(question);

    // Build context
    const holdings = W.portfolio?.all() || [];
    const { rows, totals } = (await W.dashboard?.enrich?.()) || {
      rows: [],
      totals: null,
    };
    const risk = decomposeRisk(rows, totals);
    const patterns = findPatterns(rows);

    // Prepare portfolio context
    let portfolioContext = "";
    if (holdings.length) {
      portfolioContext = `The user's portfolio consists of ${holdings.length} assets worth ${W.fmt.money(totals?.value || 0)}. `;
      portfolioContext += `Top holdings: ${rows
        .slice(0, 3)
        .map((r) => `${r.symbol.toUpperCase()} (${W.fmt.money(r.value)})`)
        .join(", ")}. `;
      if (risk) {
        portfolioContext += `Portfolio risk score: ${risk.riskScore.toFixed(0)}/100. `;
        portfolioContext += `Concentration: ${risk.concentration.toFixed(0)}%, Volatility: ${risk.volatility.toFixed(1)}%. `;
      }
    }

    // Build market context
    let marketContext = "";
    try {
      const fg = await W.api.fearGreed();
      const g = await W.api.global();
      marketContext = `Fear & Greed: ${fg.value} (${fg.value_classification}). `;
      marketContext += `BTC Dominance: ${g.data.market_cap_percentage.btc.toFixed(1)}%. `;
      marketContext += `Market Cap: ${W.fmt.money(g.data.total_market_cap.usd, { compact: true })}. `;
    } catch (e) {}

    // ── If no LLM, use deterministic answers ────────────
    if (!useLLM) {
      // Check for specific coin queries
      if (isPriceQuery && !isPortfolioQuery) {
        const coinMatch = question.match(
          /\b(bitcoin|btc|ethereum|eth|solana|sol|dogecoin|doge|cardano|ada|ripple|xrp|chainlink|link)\b/i,
        );
        if (coinMatch) {
          const searchTerm = coinMatch[0].toLowerCase();
          try {
            const results = await W.api.search(searchTerm);
            if (results.coins && results.coins.length) {
              const coin = results.coins[0];
              const detail = await W.api.coin(coin.id);
              const price = detail.market_data?.current_price?.usd;
              const change = detail.market_data?.price_change_percentage_24h;
              if (price) {
                return `📊 <b>${detail.name}</b> is currently ${W.fmt.price(price)} (${W.fmt.pct(change)}). Market cap: ${W.fmt.money(detail.market_data.market_cap.usd, { compact: true })}.`;
              }
            }
          } catch (e) {}
        }
      }

      // Portfolio summary
      if (isPortfolioQuery && holdings.length) {
        return `💼 Your portfolio is worth <b>${W.fmt.money(totals?.value || 0)}</b> across ${holdings.length} assets. All-time P/L: ${W.fmt.pct(totals?.allTimePct || 0)}. ${patterns.length ? `\n\n🧠 Insights: ${patterns.map((p) => p.message).join(". ")}` : ""}`;
      }

      // Market summary
      if (isMarketQuery) {
        return `📈 Market: ${marketContext}`;
      }

      return `I can help you with your portfolio, market data, or specific coins. Try asking "What's my portfolio worth?" or "What's the price of Bitcoin?" ⚡ Add an AI API key in Settings for advanced conversational answers.`;
    }

    // ── Use LLM ──────────────────────────────────────────
    const systemPrompt = `
      You are Weaver, a sophisticated crypto intelligence analyst.
      You have access to portfolio data, market data, and on-chain insights.
      Respond in a helpful, professional tone.

      Portfolio Context:
      ${portfolioContext}

      Market Context:
      ${marketContext}

      Rules:
      - Never provide financial advice
      - Always note that crypto is volatile
      - Be concise but informative
      - Use emojis sparingly
      - Format numbers properly
      - If you don't know, say so
    `;

    try {
      const result = await queryLLM(question, systemPrompt);
      // Remember this interaction
      remember(question, result, { type: "llm", timestamp: Date.now() });
      return result;
    } catch (e) {
      // Fallback to deterministic
      console.warn("[AI] LLM fallback:", e);
      return await ask(question, false);
    }
  }

  // ── 7. PORTFOLIO INTELLIGENCE ────────────────────────

  async function portfolioInsights() {
    const { rows, totals } = (await W.dashboard?.enrich?.()) || {
      rows: [],
      totals: null,
    };
    if (!rows.length || !totals) {
      return {
        summary: "No holdings to analyze. Add some assets to get started! 🚀",
        risk: null,
        patterns: [],
        metrics: null,
        recommendation: "Start by adding your first asset.",
      };
    }

    const risk = decomposeRisk(rows, totals);
    const patterns = findPatterns(rows);
    const best = rows.sort((a, b) => b.pnlPct - a.pnlPct)[0];
    const worst = rows.sort((a, b) => a.pnlPct - b.pnlPct)[0];

    // Generate recommendation
    let recommendation = "";
    if (risk?.concentration > 70) {
      recommendation = "⚠️ Consider diversifying to reduce single-asset risk.";
    } else if (
      patterns.some((p) => p.type === "momentum" && p.severity === "bullish")
    ) {
      recommendation =
        "📈 Strong momentum — consider taking some profits or setting stop-losses.";
    } else if (
      patterns.some((p) => p.type === "momentum" && p.severity === "bearish")
    ) {
      recommendation = "📉 Dips are opportunities — DCA into quality projects.";
    } else {
      recommendation =
        "✅ Your portfolio is well-balanced. Continue monitoring and DCA.";
    }

    return {
      summary: `Your portfolio is worth <b>${W.fmt.money(totals.value)}</b> with ${rows.length} assets. All-time: ${W.fmt.pct(totals.allTimePct)}.`,
      risk,
      patterns,
      metrics: {
        totalValue: totals.value,
        totalCost: totals.cost,
        allTimePnl: totals.allTime,
        allTimePct: totals.allTimePct,
        dayPnl: totals.day,
        dayPct: totals.dayPct,
        weekPnl: totals.week,
        weekPct: totals.weekPct,
        topPerformer: best
          ? { name: best.name, symbol: best.symbol, pct: best.pnlPct }
          : null,
        worstPerformer: worst
          ? { name: worst.name, symbol: worst.symbol, pct: worst.pnlPct }
          : null,
      },
      recommendation,
    };
  }

  // ── 8. MARKET INTELLIGENCE ───────────────────────────

  async function marketIntelligence() {
    try {
      const [fg, g, top] = await Promise.all([
        W.api.fearGreed(),
        W.api.global(),
        W.api.top(10),
      ]);

      const movers = [...top].sort(
        (a, b) =>
          (b.price_change_percentage_24h_in_currency || 0) -
          (a.price_change_percentage_24h_in_currency || 0),
      );
      const best = movers[0];
      const worst = movers[movers.length - 1];

      // Detect market regime
      let regime = "neutral";
      if (fg.value >= 75) regime = "greedy";
      else if (fg.value <= 25) regime = "fearful";

      const regimeMsg = {
        greedy:
          "🟢 Extreme Greed — Market may be overheated. Consider taking profits.",
        fearful: "🔴 Extreme Fear — Contrarian buying opportunity.",
        neutral: "⚖️ Neutral — Continue with your strategy.",
      };

      return {
        fearGreed: { value: fg.value, classification: fg.value_classification },
        dominance: g.data.market_cap_percentage.btc.toFixed(1),
        cap: g.data.total_market_cap.usd,
        capChange: g.data.market_cap_change_percentage_24h_usd,
        topGainer: {
          name: best.name,
          change: best.price_change_percentage_24h_in_currency,
        },
        topLoser: {
          name: worst.name,
          change: worst.price_change_percentage_24h_in_currency,
        },
        regime: regime,
        regimeMessage: regimeMsg[regime],
        summary: `📊 Market: ${fg.value_classification} (${fg.value}/100). BTC dominance ${g.data.market_cap_percentage.btc.toFixed(1)}%. ${regimeMsg[regime]}`,
      };
    } catch (e) {
      console.warn("[AI] Market intelligence error:", e);
      return {
        summary: "Market data unavailable. Try again later.",
      };
    }
  }

  // ── 9. AI RENDER ──────────────────────────────────────

  async function render(view) {
    view.innerHTML = `
      <div class="grid-2">
        <div class="card">
          <h3>🧠 Portfolio Intelligence</h3>
          <div id="ai-portfolio-summary">${W.ui.spinner()}</div>
        </div>
        <div class="card">
          <h3>📊 Market Intelligence</h3>
          <div id="ai-market-summary">${W.ui.spinner()}</div>
        </div>
      </div>
      <div class="card">
        <h3>💡 Proactive Insights</h3>
        <div id="ai-insights">${W.ui.spinner()}</div>
      </div>
      <div class="card">
        <h3>💬 Ask Weaver (AI Analyst)</h3>
        <div class="ask-row">
          <input id="ai-q" class="input" placeholder='Try: "How is my portfolio doing?" or "What should I know about this market?"'>
          <button class="btn primary" id="ai-go">Ask</button>
          <button class="btn tiny" id="ai-llm-toggle">⚡ LLM</button>
        </div>
        <div class="qa mt small">
          <button class="chip" data-quick="What's my portfolio worth?">💼 Portfolio</button>
          <button class="chip" data-quick="How is the market doing today?">📈 Market</button>
          <button class="chip" data-quick="Should I be worried about inflation?">💰 Macro</button>
          <button class="chip" data-quick="What's the sentiment on Bitcoin?">₿ Sentiment</button>
        </div>
        <div id="ai-answer" class="ai-answer hidden"></div>
      </div>
    `;

    // ── Load portfolio insights ─────────────────────────
    try {
      const insights = await portfolioInsights();
      const el = view.querySelector("#ai-portfolio-summary");
      if (el) {
        el.innerHTML = `
          <div class="ai-brief">${insights.summary}</div>
          <div class="meter-bar mt"><div style="width:${100 - (insights.risk?.riskScore || 0)}%; background: ${(insights.risk?.riskScore || 0) < 40 ? "var(--up)" : (insights.risk?.riskScore || 0) < 60 ? "var(--warn)" : "var(--down)"};"></div></div>
          <div class="small">Risk Score: ${(100 - (insights.risk?.riskScore || 0)).toFixed(0)}/100</div>
          <div class="mt small">${insights.recommendation}</div>
        `;
      }
    } catch (e) {
      view.querySelector("#ai-portfolio-summary").innerHTML =
        `<p class="muted">${escapeHTML(e.message)}</p>`;
    }

    // ── Load market intelligence ────────────────────────
    try {
      const market = await marketIntelligence();
      const el = view.querySelector("#ai-market-summary");
      if (el) {
        el.innerHTML = `
          <div class="ai-brief">${market.summary}</div>
          <div class="kv-row"><span class="muted">Fear & Greed</span><span><b>${market.fearGreed?.value}</b> (${market.fearGreed?.classification})</span></div>
          <div class="kv-row"><span class="muted">BTC Dominance</span><span>${market.dominance}%</span></div>
          <div class="kv-row"><span class="muted">Top Gainer</span><span>${market.topGainer?.name} ${W.fmt.pct(market.topGainer?.change)}</span></div>
          <div class="kv-row"><span class="muted">Top Loser</span><span>${market.topLoser?.name} ${W.fmt.pct(market.topLoser?.change)}</span></div>
        `;
      }
    } catch (e) {
      view.querySelector("#ai-market-summary").innerHTML =
        `<p class="muted">${escapeHTML(e.message)}</p>`;
    }

    // ── Load proactive insights ─────────────────────────
    try {
      const insights = await generateInsights();
      const el = view.querySelector("#ai-insights");
      if (el) {
        if (!insights.length) {
          el.innerHTML =
            '<p class="muted small">No insights yet. Add more assets to get started.</p>';
        } else {
          el.innerHTML = insights
            .slice(0, 4)
            .map(
              (i) => `
            <div class="kv-row" style="border-bottom:1px solid var(--border);padding:8px 0;">
              <span>${i.icon} <b>${escapeHTML(i.title)}</b><br><span class="muted small">${escapeHTML(i.message)}</span></span>
              <span class="small">${escapeHTML(i.suggestion || "")}</span>
            </div>
          `,
            )
            .join("");
        }
      }
    } catch (e) {
      view.querySelector("#ai-insights").innerHTML =
        `<p class="muted">${escapeHTML(e.message)}</p>`;
    }

    // ── Ask Weaver ──────────────────────────────────────
    let useLLM = true;

    view.querySelector("#ai-go").onclick = async () => {
      const q = view.querySelector("#ai-q").value.trim();
      if (!q) return;
      const answerBox = view.querySelector("#ai-answer");
      answerBox.classList.remove("hidden");
      answerBox.innerHTML = W.ui.spinner();

      try {
        const response = await ask(q, useLLM);
        answerBox.innerHTML = `<div class="ai-brief">${response}</div>`;
      } catch (e) {
        answerBox.innerHTML = `<div class="ai-brief" style="border-color:var(--down);">❌ ${escapeHTML(e.message)}</div>`;
      }
    };

    view.querySelector("#ai-q").addEventListener("keydown", (e) => {
      if (e.key === "Enter") view.querySelector("#ai-go").click();
    });

    view.querySelector("#ai-llm-toggle").onclick = () => {
      useLLM = !useLLM;
      view.querySelector("#ai-llm-toggle").textContent = useLLM
        ? "⚡ LLM"
        : "💡 Rule";
      view.querySelector("#ai-llm-toggle").classList.toggle("primary", useLLM);
      W.ui.toast(
        useLLM ? "LLM mode enabled" : "Rule-based mode enabled",
        "info",
      );
    };

    view.querySelectorAll("[data-quick]").forEach((btn) => {
      btn.onclick = () => {
        view.querySelector("#ai-q").value = btn.dataset.quick;
        view.querySelector("#ai-go").click();
      };
    });
  }

  // ── Exports ─────────────────────────────────────────────
  return {
    render,
    ask,
    portfolioInsights,
    marketIntelligence,
    generateInsights,
    decomposeRisk,
    findPatterns,
    getWhaleActivity,
    getSmartMoneySentiment,
    queryLLM,
    remember,
    recall,
  };
})();

console.log("[AI] Module loaded.");
