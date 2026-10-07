// ================================================================
//     Smart Money Tracker
// ================================================================


window.W = window.W || {};

W.smart = (() => {
  const MODULE_VERSION = "smart-v2";
  const BLOCKSCOUT_API = "https://eth.blockscout.com/api/v2";
  const CACHE_TTL = 300000; // 5 minutes
  const MAX_HOLDERS = 8;
  const FETCH_TIMEOUT_MS = 8000;
  const MAX_RESPONSE_BYTES = 10 * 1024 * 1024; // 10 MB
  const MAX_TRANSFERS_PER_HOLDER = 2000; // hard cap on per-holder work

  const ETH_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

  // ── Escaping ──────────────────────────────────────────
  // Attribute-safe. Prefers the canonical escaper from misc.js
  // when present.
  const esc =
    typeof W.miscEsc === "function"
      ? W.miscEsc
      : function localEsc(v) {
          if (v == null) return "";
          const s = String(v);
          if (!/[&<>"']/.test(s)) return s;
          return s
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
        };

  // ── Warn-once ─────────────────────────────────────────
  const _warned = Object.create(null);
  function warnOnce(reason, msg) {
    if (_warned[reason]) return;
    _warned[reason] = 1;
    console.warn(msg);
  }

  // ── Numeric coercion ──────────────────────────────────
  // Returns a finite number or null. Never invents a value from
  // an absent one — an empty string, null, undefined, and NaN are
  // all distinct from "zero" and all map to null.
  function numOrNull(v) {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── URL validation ────────────────────────────────────
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

  // ── Address helpers ───────────────────────────────────
  function shortAddress(addr) {
    if (typeof addr !== "string" || addr.length < 10) return "—";
    return addr.slice(0, 6) + "…" + addr.slice(-4);
  }

  function isValidEthAddress(addr) {
    return typeof addr === "string" && ETH_ADDRESS_RE.test(addr);
  }

  // Logs an address in masked form. Never emit a full address.
  function masked(addr) {
    try {
      if (W.fmt && typeof W.fmt.maskAddress === "function") {
        return W.fmt.maskAddress(addr);
      }
    } catch {
      /* fall through */
    }
    return shortAddress(addr);
  }

  // ── Fetch with hardening ──────────────────────────────
  async function fetchJSON(url, schema, timeoutMs = FETCH_TIMEOUT_MS) {
    if (typeof url !== "string" || !url.startsWith(BLOCKSCOUT_API + "/")) {
      throw new Error("Invalid Blockscout URL");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    try {
      const init = {
        signal: controller.signal,
        credentials: "omit",
        mode: "cors",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        headers: { Accept: "application/json" },
      };
      response = W.requestGuard
        ? await W.requestGuard.fetch(url, init, {
            capacity: 8,
            refillMs: 10000,
            failureThreshold: 4,
            cooldownMs: 30000,
          })
        : await fetch(url, init);
    } catch (e) {
      clearTimeout(timer);
      const reason = e && e.name === "AbortError" ? "timed out" : e?.message;
      throw new Error(`Blockscout request failed: ${reason}`);
    }
    clearTimeout(timer);

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    // Size cap.
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
      throw new Error("Response exceeds size cap");
    }

    let text;
    try {
      text = await response.text();
    } catch {
      throw new Error("Failed to read response body");
    }
    if (text.length > MAX_RESPONSE_BYTES) {
      throw new Error("Response exceeds size cap");
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("Blockscout returned non-JSON");
    }

    // Schema validation is advisory. A mismatch is logged once, not
    // propagated — the API is third-party and its schema may evolve.
    if (W.schemas && schema) {
      try {
        W.schemas.validate(schema, data);
      } catch (e) {
        warnOnce(
          "schema-mismatch",
          `[Smart] Schema validation advisory: ${e && e.message}`,
        );
      }
    }

    W.dataHealth?.mark("on-chain", {
      source: "blockscout",
      observedAt: Date.now(),
      staleAfter: CACHE_TTL * 2,
    });
    return data;
  }

  // ── Price map ─────────────────────────────────────────
  // Builds a Map keyed by "Date.toString()" → price. Uses the
  // canonical W.api.chart() and accepts both of its possible return
  // shapes:
  //
  //   Array<[timestamp, close]>          (current prices.js)
  //   { prices: Array<[timestamp, close]> }  (legacy / CoinGecko)
  //
  // Returns Object.create(null) on any failure. An empty map means
  // "historical prices unavailable" — the caller must surface that
  // honestly, not silently fall back to current price for every
  // transfer (which is the bug that was fixed in v2).
  async function buildPriceMap(coinId, days = 365) {
    const map = Object.create(null);
    if (typeof coinId !== "string" || !coinId) return map;
    if (!W.api || typeof W.api.chart !== "function") return map;

    const cap = Math.max(1, Math.min(365, days | 0));

    let chart;
    try {
      chart = await W.api.chart(coinId, cap);
    } catch (e) {
      warnOnce(
        "chart-fetch-failed",
        `[Smart] Price chart fetch failed; P/L will be reported as unavailable. ${e && e.message}`,
      );
      return map;
    }

    // Accept both shapes. A bare array is the current shape.
    let points = [];
    if (Array.isArray(chart)) {
      points = chart;
    } else if (chart && Array.isArray(chart.prices)) {
      points = chart.prices;
    }

    // Bucket by calendar date, keeping the latest point per date.
    const byDate = Object.create(null);
    for (const p of points) {
      if (!Array.isArray(p) || p.length < 2) continue;
      const ts = numOrNull(p[0]);
      const price = numOrNull(p[1]);
      if (ts === null || price === null || price <= 0) continue;
      const key = new Date(ts).toDateString();
      const existing = byDate[key];
      if (!existing || ts > existing.ts) {
        byDate[key] = { price, ts };
      }
    }
    for (const k of Object.keys(byDate)) map[k] = byDate[k].price;

    if (Object.keys(map).length === 0) {
      warnOnce(
        "empty-price-map",
        "[Smart] Price map is empty; P/L will be reported as unavailable.",
      );
    }
    return map;
  }

  // ── Transfer quantity ─────────────────────────────────
  // Blockscout returns `total` as an object: { value, decimals }.
  // Value is a string of the raw (unscaled) integer amount.
  // Returns a finite non-negative number, or null for malformed
  // records. Never returns NaN.
  function parseQuantity(transfer) {
    if (!transfer || typeof transfer !== "object") return null;

    let raw = null;
    let decimals = 18;

    const total = transfer.total;
    if (total && typeof total === "object") {
      if (typeof total.value === "string" || typeof total.value === "number") {
        raw = String(total.value);
      }
      const d = Number(total.decimals);
      if (Number.isFinite(d) && d >= 0 && d <= 36) decimals = d;
    } else if (typeof total === "string" || typeof total === "number") {
      raw = String(total);
    }

    // Fall back to token.decimals if total.decimals was missing.
    if (
      decimals === 18 &&
      transfer.token &&
      typeof transfer.token === "object"
    ) {
      const td = Number(transfer.token.decimals);
      if (Number.isFinite(td) && td >= 0 && td <= 36) decimals = td;
    }

    if (!raw) return null;

    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return null;

    const qty = n / Math.pow(10, decimals);
    if (!Number.isFinite(qty) || qty < 0) return null;
    return qty;
  }

  // ── Wallet P/L ────────────────────────────────────────
  // Reconstructs a wallet's average cost basis from its transfer
  // history, using historical daily prices where available.
  //
  // Honest behavior:
  //   - When the price map is empty, `priced` is false and the
  //     caller must not present the realized/unrealized numbers as
  //     meaningful.
  //   - Malformed transfer records are skipped, not defaulted.
  //   - Outgoing transfers larger than the tracked balance are
  //     treated as "sold everything the wallet had" — cost cannot
  //     go negative.
  function analyzeWallet(transfers, walletAddress, priceMap, currentPrice) {
    const result = {
      balance: 0,
      realized: 0,
      unrealized: 0,
      total: 0,
      invested: 0,
      in7: 0,
      avgCost: 0,
      priced: false,
    };

    if (!isValidEthAddress(walletAddress)) return result;
    if (!Array.isArray(transfers)) return result;

    const wallet = walletAddress.toLowerCase();
    const map =
      priceMap && typeof priceMap === "object" ? priceMap : Object.create(null);
    const safeCurrent = numOrNull(currentPrice);
    const havePriceMap = Object.keys(map).length > 0;
    result.priced = havePriceMap;

    // Process transfers oldest to newest.
    const sorted = transfers.slice().sort((a, b) => {
      const ta = new Date(a?.timestamp || 0).getTime();
      const tb = new Date(b?.timestamp || 0).getTime();
      return (Number.isFinite(ta) ? ta : 0) - (Number.isFinite(tb) ? tb : 0);
    });

    let balance = 0;
    let cost = 0;
    let realized = 0;
    let invested = 0;
    let in7 = 0;
    const weekAgo = Date.now() - 7 * 864e5;

    for (const t of sorted) {
      const qty = parseQuantity(t);
      if (qty === null) continue;

      const toHash =
        t && t.to && typeof t.to.hash === "string"
          ? t.to.hash.toLowerCase()
          : "";
      const fromHash =
        t && t.from && typeof t.from.hash === "string"
          ? t.from.hash.toLowerCase()
          : "";

      // Self-transfer or transfer involving neither party — skip.
      if (toHash === fromHash) continue;
      if (toHash !== wallet && fromHash !== wallet) continue;

      const ts = new Date(t?.timestamp || 0).getTime();
      const dateKey = Number.isFinite(ts) ? new Date(ts).toDateString() : "";
      const mapPrice = dateKey ? numOrNull(map[dateKey]) : null;
      const price =
        mapPrice !== null ? mapPrice : safeCurrent !== null ? safeCurrent : 0;

      if (toHash === wallet) {
        // Incoming.
        balance += qty;
        cost += qty * price;
        invested += qty * price;
        if (Number.isFinite(ts) && ts >= weekAgo) in7 += qty;
      } else {
        // Outgoing. Sell up to what the wallet had.
        const sellQty = Math.min(qty, balance);
        if (sellQty <= 0) continue;
        const avgCost = balance > 0 ? cost / balance : price;
        realized += sellQty * (price - avgCost);
        cost -= sellQty * avgCost;
        balance -= sellQty;
        if (Number.isFinite(ts) && ts >= weekAgo) in7 -= sellQty;
      }
    }

    // Guard every numeric field against NaN before returning.
    result.balance = Number.isFinite(balance) ? balance : 0;
    result.realized = Number.isFinite(realized) ? realized : 0;
    result.invested = Number.isFinite(invested) ? invested : 0;
    result.in7 = Number.isFinite(in7) ? in7 : 0;

    const avgCost =
      balance > 0 && Number.isFinite(cost)
        ? cost / balance
        : safeCurrent !== null
          ? safeCurrent
          : 0;
    result.avgCost = Number.isFinite(avgCost) ? avgCost : 0;

    const unrealized =
      balance > 0 && safeCurrent !== null
        ? balance * (safeCurrent - result.avgCost)
        : 0;
    result.unrealized = Number.isFinite(unrealized) ? unrealized : 0;
    result.total = Number.isFinite(result.realized + result.unrealized)
      ? result.realized + result.unrealized
      : 0;

    return result;
  }

  // ── Scan concurrency guard ────────────────────────────
  let _scanning = false;

  // ── Token scan ────────────────────────────────────────
  async function scanToken(coin, view) {
    if (!view || !view.isConnected) return;
    const body = view.querySelector("#sm-body");
    if (!body) return;

    if (_scanning) {
      W.ui?.toast?.("A scan is already in progress", "info", 2000);
      return;
    }
    _scanning = true;

    try {
      await _scanTokenImpl(coin, view, body);
    } finally {
      _scanning = false;
    }
  }

  async function _scanTokenImpl(coin, view, body) {
    body.innerHTML = W.ui.spinner();

    // ── Validate coin shape ────────────────────────────
    if (!coin || typeof coin !== "object") {
      body.innerHTML = W.ui.empty(
        "🧠",
        "No token selected",
        "Pick a token to scan.",
      );
      return;
    }

    // ── Resolve contract address ───────────────────────
    const contractRaw =
      coin.platforms && typeof coin.platforms === "object"
        ? coin.platforms.ethereum
        : null;
    if (!isValidEthAddress(contractRaw)) {
      body.innerHTML = W.ui.empty(
        "🧠",
        "No Ethereum contract for this token",
        "Smart scanning supports ERC-20 tokens on Ethereum.",
      );
      return;
    }
    const contract = contractRaw.toLowerCase();

    // ── Current price ──────────────────────────────────
    const cur =
      typeof W.currency === "function"
        ? String(W.currency() || "usd").toLowerCase()
        : "usd";
    const currentPrice = numOrNull(
      coin.market_data &&
        coin.market_data.current_price &&
        coin.market_data.current_price[cur],
    );
    if (currentPrice === null || currentPrice <= 0) {
      body.innerHTML = W.ui.empty(
        "📊",
        "No price data available",
        "Try again later.",
      );
      return;
    }

    // ── Historical price map ───────────────────────────
    // The `priced` flag on each analyzed wallet is derived from
    // whether this map is non-empty. When it is empty, the render
    // surfaces "P/L unavailable" instead of a fabricated zero.
    let priceMap = Object.create(null);
    try {
      priceMap = await buildPriceMap(coin.id, 365);
    } catch (e) {
      warnOnce(
        "price-map-failed",
        `[Smart] Price map construction failed: ${e && e.message}`,
      );
    }
    if (!view.isConnected) return;

    // ── Fetch token info and holders ───────────────────
    let holders;
    try {
      const [, h] = await Promise.all([
        fetchJSON(`${BLOCKSCOUT_API}/tokens/${contract}`, "blockscoutToken"),
        fetchJSON(
          `${BLOCKSCOUT_API}/tokens/${contract}/holders`,
          "blockscoutCollection",
        ),
      ]);
      holders = h;
    } catch (e) {
      console.error("[Smart] Holder fetch failed:", e?.message);
      body.innerHTML = W.ui.empty(
        "⚠️",
        "Blockscout request failed",
        "The on-chain data provider may be rate-limited. Retry in a few seconds.",
      );
      return;
    }
    if (!view.isConnected) return;

    const holderItems =
      holders && Array.isArray(holders.items) ? holders.items : [];
    if (!holderItems.length) {
      body.innerHTML = W.ui.empty(
        "📭",
        "No holders found",
        "This token may not have enough on-chain activity.",
      );
      return;
    }

    // ── Analyze top holders ────────────────────────────
    const results = [];
    const topHolders = holderItems.slice(0, MAX_HOLDERS);

    for (const h of topHolders) {
      if (!h || !h.address || !isValidEthAddress(h.address.hash)) continue;
      const addr = h.address.hash.toLowerCase();

      try {
        const txUrl = `${BLOCKSCOUT_API}/addresses/${addr}/token-transfers?token=${contract}`;
        const txs = await fetchJSON(txUrl, "blockscoutCollection");

        let items = Array.isArray(txs?.items) ? txs.items : [];
        if (items.length > MAX_TRANSFERS_PER_HOLDER) {
          // Newest first from Blockscout; take the most recent slice.
          items = items.slice(0, MAX_TRANSFERS_PER_HOLDER);
        }

        const analysis = analyzeWallet(items, addr, priceMap, currentPrice);
        results.push({
          address: addr,
          rawBalance: h.value,
          ...analysis,
        });
      } catch (e) {
        // Mask the address — it is not "personal data", but it is
        // the only PII-shaped value in this module and the
        // constitution requires masked logging.
        console.warn(
          "[Smart] Failed to analyze holder:",
          masked(addr),
          e && e.message,
        );
      }
    }

    if (!view.isConnected) return;

    if (!results.length) {
      body.innerHTML = W.ui.empty(
        "🚧",
        "No holders could be analyzed",
        "Blockscout was unreachable for every holder. Try again later.",
      );
      return;
    }

    // ── Sort: by total P/L, but only for priced results ─
    // Unpriced results sort to the bottom. This keeps the ranking
    // honest when the historical map is empty.
    results.sort((a, b) => {
      if (a.priced !== b.priced) return a.priced ? -1 : 1;
      return b.total - a.total;
    });

    // ── Render ─────────────────────────────────────────
    const best = results.find((r) => r.priced) || null;
    const anyPriced = results.some((r) => r.priced);
    const totalPnl = anyPriced
      ? results.reduce((sum, r) => sum + (r.priced ? r.total : 0), 0)
      : null;

    const safeName = esc(coin.name || coin.id || "Token");
    const safeSymbol = esc(String(coin.symbol || "TOKEN").toUpperCase());

    const pnlDisplay =
      totalPnl === null
        ? '<span class="muted">Unavailable</span>'
        : `${totalPnl >= 0 ? "+" : ""}${esc(
            safeMoney(totalPnl, { compact: true }),
          )}`;

    const pnlClass =
      totalPnl === null ? "muted" : totalPnl >= 0 ? "up" : "down";

    body.innerHTML = `
      <div class="card">
        <h3>${safeName} · top ${esc(results.length)} holders</h3>
        <div class="cards">
          <div class="card stat">
            <div class="stat-label">Top Holder P/L</div>
            <div class="stat-big ${pnlClass}">${pnlDisplay}</div>
            <div class="stat-sub">${esc(results.length)} wallets analyzed${
              anyPriced ? "" : " · historical prices unavailable"
            }</div>
          </div>
          <div class="card stat">
            <div class="stat-label">Best Wallet</div>
            <div class="stat-big">${
              best ? esc(shortAddress(best.address)) : "—"
            }</div>
            <div class="stat-sub">${
              best ? esc(safeMoney(best.total, { compact: true })) : ""
            }</div>
          </div>
          <div class="card stat">
            <div class="stat-label">Accumulating</div>
            <div class="stat-big">${esc(
              results.filter((r) => r.in7 > 0).length,
            )}</div>
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
                <th>Return</th>
                <th>7d Activity</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${results
                .map((r, i) => {
                  const addr = esc(r.address);
                  const short = esc(shortAddress(r.address));
                  const etherscan = safeExternalUrl(
                    `https://etherscan.io/address/${r.address}`,
                  );
                  const balance = Number.isFinite(r.balance)
                    ? r.balance.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })
                    : "—";

                  const realizedCell = r.priced
                    ? `<span class="${r.realized >= 0 ? "up" : "down"}">${
                        r.realized >= 0 ? "+" : ""
                      }${esc(safeMoney(r.realized, { compact: true }))}</span>`
                    : '<span class="muted">—</span>';

                  const unrealizedCell = r.priced
                    ? `<span class="${r.unrealized >= 0 ? "up" : "down"}">${
                        r.unrealized >= 0 ? "+" : ""
                      }${esc(safeMoney(r.unrealized, { compact: true }))}</span>`
                    : '<span class="muted">—</span>';

                  const returnCell =
                    r.priced && r.invested > 0
                      ? `<b class="${r.total >= 0 ? "up" : "down"}">${esc(
                          ((r.total / r.invested) * 100).toFixed(0),
                        )}%</b>`
                      : '<span class="muted">—</span>';

                  const activity =
                    r.in7 > 0.0001
                      ? '<span class="tag buy">Accumulating</span>'
                      : r.in7 < -0.0001
                        ? '<span class="tag sell">Distributing</span>'
                        : '<span class="tag neutral">Idle</span>';

                  return `
                  <tr>
                    <td class="muted">${esc(i + 1)}</td>
                    <td>
                      <code>${short}</code>
                      ${
                        etherscan
                          ? `<a class="link small" target="_blank" rel="noopener noreferrer" href="${esc(etherscan)}">↗</a>`
                          : ""
                      }
                    </td>
                    <td>
                      ${esc(balance)}
                      <span class="muted small">${safeSymbol}</span>
                    </td>
                    <td>${realizedCell}</td>
                    <td>${unrealizedCell}</td>
                    <td>${returnCell}</td>
                    <td>${activity}</td>
                    <td>
                      <button class="btn tiny" data-track="${addr}" type="button">🐋 Track</button>
                    </td>
                  </tr>
                `;
                })
                .join("")}
            </tbody>
          </table>
        </div>
        ${
          best
            ? `
            <div class="ai-brief mt">
              🤖 <b>Weaver:</b> the strongest priced wallet <code>${esc(
                shortAddress(best.address),
              )}</code>
              has generated <b>${esc(
                safeMoney(best.total, { compact: true }),
              )}</b> on ${safeName}
              and is currently <b>${
                best.in7 > 0 ? "accumulating" : "distributing"
              }</b>. Not financial advice.
            </div>
          `
            : ""
        }
        ${
          anyPriced
            ? ""
            : `
            <p class="muted small mt-8">
              Historical prices could not be fetched. P/L columns are unavailable
              rather than fabricated. Retry the scan in a few minutes.
            </p>
          `
        }
      </div>
    `;

    // ── Track buttons ──────────────────────────────────
    body.querySelectorAll("[data-track]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const addr = btn.dataset.track;
        if (!isValidEthAddress(addr)) {
          W.ui?.toast?.("Invalid address", "warn");
          return;
        }
        if (!W.whales || typeof W.whales.track !== "function") {
          W.ui?.toast?.("Whale Tracker module not available.", "warn");
          return;
        }
        try {
          const label = `Smart: ${String(
            coin.symbol || "TOKEN",
          ).toUpperCase()} ${shortAddress(addr)}`;
          const ok = W.whales.track(addr, label, "eth");
          W.ui.toast(
            ok ? "Added to Whale Tracker 🐋" : "Already tracked",
            ok ? "ok" : "warn",
          );
        } catch (e) {
          W.ui?.toast?.(`Track failed: ${e?.message || "unknown"}`, "warn");
        }
      });
    });
  }

  // ── safeMoney ─────────────────────────────────────────
  // Wrapper around W.fmt.money with a string fallback so a missing
  // formatter does not crash the render.
  function safeMoney(value, opts) {
    if (!Number.isFinite(value)) return "—";
    try {
      if (W.fmt && typeof W.fmt.money === "function") {
        return W.fmt.money(value, opts);
      }
    } catch {
      /* fall through */
    }
    return value.toFixed(2);
  }

  // ── Holders helper for the Smart Money Radar ──────────
  // Small extraction of the holder fetch scanToken already
  // performs, exposed so the radar module shares one request path.
  async function fetchHolders(contract) {
    if (!isValidEthAddress(contract)) return null;
    try {
      const h = await fetchJSON(
        `${BLOCKSCOUT_API}/tokens/${contract}/holders`,
        "blockscoutCollection",
      );
      return h && Array.isArray(h.items) ? h.items : null;
    } catch (e) {
      warnOnce(
        "holders-failed",
        `[Smart] Holder fetch failed: ${e && e.message}`,
      );
      return null;
    }
  }

  // ── Render ────────────────────────────────────────────
  async function render(view) {
    if (!view || !view.isConnected) {
      warnOnce("no-view", "[Smart] No view element provided");
      return;
    }

    let scanCoin = null;

    view.innerHTML = `
      <div class="card">
        <h3>🧠 Smart Money Tracker</h3>
        <p class="muted small">
          Scans a token's top on-chain holders, reconstructs 1 year of
          transfers at historical prices, and ranks wallets by total P/L.
          Profitable wallets that are <b>accumulating</b> right now = smart
          money.
          <br><span class="tag rank">ERC-20 tokens on Ethereum</span>
        </p>
        <div class="qa mt">
          <div id="sm-picker" class="min-w-280"></div>
          <button class="btn primary" id="sm-go" type="button">Scan Holders</button>
        </div>
      </div>
      <div id="sm-body"></div>
      <div class="card" id="sm-radar-card">
        <h3>📡 Smart Money Radar</h3>
        <p class="muted small">
          Detects when N independent historically-early wallets are
          accumulating the same token <b>before</b> broad momentum confirms
          it. Uses the picked token's top holders as the candidate pool.
          ETH-only. Bounded at ${MAX_HOLDERS} wallets per scan.
        </p>
        <div class="qa mt">
          <button class="btn primary" id="sm-radar-go" type="button">
            🎯 Scan for smart-money convergence
          </button>
        </div>
        <div id="sm-radar-body"></div>
      </div>
    `;

    // ── Coin picker ────────────────────────────────────
    const pickerHost = view.querySelector("#sm-picker");
    if (pickerHost && W.ui && typeof W.ui.coinPicker === "function") {
      try {
        W.ui.coinPicker(pickerHost, (p) => {
          scanCoin = p || null;
          if (pickerHost && pickerHost.dataset) {
            pickerHost.dataset.pickedId =
              p && typeof p.id === "string" ? p.id : "";
            pickerHost.dataset.pickedSymbol =
              p && typeof p.symbol === "string" ? p.symbol : "";
          }
        });
      } catch (e) {
        warnOnce(
          "picker-failed",
          `[Smart] coinPicker wiring failed: ${e && e.message}`,
        );
      }
    } else {
      warnOnce("no-picker", "[Smart] coinPicker not available");
    }

    // ── Scan button ────────────────────────────────────
    const goBtn = view.querySelector("#sm-go");
    if (!goBtn) return;
    goBtn.addEventListener("click", async () => {
      if (!scanCoin || typeof scanCoin.id !== "string") {
        W.ui?.toast?.("Pick a token first", "warn");
        return;
      }
      if (!W.api || typeof W.api.coin !== "function") {
        W.ui?.toast?.("Market data module unavailable.", "warn");
        return;
      }
      goBtn.disabled = true;
      try {
        const coin = await W.api.coin(scanCoin.id);
        if (!view.isConnected) return;
        if (!coin) {
          W.ui?.toast?.("Could not fetch coin data.", "warn");
          return;
        }
        await scanToken(coin, view);
      } catch (e) {
        W.ui?.toast?.(`Error: ${e?.message || "unknown"}`, "warn");
      } finally {
        goBtn.disabled = false;
      }
    });
  }

  // ── Radar delegation ──────────────────────────────────
  // One delegated listener at module scope. Reads the picked
  // coin from the picker host's dataset (set by the picker
  // callback above) so it does not need render()'s closure.
  document.addEventListener("click", (e) => {
    const target = e && e.target;
    if (!target || typeof target.closest !== "function") return;
    const btn = target.closest("#sm-radar-go");
    if (!btn || btn.disabled) return;

    const view =
      btn.closest("#view") || document.getElementById("view");
    if (!view) return;
    const pickerHost = view.querySelector("#sm-picker");
    const pickedId = (pickerHost && pickerHost.dataset && pickerHost.dataset.pickedId) || "";
    const pickedSymbol =
      (pickerHost && pickerHost.dataset && pickerHost.dataset.pickedSymbol) || "";

    if (!pickedId) {
      W.ui?.toast?.("Pick a token first", "warn");
      return;
    }
    if (!W.smartRadar || typeof W.smartRadar.scan !== "function") {
      W.ui?.toast?.("Smart Money Radar module not loaded", "warn");
      return;
    }

    btn.disabled = true;
    Promise.resolve(W.smartRadar.scan({ id: pickedId, symbol: pickedSymbol }, view))
      .catch((err) => {
        W.ui?.toast?.(
          "Radar scan failed: " + (err && err.message ? err.message : "unknown"),
          "warn",
        );
      })
      .finally(() => {
        btn.disabled = false;
      });
  });

  // ── Public API ────────────────────────────────────────
  return Object.freeze({
    render,
    scanToken,
    analyzeWallet,
    buildPriceMap,
    fetchHolders,
    version: MODULE_VERSION,
    _internal: Object.freeze({
      esc,
      numOrNull,
      safeExternalUrl,
      shortAddress,
      isValidEthAddress,
      parseQuantity,
      resetWarnings: () => {
        for (const k of Object.keys(_warned)) delete _warned[k];
      },
    }),
  });
})();

console.log(
  "[Smart] Module loaded (smart-v2: fixed price-map shape, attribute-safe escaping, NaN-guarded P/L).",
);
