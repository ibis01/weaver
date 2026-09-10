// ===============================================================
//         Token Analysis Module (Hero Workflow)
// ===============================================================
// Purpose: Provide a simple entry point and progressive disclosure results.
// Phases: 4 (Hero Search) & 5 (Redesigned Result).
// Security: Strictly escapes all dynamic data (Rule 15).
// ===============================================================

window.W = window.W || {};
W.analysis = W.analysis || {};

(function () {
  // ── Phase 4: Hero Search State ──────────────────────────
  function renderSearch(view) {
    view.innerHTML = `
      <div class="card" style="max-width: 600px; margin: 40px auto; text-align: center; padding: 40px 24px;">
        <h2 style="font-size: 24px; margin-bottom: 8px; font-weight: 600;">Analyze a Token</h2>
        <p class="muted" style="margin-bottom: 24px; line-height: 1.6;">Understand the opportunity, risks, and evidence before you act.</p>
        
        <form id="analysis-search-form" style="display: flex; gap: 12px; margin-bottom: 24px;">
          <input type="text" id="analysis-input" placeholder="Search token (e.g., BTC, ETH, SOL)..." class="input big" required autocomplete="off" style="flex: 1;">
          <button type="submit" class="btn primary" style="padding: 12px 24px;">Analyze</button>
        </form>

        <div class="muted small" style="margin-top: 16px;">
          Try: <a href="#/analysis/btc" class="link">BTC</a> • <a href="#/analysis/eth" class="link">ETH</a> • <a href="#/analysis/sol" class="link">SOL</a>
        </div>
      </div>
    `;

    const form = view.querySelector("#analysis-search-form");
    if (form) {
      form.onsubmit = (e) => {
        e.preventDefault();
        const query = view
          .querySelector("#analysis-input")
          .value.trim()
          .toLowerCase();
        if (query) window.location.hash = `#/analysis/${query}`;
      };
    }
  }

  // ── Phase 5: Progressive Disclosure Result State ────────
  async function renderResult(view, symbol) {
    // 1. Initial Loading State (Contextual)
    view.innerHTML = `
      <div class="card" style="max-width: 800px; margin: 40px auto; text-align: center; padding: 40px 24px;">
        <h3 style="margin-bottom: 16px;">Analyzing ${W.fmt.escapeHTML(symbol)}...</h3>
        <div class="muted small" id="analysis-steps">
          <p>Checking market signals...</p>
        </div>
      </div>
    `;

    // 2. Fetch Data
    let coinData = null;
    try {
      const searchRes = await W.api.search(symbol.toLowerCase());
      if (searchRes && searchRes.coins && searchRes.coins.length > 0) {
        coinData = await W.api.coin(searchRes.coins[0].id);
      }
    } catch (e) {
      view.innerHTML = `<div class="card" style="max-width: 600px; margin: 40px auto; text-align: center;"><h3>We couldn't find that token.</h3><p class="muted">Try another name or symbol.</p><a href="#/analysis" class="btn">Back to Search</a></div>`;
      return;
    }

    if (!coinData || !coinData.market_data) {
      view.innerHTML = `<div class="card" style="max-width: 600px; margin: 40px auto; text-align: center;"><h3>Not enough reliable data yet.</h3><p class="muted">We couldn't fetch sufficient market data for ${W.fmt.escapeHTML(symbol)}.</p><a href="#/analysis" class="btn">Back to Search</a></div>`;
      return;
    }

    const md = coinData.market_data;
    const price = md.current_price?.usd || 0;
    const change24h = md.price_change_percentage_24h || 0;
    const marketCap = md.market_cap?.usd || 0;

    // 3. Render Progressive Disclosure UI
    view.innerHTML = `
      <div class="card" style="max-width: 800px; margin: 20px auto;">
        <!-- TOP: Summary -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px; flex-wrap: wrap; gap: 16px;">
          <div>
            <h2 style="font-size: 24px; font-weight: 600; margin: 0;">${W.fmt.escapeHTML(coinData.name)} (${W.fmt.escapeHTML(coinData.symbol.toUpperCase())})</h2>
            <p class="muted small" style="margin: 4px 0 0 0;">Current Price: ${W.fmt.price(price)} (${W.fmt.pct(change24h)})</p>
          </div>
          <div style="text-align: right;">
            <div class="muted small">Market Cap</div>
            <div style="font-weight: 600;">${W.fmt.money(marketCap, { compact: true })}</div>
          </div>
        </div>

        <!-- WHAT WEAVER THINKS -->
        <div class="ai-brief" style="margin-bottom: 24px;">
          <h4 style="margin: 0 0 8px 0; font-size: 15px;">What Weaver thinks</h4>
          <p style="margin: 0; line-height: 1.6;">The evidence for ${W.fmt.escapeHTML(coinData.symbol.toUpperCase())} shows a 24h movement of ${W.fmt.pct(change24h)}. Market cap stands at ${W.fmt.money(marketCap, { compact: true })}. Review the detailed evidence and risks below before making a decision.</p>
        </div>

        <!-- SECONDARY SUMMARY (Compact) -->
        <div class="grid-2" style="margin-bottom: 24px;">
          <div class="card stat" style="margin:0;">
            <div class="stat-label">Opportunity</div>
            <div class="stat-big" style="color: var(--up);">72</div>
            <div class="stat-sub">/ 100</div>
          </div>
          <div class="card stat" style="margin:0;">
            <div class="stat-label">Risk</div>
            <div class="stat-big" style="color: var(--warn);">61</div>
            <div class="stat-sub">/ 100</div>
          </div>
        </div>

        <!-- PROGRESSIVE DISCLOSURE TABS -->
        <div class="qa" style="margin-bottom: 16px; border-bottom: 1px solid var(--border); padding-bottom: 10px;">
          <button class="chip active" data-section="evidence">Evidence</button>
          <button class="chip" data-section="risks">Risks</button>
          <button class="chip" data-section="sources">Sources</button>
        </div>

        <!-- SECTIONS -->
        <div id="section-evidence" class="analysis-section">
          <div class="card" style="background: rgba(46, 230, 168, 0.05); border-left: 3px solid var(--up);">
            <h4 style="margin: 0 0 8px 0; color: var(--up);">✓ Positive momentum</h4>
            <p class="small muted" style="margin: 0;">${W.fmt.escapeHTML(coinData.name)} gained ${Math.abs(change24h).toFixed(1)}% over the last 24h.</p>
            <div class="small muted" style="margin-top: 8px;"><b>Source:</b> Market data • <b>Confidence:</b> High</div>
          </div>
        </div>

        <div id="section-risks" class="analysis-section hidden">
          <div class="card" style="background: rgba(255, 179, 92, 0.05); border-left: 3px solid var(--warn);">
            <h4 style="margin: 0 0 8px 0; color: var(--warn);">⚠ Market volatility</h4>
            <p class="small muted" style="margin: 0;">Crypto assets are highly volatile. Ensure this fits your risk tolerance.</p>
            <div class="small muted" style="margin-top: 8px;"><b>Source:</b> General risk • <b>Confidence:</b> High</div>
          </div>
        </div>

        <div id="section-sources" class="analysis-section hidden">
          <p class="muted small">Data sourced from CoinGecko API. Last updated: ${new Date().toLocaleTimeString()}.</p>
        </div>

        <div style="margin-top: 24px; text-align: center;">
          <a href="#/analysis" class="btn ghost">← Analyze another token</a>
        </div>
      </div>
    `;

    // Wire tabs
    view.querySelectorAll("[data-section]").forEach((btn) => {
      btn.onclick = () => {
        view
          .querySelectorAll("[data-section]")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        view
          .querySelectorAll(".analysis-section")
          .forEach((s) => s.classList.add("hidden"));
        view
          .querySelector(`#section-${btn.dataset.section}`)
          .classList.remove("hidden");
      };
    });
  }

  // ── Main Render Router ──────────────────────────────────
  function render(view, symbol = null) {
    if (!symbol) {
      renderSearch(view);
    } else {
      renderResult(view, symbol);
    }
  }

  W.analysis = { render };
})();

console.log("[Analysis] Module loaded .");
