// ===============================================================
//   Coin Explorer — single-file, self-contained
//   Fixes over previous revision:
//     · md undefined in renderCoin (ReferenceError on every render)
//     · tdRank appended twice in search results
//   All helpers live in this file. No W.validate dependency.
// ===============================================================

window.W = window.W || {};

W.explorer = (() => {
  "use strict";

  let chart = null;
  let chartAbortController = null;

  // Precision-aware price formatter. Default toLocaleString uses
  // 2 fraction digits, which renders any sub-cent token as $0.00.
  // Pick the number of digits from the magnitude.
  function fmtChartPrice(value) {
    const v = Number(value);
    if (!Number.isFinite(v)) return "—";
    if (v === 0) return "$0";
    const abs = Math.abs(v);
    if (abs >= 1) return "$" + v.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (abs >= 0.01) return "$" + v.toLocaleString(undefined, { maximumFractionDigits: 4 });
    if (abs >= 0.0001) return "$" + v.toLocaleString(undefined, { maximumFractionDigits: 6 });
    // Below 0.0001, use significant digits so tiny values are not
    // rounded to zero. 4 sig figs is enough for the tooltip; the
    // axis falls back to the same function.
    return "$" + v.toPrecision(4);
  }


  // ── Constants ─────────────────────────────────────────
  const MAX_SEARCH_QUERY_LEN = 100;
  const MAX_DESCRIPTION_LEN = 600;
  const MAX_COIN_NAME_LEN = 100;
  const MAX_SYMBOL_LEN = 16;
  const MAX_URL_LEN = 2048;
  const MAX_CONTRACT_ADDR_LEN = 128;

  // ── Prototype-safe map factory ────────────────────────
  function newMap() {
    return Object.create(null);
  }

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

  function safeInt(v, fallback = null) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.floor(n) : fallback;
  }

  // ── Image URL allowlist ───────────────────────────────
  const IMG_PLACEHOLDER =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48">' +
        '<rect width="48" height="48" fill="#2b2d42"/>' +
        '<circle cx="24" cy="24" r="10" fill="#4a4e69"/></svg>',
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

  // ── External link allowlist ───────────────────────────
  function safeExternalUrl(u) {
    if (typeof u !== "string" || !u || u.length > MAX_URL_LEN) return null;
    try {
      const parsed = new URL(u);
      if (parsed.protocol !== "https:") return null;
      return parsed.toString();
    } catch {
      return null;
    }
  }

  // ── Description sanitizer ─────────────────────────────
  function sanitizeDescription(raw, maxLen) {
    if (typeof raw !== "string" || !raw) return "";
    let text;
    try {
      const doc = new DOMParser().parseFromString(raw, "text/html");
      text = doc.body ? doc.body.textContent || "" : "";
    } catch {
      text = raw.replace(/[<>]/g, "");
    }
    text = text.replace(/\s+/g, " ").trim();
    return maxLen ? text.slice(0, maxLen) : text;
  }

  // ── Safe clipboard write ──────────────────────────────
  async function safeCopyToClipboard(text) {
    if (typeof text !== "string" || !text) return false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {
      console.warn("[Explorer] Clipboard write failed:", e && e.message);
    }
    return false;
  }

  // ── Danger-key scan ───────────────────────────────────
  const DANGER_KEYS = ["__proto__", "constructor", "prototype"];

  function hasDangerKeys(obj, depth = 0) {
    if (depth > 32) return true;
    if (obj === null || typeof obj !== "object") return false;
    if (Array.isArray(obj)) {
      for (const item of obj) {
        if (hasDangerKeys(item, depth + 1)) return true;
      }
      return false;
    }
    for (const key of Object.keys(obj)) {
      if (DANGER_KEYS.includes(key)) return true;
      if (hasDangerKeys(obj[key], depth + 1)) return true;
    }
    return false;
  }

  // ── Coin data normalizer ──────────────────────────────
  function normalizeCoin(c) {
    if (!c || typeof c !== "object") return null;
    if (hasDangerKeys(c)) return null;

    const md =
      c.market_data && typeof c.market_data === "object" ? c.market_data : {};

    const coin = newMap();
    coin.id = safeStr(c.id, 128);
    if (!coin.id) return null;
    coin.symbol = safeStr(c.symbol, MAX_SYMBOL_LEN).toUpperCase();
    coin.name = safeStr(c.name, MAX_COIN_NAME_LEN);
    coin.imageLarge = safeImageUrl(c.image && c.image.large);
    coin.marketCapRank = safeInt(c.market_cap_rank, null);
    coin.description = sanitizeDescription(
      c.description && c.description.en,
      MAX_DESCRIPTION_LEN,
    );

    coin.platforms = newMap();
    if (c.platforms && typeof c.platforms === "object") {
      let count = 0;
      for (const key of Object.keys(c.platforms)) {
        if (count >= 20) break;
        if (DANGER_KEYS.includes(key)) continue;
        const addr = c.platforms[key];
        if (typeof addr === "string" && addr.length <= MAX_CONTRACT_ADDR_LEN) {
          coin.platforms[safeStr(key, 64)] = addr;
        }
        count++;
      }
    }

    coin.homepage = null;
    if (
      c.links &&
      Array.isArray(c.links.homepage) &&
      c.links.homepage.length > 0
    ) {
      coin.homepage = safeExternalUrl(c.links.homepage[0]);
    }

    // Store market data under a single key. Previously the caller
    // referenced `md` as a separate variable that was never set.
    coin.marketData = newMap();
    const mdFields = [
      "current_price",
      "market_cap",
      "total_volume",
      "ath",
      "atl",
      "price_change_percentage_24h",
      "ath_change_percentage",
      "circulating_supply",
      "max_supply",
    ];
    for (const f of mdFields) {
      const v = md[f];
      coin.marketData[f] = v && typeof v === "object" ? v : v;
    }

    return coin;
  }

  // ── Search result normalizer ──────────────────────────
  function normalizeSearchResult(c) {
    if (!c || typeof c !== "object") return null;
    const id = safeStr(c.id, 128);
    if (!id) return null;
    return {
      id,
      symbol: safeStr(c.symbol, MAX_SYMBOL_LEN).toUpperCase(),
      name: safeStr(c.name, MAX_COIN_NAME_LEN),
      thumb: safeImageUrl(c.thumb),
      marketCapRank: safeInt(c.market_cap_rank, null),
    };
  }

  // ── Render Search ─────────────────────────────────────
  async function render(view) {
    if (!view) return;

    view.innerHTML = `
      <div class="card">
        <h3>🔍 Coin Explorer</h3>
        <input id="x-search" class="input big" maxlength="${MAX_SEARCH_QUERY_LEN}" placeholder="Search any cryptocurrency…" autocomplete="off">
        <div id="x-results"></div>
      </div>
    `;

    const input = view.querySelector("#x-search");
    const results = view.querySelector("#x-results");
    if (!input || !results) return;

    let requestSeq = 0;

    input.addEventListener(
      "input",
      W.debounce(async () => {
        const q = safeStr(input.value, MAX_SEARCH_QUERY_LEN).trim();
        if (q.length < 2) {
          results.innerHTML = "";
          return;
        }

        const mySeq = ++requestSeq;

        try {
          const data = await W.api.search(q);
          if (mySeq !== requestSeq) return;

          const coins = Array.isArray(data && data.coins) ? data.coins : [];
          const normalized = coins
            .slice(0, 10)
            .map(normalizeSearchResult)
            .filter(Boolean);

          if (!normalized.length) {
            results.innerHTML = W.ui.empty(
              "🔍",
              "No results",
              "Try a different search term",
            );
            return;
          }

          const wrap = document.createElement("div");
          wrap.className = "table-wrap";
          const table = document.createElement("table");
          const tbody = document.createElement("tbody");

          for (const c of normalized) {
            const tr = document.createElement("tr");
            tr.className = "clickable";
            tr.setAttribute("data-id", c.id);

            const tdImg = document.createElement("td");
            tdImg.className = "w-40";
            const img = document.createElement("img");
            img.className = "coin-img";
            img.src = c.thumb;
            img.alt = c.name;
            img.loading = "lazy";
            img.referrerPolicy = "no-referrer";
            tdImg.appendChild(img);

            const tdName = document.createElement("td");
            const nameB = document.createElement("b");
            nameB.textContent = c.name;
            const symSpan = document.createElement("span");
            symSpan.className = "muted small";
            symSpan.textContent = " " + c.symbol;
            tdName.appendChild(nameB);
            tdName.appendChild(symSpan);

            const tdRank = document.createElement("td");
            tdRank.className = "muted";
            tdRank.textContent = c.marketCapRank
              ? "Rank #" + c.marketCapRank
              : "";

            tr.appendChild(tdImg);
            tr.appendChild(tdName);
            tr.appendChild(tdRank); // ← once, not twice
            tbody.appendChild(tr);

            tr.onclick = () => {
              location.hash = "#/coin/" + encodeURIComponent(c.id);
            };
          }

          table.appendChild(tbody);
          wrap.appendChild(table);
          results.innerHTML = "";
          results.appendChild(wrap);
        } catch (e) {
          if (mySeq !== requestSeq) return;
          const msg =
            e && e.message ? String(e.message).slice(0, 200) : "Search failed";
          W.ui.toast(msg, "warn");
        }
      }, 350),
    );
  }

  // ── Render Coin Detail ────────────────────────────────
  async function renderCoin(view, id) {
    if (!view) return;
    view.innerHTML = W.ui.spinner();

    try {
      const raw = await W.api.coin(id);
      if (!raw) throw new Error("Coin not found");

      const c = normalizeCoin(raw);
      if (!c) throw new Error("Coin data malformed");

      const cur = W.currency();

      view.innerHTML = "";
      // ── FIX: pass c.marketData, not an undefined `md` ──
      view.appendChild(buildCoinHeader(c, c.marketData, cur, id));
      view.appendChild(buildChartCard(id));
      view.appendChild(buildStatsGrid(c, cur));

      wireCoinInteractions(view, c, id);
    } catch (e) {
      view.innerHTML = "";
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent = safeStr(e && e.message, 200) || "Failed to load coin";
      view.appendChild(p);
    }
  }

  // ── Coin header builder ───────────────────────────────
  function buildCoinHeader(c, md, cur, id) {
    const card = document.createElement("div");
    card.className = "card coin-head";

    const img = document.createElement("img");
    img.className = "coin-lg";
    img.src = c.imageLarge;
    img.alt = c.name;
    img.referrerPolicy = "no-referrer";
    card.appendChild(img);

    const right = document.createElement("div");

    const h2 = document.createElement("h2");
    h2.appendChild(document.createTextNode(c.name + " "));
    const symSpan = document.createElement("span");
    symSpan.className = "muted";
    symSpan.textContent = c.symbol;
    h2.appendChild(symSpan);
    if (c.marketCapRank) {
      h2.appendChild(document.createTextNode(" "));
      const rankTag = document.createElement("span");
      rankTag.className = "tag rank";
      rankTag.textContent = "#" + c.marketCapRank;
      h2.appendChild(rankTag);
    }
    right.appendChild(h2);

    const priceDiv = document.createElement("div");
    priceDiv.className = "coin-price";
    const priceText =
      md && md.current_price && md.current_price[cur] !== undefined
        ? W.fmt.price(md.current_price[cur])
        : "—";
    priceDiv.textContent = priceText + " ";
    const pctSpan = document.createElement("span");
    pctSpan.className = "ml";
    pctSpan.textContent = W.fmt.pct(md ? md.price_change_percentage_24h : null);
    priceDiv.appendChild(pctSpan);
    right.appendChild(priceDiv);

    const actions = document.createElement("div");
    actions.className = "mt qa";

    const watchBtn = document.createElement("button");
    watchBtn.className = "btn tiny" + (W.watchlist.has(id) ? " primary" : "");
    watchBtn.id = "x-watch";
    watchBtn.textContent = W.watchlist.has(id) ? "★ Watching" : "☆ Watch";
    actions.appendChild(watchBtn);

    const addBtn = document.createElement("button");
    addBtn.className = "btn tiny";
    addBtn.id = "x-add";
    addBtn.textContent = "+ Add to Portfolio";
    actions.appendChild(addBtn);

    if (c.homepage) {
      const webLink = document.createElement("a");
      webLink.className = "btn tiny";
      webLink.href = c.homepage;
      webLink.target = "_blank";
      webLink.rel = "noopener noreferrer";
      webLink.textContent = "🌐 Website";
      actions.appendChild(webLink);
    }

    right.appendChild(actions);
    card.appendChild(right);
    return card;
  }

  // ── Chart card builder ────────────────────────────────
  function buildChartCard(id) {
    const card = document.createElement("div");
    card.className = "card";

    const rangeRow = document.createElement("div");
    rangeRow.className = "range-row";
    for (const [d, label] of [
      ["1", "24H"],
      ["7", "7D"],
      ["30", "1M"],
      ["90", "3M"],
      ["365", "1Y"],
    ]) {
      const btn = document.createElement("button");
      btn.className = "chip" + (d === "7" ? " active" : "");
      btn.setAttribute("data-days", d);
      btn.textContent = label;
      rangeRow.appendChild(btn);
    }
    card.appendChild(rangeRow);

    const chartBox = document.createElement("div");
    chartBox.className = "chart-box tall";
    const canvas = document.createElement("canvas");
    canvas.id = "x-chart";
    chartBox.appendChild(canvas);
    card.appendChild(chartBox);

    return card;
  }

  // ── Stats grid builder ────────────────────────────────
  function buildStatsGrid(c, cur) {
    const grid = document.createElement("div");
    grid.className = "grid-2";

    const statsCard = document.createElement("div");
    statsCard.className = "card";
    const statsH3 = document.createElement("h3");
    statsH3.textContent = "Market Statistics";
    statsCard.appendChild(statsH3);

    const md = c.marketData;
    const kvRow = (label, valueNode) => {
      const row = document.createElement("div");
      row.className = "kv-row";
      const lbl = document.createElement("span");
      lbl.className = "muted";
      lbl.textContent = label;
      const val = document.createElement("span");
      if (typeof valueNode === "string") {
        val.textContent = valueNode;
      } else {
        val.appendChild(valueNode);
      }
      row.appendChild(lbl);
      row.appendChild(val);
      return row;
    };

    statsCard.appendChild(
      kvRow(
        "Market Cap",
        W.fmt.money(md.market_cap && md.market_cap[cur], { compact: true }),
      ),
    );
    statsCard.appendChild(
      kvRow(
        "24h Volume",
        W.fmt.money(md.total_volume && md.total_volume[cur], { compact: true }),
      ),
    );

    const circ = md.circulating_supply;
    statsCard.appendChild(
      kvRow(
        "Circulating Supply",
        Number.isFinite(Number(circ))
          ? W.fmt.num(Math.round(Number(circ))) + " " + c.symbol
          : "—",
      ),
    );

    const maxS = md.max_supply;
    statsCard.appendChild(
      kvRow(
        "Max Supply",
        Number.isFinite(Number(maxS))
          ? W.fmt.num(Math.round(Number(maxS)))
          : "∞",
      ),
    );

    const athVal = md.ath && md.ath[cur];
    const athPct = md.ath_change_percentage && md.ath_change_percentage[cur];
    const athSpan = document.createElement("span");
    athSpan.textContent = W.fmt.price(athVal) + " ";
    const athPctSpan = document.createElement("span");
    athPctSpan.className = "small muted";
    athPctSpan.textContent = "(" + W.fmt.pct(athPct) + ")";
    athSpan.appendChild(athPctSpan);
    statsCard.appendChild(kvRow("All-Time High", athSpan));

    statsCard.appendChild(
      kvRow("All-Time Low", W.fmt.price(md.atl && md.atl[cur])),
    );

    grid.appendChild(statsCard);

    const contractCard = document.createElement("div");
    contractCard.className = "card";

    const contractH3 = document.createElement("h3");
    contractH3.textContent = "Contract Address";
    contractCard.appendChild(contractH3);

    const platformKeys = Object.keys(c.platforms);
    if (!platformKeys.length) {
      const nativeP = document.createElement("span");
      nativeP.className = "muted";
      nativeP.textContent = "Native coin (no contract)";
      contractCard.appendChild(nativeP);
    } else {
      for (const net of platformKeys) {
        const addr = c.platforms[net];
        const row = document.createElement("div");
        row.className = "small kv-row";

        const netSpan = document.createElement("span");
        netSpan.className = "muted";
        netSpan.textContent = net;

        const addrSpan = document.createElement("span");
        const code = document.createElement("code");
        code.textContent = addr;
        addrSpan.appendChild(code);

        const copyBtn = document.createElement("button");
        copyBtn.className = "icon-btn";
        copyBtn.type = "button";
        copyBtn.setAttribute("data-copy", addr);
        copyBtn.setAttribute("aria-label", "Copy address");
        copyBtn.textContent = "📋";
        addrSpan.appendChild(document.createTextNode(" "));
        addrSpan.appendChild(copyBtn);

        row.appendChild(netSpan);
        row.appendChild(addrSpan);
        contractCard.appendChild(row);
      }
    }

    const aboutH3 = document.createElement("h3");
    aboutH3.className = "mt";
    aboutH3.textContent = "About";
    contractCard.appendChild(aboutH3);

    const aboutDiv = document.createElement("div");
    aboutDiv.className = "about";
    aboutDiv.textContent = c.description || "No description available.";
    contractCard.appendChild(aboutDiv);

    grid.appendChild(contractCard);
    return grid;
  }

  // ── Wire interactions after DOM is built ──────────────
  function wireCoinInteractions(view, c, id) {
    const watchBtn = view.querySelector("#x-watch");
    if (watchBtn) {
      watchBtn.onclick = (e) => {
        const on = W.watchlist.toggle(id);
        e.target.textContent = on ? "★ Watching" : "☆ Watch";
        e.target.classList.toggle("primary", on);
      };
    }

    const addBtn = view.querySelector("#x-add");
    if (addBtn) {
      addBtn.onclick = () => {
        if (W.dashboard && W.dashboard.holdingModal) {
          W.dashboard.holdingModal(null, c);
        } else {
          W.ui.toast("Portfolio module not available", "warn");
        }
      };
    }

    view.querySelectorAll("[data-copy]").forEach((btn) => {
      btn.onclick = async () => {
        const addr = btn.getAttribute("data-copy");
        const ok = await safeCopyToClipboard(addr);
        W.ui.toast(
          ok ? "Address copied ✓" : "Copy failed — select manually",
          ok ? "ok" : "warn",
        );
      };
    });

    view.querySelectorAll("[data-days]").forEach((ch) => {
      ch.onclick = () => {
        view
          .querySelectorAll("[data-days]")
          .forEach((x) => x.classList.remove("active"));
        ch.classList.add("active");
        drawChart(id, ch.getAttribute("data-days"), view);
      };
    });

    drawChart(id, 7, view);
  }

  // ── Draw Chart (race-safe) ────────────────────────────
  async function drawChart(id, days, view) {
    const canvas = view.querySelector("#x-chart");
    if (!canvas) {
      console.warn("[Explorer] Chart canvas not found");
      return;
    }

    if (typeof Chart === "undefined") {
      replaceCanvasMessage(
        canvas,
        "📊 Chart library not loaded. Include Chart.js in your HTML.",
      );
      return;
    }

    if (chartAbortController) {
      chartAbortController.abort();
      chartAbortController = null;
    }

    if (chart) {
      try {
        // Stop any running animation before destroying. chart.destroy()
        // alone leaves an already-queued animation frame holding a
        // reference to the instance; when that frame fires it calls
        // _fn on a torn-down animation object and throws
        // "this._fn is not a function" from Chart.js internals.
        // stop() halts the animation loop cleanly.
        if (typeof chart.stop === "function") chart.stop();
        chart.destroy();
      } catch (e) {
        console.warn("[Explorer] Chart destroy error:", e && e.message);
      }
      chart = null;
    }

    const controller = new AbortController();
    chartAbortController = controller;

    try {
      const data = await W.api.chart(id, days);
      if (controller.signal.aborted) return;

      const prices = Array.isArray(data) ? data : (data && data.prices) || [];
      if (!prices || prices.length < 2) {
        replaceCanvasMessage(
          canvas,
          "📉 No chart data available for this period.",
        );
        return;
      }

      const valid = prices.filter(
        (p) =>
          Array.isArray(p) && p.length >= 2 && Number.isFinite(Number(p[1])),
      );
      if (valid.length < 2) {
        replaceCanvasMessage(canvas, "📉 Chart data malformed.");
        return;
      }

      const up = Number(valid[valid.length - 1][1]) >= Number(valid[0][1]);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        replaceCanvasMessage(canvas, "⚠️ Canvas 2D context unavailable.");
        return;
      }

      if (canvas.width === 0 || canvas.height === 0) {
        canvas.style.width = "100%";
        canvas.style.height = "260px";
        canvas.width = canvas.parentElement?.clientWidth || 600;
        canvas.height = 260;
      }

      canvas.style.display = "";
      const staleMsg = canvas.parentElement?.querySelector(".chart-message");
      if (staleMsg) staleMsg.remove();

      const gradient = ctx.createLinearGradient(0, 0, 0, 260);
      const color = up ? "46,230,168" : "255,92,122";
      gradient.addColorStop(0, `rgba(${color},.32)`);
      gradient.addColorStop(1, `rgba(${color},0)`);

      chart = new Chart(canvas, {
        type: "line",
        data: {
          labels: valid.map((p) =>
            new Date(p[0]).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            }),
          ),
          datasets: [
            {
              data: valid.map((p) => Number(p[1])),
              borderColor: up ? "#2ee6a8" : "#ff5c7a",
              borderWidth: 2.5,
              pointRadius: 0,
              fill: true,
              backgroundColor: gradient,
              tension: 0.3,
            },
          ],
        },
        options: {
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  return fmtChartPrice(ctx.parsed.y);
                },
              },
            },
          },
          scales: {
            x: {
              ticks: { color: "#9aa3b2", maxTicksLimit: 8 },
              grid: { display: false },
            },
            y: {
              ticks: {
                color: "#9aa3b2",
                callback: (value) => {
                  const v = Number(value);
                  return Number.isFinite(v) ? fmtChartPrice(v) : "";
                },
              },
              grid: { color: "rgba(255,255,255,.05)" },
            },
          },
          interaction: { intersect: false, mode: "index" },
          // Short duration — long animations race with rapid
          // day-range switching, which is a common user action here.
          animation: { duration: 250 },
        },
      });
    } catch (e) {
      if (controller.signal.aborted) return;
      console.warn("[Explorer] Chart error:", e && e.message);
      replaceCanvasMessage(
        canvas,
        "⚠️ Failed to load chart: " + safeStr(e && e.message, 120),
      );
    }
  }

  // ── Canvas message helper ─────────────────────────────
  function replaceCanvasMessage(canvas, text) {
    const parent = canvas.parentElement;
    if (!parent) return;
    canvas.style.display = "none";
    const prior = parent.querySelector(".chart-message");
    if (prior) prior.remove();
    const p = document.createElement("p");
    p.className = "chart-message muted small center p-40-y";
    p.textContent = text;
    parent.appendChild(p);
  }

  // ── Public API ────────────────────────────────────────
  return {
    render,
    renderCoin,
    _internal: {
      esc,
      safeImageUrl,
      safeExternalUrl,
      sanitizeDescription,
      normalizeCoin,
      normalizeSearchResult,
      hasDangerKeys,
      IMG_PLACEHOLDER,
      MAX_SEARCH_QUERY_LEN,
      MAX_DESCRIPTION_LEN,
    },
  };
})();

console.log(
  "[Explorer] Module loaded — self-contained, attribute-safe, URL allowlist, race-free.",
);
