// ================================================================
//  Market Overview 
// ================================================================

window.W = window.W || {};

W.market = (() => {
  "use strict";

  const MAX_URL_LEN = 2048;
  const MAX_NAME_LEN = 100;
  const MAX_SYMBOL_LEN = 16;
  const MAX_ID_LEN = 128;

  // ── Attribute-safe escaping ───────────────────────────
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

  function safeStr(v, maxLen) {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return maxLen ? s.slice(0, maxLen) : s;
  }

  function safeNum(v, fallback = null) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  // ── Image URL allowlist ───────────────────────────────
  const IMG_PLACEHOLDER =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">' +
        '<rect width="24" height="24" fill="#2b2d42"/></svg>',
    );

  function safeImageUrl(u) {
    if (typeof u !== "string" || !u || u.length > MAX_URL_LEN) {
      return IMG_PLACEHOLDER;
    }
    try {
      const parsed = new URL(u);
      if (parsed.protocol !== "https:") return IMG_PLACEHOLDER;
      return parsed.toString();
    } catch {
      return IMG_PLACEHOLDER;
    }
  }

  function pctBucket(n) {
    const v = Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
    return Math.round(v / 10) * 10;
  }

  // ── Safe formatter wrappers ───────────────────────────
  // W.fmt.* behavior on null/undefined is out of scope for this
  // module. These wrappers guarantee "—" is shown rather than
  // "NaN", "undefined", or a thrown error.
  function fmtPrice(v) {
    if (v === null || v === undefined) return "—";
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    try {
      return W.fmt.price(n);
    } catch {
      return "—";
    }
  }
  function fmtPct(v) {
    if (v === null || v === undefined) return "—";
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    try {
      return W.fmt.pct(n);
    } catch {
      return "—";
    }
  }
  function fmtMoney(v) {
    if (v === null || v === undefined) return "—";
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    try {
      return W.fmt.money(n, { compact: true });
    } catch {
      return "—";
    }
  }

  // ── Card helper ───────────────────────────────────────
  // label, big, sub are all text. If a color class is supplied
  // for the big value, it is applied via a wrapping span. The
  // class is esc'd too — the value comes from a fixed enum in
  // every callsite, but escaping it here means no caller has to
  // remember which argument is "safe".
  function card(label, big, sub, bigClass) {
    const bigOut =
      bigClass && typeof bigClass === "string"
        ? '<span class="' + esc(bigClass) + '">' + esc(big) + "</span>"
        : esc(big);
    return (
      '<div class="card stat">' +
      '<div class="stat-label">' +
      esc(label) +
      "</div>" +
      '<div class="stat-big">' +
      bigOut +
      "</div>" +
      '<div class="stat-sub">' +
      esc(sub) +
      "</div>" +
      "</div>"
    );
  }

  // ── Row normalizer ────────────────────────────────────
  function normalizeRow(c) {
    if (!c || typeof c !== "object") return null;
    const id = safeStr(c.id, MAX_ID_LEN);
    if (!id) return null;
    return {
      id,
      symbol: safeStr(c.symbol, MAX_SYMBOL_LEN).toUpperCase(),
      name: safeStr(c.name, MAX_NAME_LEN),
      image: safeImageUrl(c.image),
      current_price: safeNum(c.current_price, null),
      change24h: safeNum(c.price_change_percentage_24h_in_currency, null),
      change7d: safeNum(c.price_change_percentage_7d_in_currency, null),
    };
  }

  // ── Mini table ────────────────────────────────────────
  function miniTable(rows) {
    if (!Array.isArray(rows) || !rows.length) {
      return '<p class="muted small">No data available.</p>';
    }
    const trs = rows
      .map((c) => {
        const href = "#/coin/" + encodeURIComponent(c.id);
        return (
          "<tr>" +
          '<td class="coin-cell">' +
          '<img src="' +
          esc(c.image) +
          '" alt="' +
          esc(c.name) +
          '"' +
          ' loading="lazy" referrerpolicy="no-referrer">' +
          '<a class="link" href="' +
          esc(href) +
          '">' +
          esc(c.symbol) +
          "</a>" +
          "</td>" +
          "<td>" +
          esc(fmtPrice(c.current_price)) +
          "</td>" +
          "<td>" +
          esc(fmtPct(c.change24h)) +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
    return '<table class="mini"><tbody>' + trs + "</tbody></table>";
  }

  // ── Heat color ────────────────────────────────────────
  function heatColor(p) {
    const n = safeNum(p, 0);
    const clamped = Math.max(-10, Math.min(10, n)) / 10;
    return clamped >= 0
      ? "rgba(46,230,168," + (0.15 + clamped * 0.55).toFixed(3) + ")"
      : "rgba(255,92,122," + (0.15 - clamped * 0.55).toFixed(3) + ")";
  }

  // ── Render ────────────────────────────────────────────
  async function render(view) {
    if (!view) {
      console.warn("[Market] No view element provided");
      return;
    }

    view.innerHTML = `
      <div class="cards" id="m-cards">${W.ui.spinner()}</div>
      <div class="grid-2">
        <div class="card"><h3>🔥 Trending Coins</h3><div id="m-trend">${W.ui.spinner()}</div></div>
        <div class="card"><h3>🧭 Altcoin Season Index</h3><div id="m-alt">${W.ui.spinner()}</div></div>
      </div>
      <div class="grid-2">
        <div class="card"><h3>📈 Top Gainers (24h)</h3><div id="m-gain"></div></div>
        <div class="card"><h3>📉 Top Losers (24h)</h3><div id="m-lose"></div></div>
      </div>
      <div class="card"><h3>🗺️ Market Heatmap (Top 40 · 7d)</h3><div id="m-heat" class="heatmap"></div></div>
    `;

    // ── Global stats ─────────────────────────────────────
    try {
      const [g, fg] = await Promise.all([W.api.global(), W.api.fearGreed()]);

      const d = g && g.data ? g.data : {};
      const fgVal = safeNum(fg && fg.value, null);
      const fgClass = safeStr(fg && fg.value_classification, 64);

      const btcDom = safeNum(
        d.market_cap_percentage && d.market_cap_percentage.btc,
        null,
      );
      const btcDomText = btcDom !== null ? btcDom.toFixed(1) + "%" : "—";

      const cur = W.currency();
      const totalCap =
        d.total_market_cap && cur ? d.total_market_cap[cur] : null;
      const totalVol = d.total_volume && cur ? d.total_volume[cur] : null;
      const capChange = safeNum(d.market_cap_change_percentage_24h_usd, null);

      const fgNumText = fgVal !== null ? String(fgVal) : "—";
      const fgColorClass =
        fgVal === null
          ? "text-muted"
          : fgVal > 50
            ? "text-up"
            : fgVal < 25
              ? "text-down"
              : "text-muted";

      const cardsEl = view.querySelector("#m-cards");
      if (cardsEl) {
        cardsEl.innerHTML =
          card("Fear & Greed Index", fgNumText, fgClass || "—", fgColorClass) +
          card("BTC Dominance", btcDomText, "of total market cap") +
          card("Total Market Cap", fmtMoney(totalCap), fmtPct(capChange)) +
          card("Total Volume (24h)", fmtMoney(totalVol), "all markets");
      }
    } catch (e) {
      const el = view.querySelector("#m-cards");
      if (el) {
        el.innerHTML =
          '<p class="muted">' + esc(safeStr(e && e.message, 200)) + "</p>";
      }
    }

    // ── Trending ─────────────────────────────────────────
    try {
      const t = await W.api.trending();
      const items = Array.isArray(t && t.coins) ? t.coins : [];

      const el = view.querySelector("#m-trend");
      if (!el) return;

      if (!items.length) {
        el.innerHTML = '<p class="muted small">No trending data available.</p>';
      } else {
        el.innerHTML = items
          .slice(0, 20)
          .map((x) => {
            const item = x && x.item ? x.item : {};
            const id = safeStr(item.id, MAX_ID_LEN);
            if (!id) return "";
            const href = "#/coin/" + encodeURIComponent(id);
            const img = safeImageUrl(item.small || item.thumb);
            const name = safeStr(item.name, MAX_NAME_LEN);
            const symbol = safeStr(item.symbol, MAX_SYMBOL_LEN);
            return (
              '<a class="trend-chip" href="' +
              esc(href) +
              '">' +
              '<img src="' +
              esc(img) +
              '" alt="' +
              esc(name) +
              '"' +
              ' loading="lazy" referrerpolicy="no-referrer">' +
              esc(name) +
              ' <span class="muted small">' +
              esc(symbol) +
              "</span>" +
              "</a>"
            );
          })
          .join("");
      }
    } catch (e) {
      const el = view.querySelector("#m-trend");
      if (el) {
        el.innerHTML =
          '<p class="muted">' + esc(safeStr(e && e.message, 200)) + "</p>";
      }
    }

    // ── Top / gainers / losers / alt season / heatmap ────
    try {
      const rawTop = await W.api.top(100);
      const top = Array.isArray(rawTop) ? rawTop : [];
      const normalized = top.map(normalizeRow).filter(Boolean);

      // ── Gainers / losers ──
      const sorted = normalized.slice().sort((a, b) => {
        const av = a.change24h === null ? -Infinity : a.change24h;
        const bv = b.change24h === null ? -Infinity : b.change24h;
        return bv - av;
      });

      const gainEl = view.querySelector("#m-gain");
      if (gainEl) gainEl.innerHTML = miniTable(sorted.slice(0, 8));
      const loseEl = view.querySelector("#m-lose");
      if (loseEl) loseEl.innerHTML = miniTable(sorted.slice(-8).reverse());

      // ── Altcoin Season Index ──
      const btc = normalized.find((c) => c.id === "bitcoin");
      const btc7d = btc && btc.change7d !== null ? btc.change7d : 0;
      const top50 = normalized.slice(0, 50).filter((c) => c.id !== "bitcoin");

      const beating = top50.filter(
        (c) => c.change7d !== null && c.change7d > btc7d,
      ).length;

      const idx = top50.length ? Math.round((beating / top50.length) * 100) : 0;

      const label =
        idx >= 75
          ? "Altcoin Season 🌈"
          : idx >= 25
            ? "Mixed Market"
            : "Bitcoin Season ₿";

      const altEl = view.querySelector("#m-alt");
      if (altEl) {
        altEl.innerHTML =
          '<div class="alt-num">' +
          esc(idx) +
          "</div>" +
          '<div class="alt-bar"><div class="meter-fill meter-fill-' +
          esc(pctBucket(idx)) +
          '"></div></div>' +
          '<p class="muted small">' +
          esc(beating) +
          "/" +
          esc(top50.length) +
          " of the top-50 coins outperformed BTC over 7 days (≥75 = Altcoin Season).</p>" +
          "<b>" +
          esc(label) +
          "</b>";
      }

      // ── Heatmap ──
      const heatCells = normalized.slice(0, 40).map((c) => {
        const p = c.change7d !== null ? c.change7d : 0;
        const href = "#/coin/" + encodeURIComponent(c.id);
        const title = c.name + " 7d: " + p.toFixed(2) + "%";
        return (
          '<a class="heat-cell heat-fill" ' +
          'data-heat="' +
          esc(heatColor(p)) +
          '" ' +
          'href="' +
          esc(href) +
          '" ' +
          'title="' +
          esc(title) +
          '">' +
          "<b>" +
          esc(c.symbol) +
          "</b>" +
          "<span>" +
          esc((p >= 0 ? "+" : "") + p.toFixed(1) + "%") +
          "</span>" +
          "</a>"
        );
      });

      const heatEl = view.querySelector("#m-heat");
      if (heatEl) {
        heatEl.innerHTML = heatCells.join("");
        heatEl.querySelectorAll(".heat-cell[data-heat]").forEach((el) => {
          const v = el.getAttribute("data-heat");
          if (typeof v === "string" && v.startsWith("rgba(")) {
            el.style.background = v;
          }
        });
      }
    } catch (e) {
      console.warn("[Market] Error fetching top data:", e && e.message);
      const el = view.querySelector("#m-heat");
      if (el) {
        el.innerHTML =
          '<p class="muted">' +
          esc(safeStr(e && e.message, 200) || "Failed to load market data") +
          "</p>";
      }
    }
  }

  return { render };
})();

console.log(
  "[Market] Module loaded v3 — attribute-safe, URL allowlist, shape-guarded.",
);
