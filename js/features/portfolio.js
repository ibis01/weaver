// ===============================================================
//         Portfolio Management Module
// ===============================================================
//
// Purpose: Manage user portfolio holdings with deterministic math.
// Security: Never uses LLMs for calculations. All math is handled
//           by W.finance to prevent NaN/Infinity edge cases.
//
// ===============================================================

window.W = window.W || {};

W.portfolio = (() => {
  const PORTFOLIO_KEY = "portfolio_holdings";

  // ── State ──────────────────────────────────────────────
  let holdings = W.store.get(PORTFOLIO_KEY, []);

  function save() {
    W.store.set(PORTFOLIO_KEY, holdings);
  }

  // ── CRUD Operations ────────────────────────────────────

  function all() {
    return holdings;
  }

  function add(holding) {
    // holding = { id, symbol, name, amount, price, cost }
    if (!holding || !holding.symbol) {
      console.warn("[Portfolio] Invalid holding data");
      return false;
    }

    // Check if exists, update if so
    const existingIndex = holdings.findIndex(
      (h) => h.symbol === holding.symbol,
    );
    if (existingIndex !== -1) {
      holdings[existingIndex] = { ...holdings[existingIndex], ...holding };
    } else {
      holdings.push(holding);
    }

    save();
    return true;
  }

  function remove(symbol) {
    holdings = holdings.filter((h) => h.symbol !== symbol);
    save();
    return true;
  }

  function update(symbol, updates) {
    const index = holdings.findIndex((h) => h.symbol === symbol);
    if (index !== -1) {
      holdings[index] = { ...holdings[index], ...updates };
      save();
      return true;
    }
    return false;
  }

  function clear() {
    holdings = [];
    save();
  }

  // ── Deterministic Calculations ────────────────────────

  /**
   * Get enriched holdings with calculated value, PL, PL%, and allocation.
   * Uses W.finance for 100% deterministic, edge-case-safe math.
   */
  function getEnrichedHoldings() {
    const totals = W.finance.calculatePortfolioTotals(holdings);

    return holdings.map((h) => {
      const value = W.finance.calculateValue(h.amount, h.price);
      const cost = W.finance.safeNumber(h.cost);
      const pl = W.finance.calculatePL(value, cost);
      const plPercent = W.finance.calculatePLPercent(pl, cost);
      const allocation = W.finance.calculateAllocation(
        value,
        totals.totalValue,
      );

      return {
        ...h,
        value,
        cost,
        pl,
        plPercent,
        allocation,
      };
    });
  }

  /**
   * Get total portfolio metrics.
   */
  function getTotals() {
    return W.finance.calculatePortfolioTotals(holdings);
  }

  // ── Render UI ──────────────────────────────────────────

  async function render(view) {
    const enriched = getEnrichedHoldings();
    const totals = getTotals();

    view.innerHTML = `
      <div class="card">
        <h3>💼 Portfolio Overview</h3>
        <div class="stats-grid">
          <div class="stat">
            <span class="label">Total Value</span>
            <span class="value">${W.fmt.money(totals.totalValue)}</span>
          </div>
          <div class="stat">
            <span class="label">Total Cost</span>
            <span class="value">${W.fmt.money(totals.totalCost)}</span>
          </div>
          <div class="stat">
            <span class="label">Total P/L</span>
            <span class="value ${totals.totalPL >= 0 ? "up" : "down"}">
              ${W.fmt.money(totals.totalPL)} (${W.fmt.pct(totals.totalPLPercent)})
            </span>
          </div>
        </div>
      </div>

      <div class="card">
        <h3>Holdings</h3>
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Amount</th>
                <th>Price</th>
                <th>Value</th>
                <th>P/L</th>
                <th>Alloc %</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${enriched
                .map(
                  (h) => `
                <tr>
                  <td><b>${W.fmt.escapeHTML(h.name || h.symbol)}</b><br><span class="muted small">${W.fmt.escapeHTML(h.symbol)}</span></td>
                  <td>${h.amount}</td>
                  <td>${W.fmt.price(h.price)}</td>
                  <td>${W.fmt.money(h.value)}</td>
                  <td class="${h.pl >= 0 ? "up" : "down"}">
                    ${W.fmt.money(h.pl)}<br><span class="small">${W.fmt.pct(h.plPercent)}</span>
                  </td>
                  <td>${W.fmt.pct(h.allocation)}</td>
                  <td>
                    <button class="btn tiny warn" data-action="remove" data-symbol="${W.fmt.escapeHTML(h.symbol)}">Remove</button>
                  </td>
                </tr>
              `,
                )
                .join("")}
            </tbody>
          </table>
          ${enriched.length === 0 ? '<p class="muted text-center">No holdings yet. Add your first asset!</p>' : ""}
        </div>
      </div>

      <div class="card">
        <h3>Add / Update Asset</h3>
        <form id="portfolio-form" class="form-grid">
          <input type="text" id="p-symbol" placeholder="Symbol (e.g. BTC)" required class="input">
          <input type="text" id="p-name" placeholder="Name (e.g. Bitcoin)" class="input">
          <input type="number" id="p-amount" placeholder="Amount" step="any" required class="input">
          <input type="number" id="p-price" placeholder="Current Price" step="any" required class="input">
          <input type="number" id="p-cost" placeholder="Total Cost Basis" step="any" required class="input">
          <button type="submit" class="btn primary">Save Asset</button>
        </form>
      </div>
    `;

    // ── Event Listeners ──────────────────────────────────
    const form = view.querySelector("#portfolio-form");
    if (form) {
      form.onsubmit = (e) => {
        e.preventDefault();
        const symbol = view
          .querySelector("#p-symbol")
          .value.trim()
          .toUpperCase();
        const name = view.querySelector("#p-name").value.trim();
        const amount = parseFloat(view.querySelector("#p-amount").value);
        const price = parseFloat(view.querySelector("#p-price").value);
        const cost = parseFloat(view.querySelector("#p-cost").value);

        if (symbol && !isNaN(amount) && !isNaN(price) && !isNaN(cost)) {
          add({ symbol, name, amount, price, cost });
          render(view); // Re-render
          W.ui.toast(`Updated ${symbol}`, "ok");
        } else {
          W.ui.toast("Invalid input data", "warn");
        }
      };
    }

    view.querySelectorAll("[data-action='remove']").forEach((btn) => {
      btn.onclick = () => {
        const symbol = btn.dataset.symbol;
        if (confirm(`Remove ${symbol} from portfolio?`)) {
          remove(symbol);
          render(view);
          W.ui.toast(`Removed ${symbol}`, "ok");
        }
      };
    });
  }

  // ── Exports ────────────────────────────────────────────
  return {
    all,
    add,
    remove,
    update,
    clear,
    getEnrichedHoldings,
    getTotals,
    render,
  };
})();

console.log("[Portfolio] Module loaded.");
