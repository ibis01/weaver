// ================================================================
// js/features/smart.js – Smart Money Tracker
// ================================================================

window.W = window.W || {};

W.smart = (() => {
  // ── Constants ─────────────────────────────────────────
  const BLOCKSCOUT_API = "https://eth.blockscout.com/api/v2";
  const CACHE_TTL = 300000; // 5 minutes cache
  const MAX_HOLDERS = 8;

  // ── Helpers ────────────────────────────────────────────

  function shortAddress(addr) {
    if (!addr) return "—";
    return addr.slice(0, 6) + "…" + addr.slice(-4);
  }

  function escapeHTML(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Price Map for Historical Dates ────────────────────

  async function buildPriceMap(coinId, days = 365) {
    const chart = await W.api.chart(coinId, days);
    const prices = (chart.prices || []).map((p) => ({
      date: new Date(p[0]).toDateString(),
      price: p[1],
    }));
    const map = {};
    prices.forEach((p) => (map[p.date] = p.price));
    return map;
  }

  // ── Parse token quantity from transfer event ──────────

  function parseQuantity(transfer) {
    const raw =
      typeof transfer.total === "object"
        ? transfer.total?.value || "0"
        : transfer.total || "0";
    const decimals = parseInt(
      transfer.token?.decimals ||
        (typeof transfer.total === "object" ? transfer.total?.decimals : 18) ||
        18,
      10,
    );
    return parseFloat(raw) / Math.pow(10, decimals);
  }

  // ── Analyze a wallet's P/L ────────────────────────────

  function analyzeWallet(transfers, walletAddress, priceMap, currentPrice) {
    // Process transfers oldest to newest
    const sorted = [...transfers].reverse();
    let balance = 0;
    let cost = 0;
    let realized = 0;
    let invested = 0;
    let in7 = 0;
    const weekAgo = Date.now() - 7 * 864e5;

    sorted.forEach((t) => {
      const qty = parseQuantity(t);
      const ts = new Date(t.timestamp).getTime();
      const dateKey = new Date(ts).toDateString();
      const price = priceMap[dateKey] || currentPrice;

      if ((t.to?.hash || "").toLowerCase() === walletAddress.toLowerCase()) {
        // Incoming transfer
        balance += qty;
        cost += qty * price;
        invested += qty * price;
        if (ts >= weekAgo) in7 += qty;
      } else {
        // Outgoing transfer (sell)
        const sellQty = Math.min(qty, balance);
        const avgCost = balance > 0 ? cost / balance : price;
        realized += sellQty * (price - avgCost);
        cost -= sellQty * avgCost;
        balance -= sellQty;
        if (ts >= weekAgo) in7 -= sellQty;
      }
    });

    const avgCost = balance > 0 ? cost / balance : currentPrice;
    const unrealized = balance * (currentPrice - avgCost);
    const total = realized + unrealized;

    return {
      balance,
      realized,
      unrealized,
      total,
      invested,
      in7,
      avgCost,
    };
  }

  // ── Scan holders for a token ──────────────────────────

  async function scanToken(coin, view) {
    const body = view.querySelector("#sm-body");
    if (!body) return;
    body.innerHTML = W.ui.spinner();

    try {
      // Get contract address (Ethereum only for now)
      const contract = coin.platforms?.ethereum;
      if (!contract) {
        body.innerHTML = W.ui.empty(
          "🧠",
          "No Ethereum contract for this token",
          "Smart scanning supports ERC-20 tokens on Ethereum.",
        );
        return;
      }

      // Get current price
      const cur = W.currency();
      const currentPrice = coin.market_data?.current_price?.[cur] || 0;
      if (!currentPrice) {
        body.innerHTML = W.ui.empty(
          "📊",
          "No price data available",
          "Try again later.",
        );
        return;
      }

      // Build historical price map
      const priceMap = await buildPriceMap(coin.id, 365);

      // Fetch token info and holders
      const [tok, holders] = await Promise.all([
        fetch(`${BLOCKSCOUT_API}/tokens/${contract}`).then((r) => r.json()),
        fetch(`${BLOCKSCOUT_API}/tokens/${contract}/holders`).then((r) =>
          r.json(),
        ),
      ]);

      if (!holders?.items || !holders.items.length) {
        body.innerHTML = W.ui.empty(
          "📭",
          "No holders found",
          "This token may not have enough on-chain activity.",
        );
        return;
      }

      // Analyze top holders
      const results = [];
      const topHolders = holders.items.slice(0, MAX_HOLDERS);

      for (const h of topHolders) {
        try {
          const txUrl = `${BLOCKSCOUT_API}/addresses/${h.address.hash}/token-transfers?token=${contract}`;
          const txs = await fetch(txUrl).then((r) => r.json());
          const analysis = analyzeWallet(
            txs.items || [],
            h.address.hash,
            priceMap,
            currentPrice,
          );
          results.push({
            address: h.address.hash,
            rawBalance: h.value,
            ...analysis,
          });
        } catch (e) {
          // ✅ FIX: Mask address in error logs
          console.warn(
            "[Smart] Failed to analyze holder:",
            W.fmt.maskAddress(h.address.hash),
            e,
          );
        }
      }

      // Sort by total P/L
      results.sort((a, b) => b.total - a.total);

      // ── Render ──────────────────────────────────────────
      const best = results[0];
      const totalInvested = results.reduce((sum, r) => sum + r.invested, 0);
      const totalPnl = results.reduce((sum, r) => sum + r.total, 0);

      body.innerHTML = `
        <div class="card">
          <h3>${coin.name} · top ${results.length} holders ranked by P/L</h3>
          <div class="cards">
            <div class="card stat">
              <div class="stat-label">Top Holder P/L</div>
              <div class="stat-big ${totalPnl >= 0 ? "up" : "down"}">
                ${totalPnl >= 0 ? "+" : ""}${W.fmt.money(totalPnl, { compact: true })}
              </div>
              <div class="stat-sub">${results.length} wallets analyzed</div>
            </div>
            <div class="card stat">
              <div class="stat-label">Best Wallet</div>
              <div class="stat-big">${best ? shortAddress(best.address) : "—"}</div>
              <div class="stat-sub">${best ? W.fmt.money(best.total, { compact: true }) : ""}</div>
            </div>
            <div class="card stat">
              <div class="stat-label">Accumulating</div>
              <div class="stat-big">${results.filter((r) => r.in7 > 0).length}</div>
              <div class="stat-sub">wallets buying in 7d</div>
            </div>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Wallet</th>
                  <th>Holdings</th>
                  <th>Realized P/L</th>
                  <th>Unrealized</th>
                  <th>Total</th>
                  <th>7d Activity</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${results
                  .map(
                    (r, i) => `
                  <tr>
                    <td class="muted">${i + 1}</td>
                    <td>
                      <code>${shortAddress(r.address)}</code>
                      <a class="link small" target="_blank" href="https://etherscan.io/address/${r.address}">↗</a>
                    </td>
                    <td>
                      ${r.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      <span class="muted small">${coin.symbol.toUpperCase()}</span>
                    </td>
                    <td class="${r.realized >= 0 ? "up" : "down"}">
                      ${r.realized >= 0 ? "+" : ""}${W.fmt.money(r.realized, { compact: true })}
                    </td>
                    <td class="${r.unrealized >= 0 ? "up" : "down"}">
                      ${r.unrealized >= 0 ? "+" : ""}${W.fmt.money(r.unrealized, { compact: true })}
                    </td>
                    <td>
                      <b class="${r.total >= 0 ? "up" : "down"}">
                        ${r.invested ? ((r.total / r.invested) * 100).toFixed(0) : "0"}%
                      </b>
                    </td>
                    <td>
                      ${
                        r.in7 > 0.0001
                          ? '<span class="tag buy">Accumulating</span>'
                          : r.in7 < -0.0001
                            ? '<span class="tag sell">Distributing</span>'
                            : '<span class="tag neutral">Idle</span>'
                      }
                    </td>
                    <td>
                      <button class="btn tiny" data-track="${r.address}">🐋 Track</button>
                    </td>
                  </tr>
                `,
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
          ${
            best
              ? `
            <div class="ai-brief mt">
              🤖 <b>Weaver:</b> the strongest wallet <code>${shortAddress(best.address)}</code>
              has generated <b>${W.fmt.money(best.total, { compact: true })}</b> on ${coin.name}
              and is currently <b>${best.in7 > 0 ? "accumulating" : "distributing"}</b>.
              High-P/L wallets buying now = smart money signal. Not financial advice.
            </div>
          `
              : ""
          }
        </div>
      `;

      // ── Track buttons ──────────────────────────────────
      body.querySelectorAll("[data-track]").forEach((btn) => {
        btn.onclick = () => {
          if (W.whales?.track) {
            const label = `Smart: ${coin.symbol.toUpperCase()} ${shortAddress(btn.dataset.track)}`;
            const ok = W.whales.track(btn.dataset.track, label, "eth");
            W.ui.toast(
              ok ? "Added to Whale Tracker 🐋" : "Already tracked",
              ok ? "ok" : "warn",
            );
          } else {
            W.ui.toast("Whale Tracker module not available.", "warn");
          }
        };
      });
    } catch (e) {
      console.error("[Smart] Scan error:", e);
      body.innerHTML = `
        <p class="muted">
          Scan failed: ${escapeHTML(e.message)}
          <br><span class="small">Blockscout may be rate-limited. Wait a few seconds and retry.</span>
        </p>
      `;
    }
  }

  // ── Render ─────────────────────────────────────────────

  async function render(view) {
    if (!view) {
      console.warn("[Smart] No view element provided");
      return;
    }

    let scanCoin = null;

    view.innerHTML = `
      <div class="card">
        <h3>🧠 Smart Money Tracker</h3>
        <p class="muted small">
          Scans a token's top on-chain holders, reconstructs 1 year of transfers at historical prices,
          and ranks wallets by total P/L. Profitable wallets that are <b>accumulating</b> right now = smart money.
          <br><span class="tag rank">ERC-20 tokens on Ethereum</span>
        </p>
        <div class="qa mt">
          <div id="sm-picker" style="min-width:280px;"></div>
          <button class="btn primary" id="sm-go">Scan Holders</button>
        </div>
      </div>
      <div id="sm-body"></div>
    `;

    // ── Coin picker ──────────────────────────────────────
    if (W.ui.coinPicker) {
      W.ui.coinPicker(view.querySelector("#sm-picker"), (p) => {
        scanCoin = p;
      });
    } else {
      console.warn("[Smart] coinPicker not available");
    }

    // ── Scan button ──────────────────────────────────────
    view.querySelector("#sm-go").onclick = async () => {
      if (!scanCoin) {
        W.ui.toast("Pick a token first", "warn");
        return;
      }
      // Fetch full coin data with contract info
      try {
        const coin = await W.api.coin(scanCoin.id);
        if (!coin) {
          W.ui.toast("Could not fetch coin data.", "warn");
          return;
        }
        await scanToken(coin, view);
      } catch (e) {
        W.ui.toast(`Error: ${e.message}`, "warn");
      }
    };
  }

  // ── Exports ────────────────────────────────────────────
  return {
    render,
    scanToken,
    analyzeWallet,
    buildPriceMap,
  };
})();

console.log("[Smart] Module loaded.");
