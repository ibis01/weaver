// js/features/explorer.js – Coin Explorer

window.W = window.W || {};

W.explorer = (() => {
  let chart = null;

  // ── Helpers ────────────────────────────────────────────
  function escapeHTML(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  const kv = (key, val) =>
    `<div class="kv-row"><span class="muted">${escapeHTML(key)}</span><span>${val}</span></div>`;

  // ── Render Search ──────────────────────────────────────
  async function render(view) {
    view.innerHTML = `
      <div class="card">
        <h3>🔍 Coin Explorer</h3>
        <input id="x-search" class="input big" placeholder="Search any cryptocurrency…">
        <div id="x-results"></div>
      </div>
    `;

    const input = view.querySelector("#x-search");
    const results = view.querySelector("#x-results");

    input.addEventListener(
      "input",
      W.debounce(async () => {
        const q = input.value.trim();
        if (q.length < 2) {
          results.innerHTML = "";
          return;
        }
        try {
          const data = await W.api.search(q);
          results.innerHTML = `<div class="table-wrap"><table><tbody>${(
            data.coins || []
          )
            .slice(0, 10)
            .map(
              (c) => `
          <tr class="clickable" data-id="${c.id}">
            <td style="width:40px;"><img class="coin-img" src="${c.thumb}" alt="${escapeHTML(c.name)}"></td>
            <td><b>${escapeHTML(c.name)}</b> <span class="muted small">${c.symbol.toUpperCase()}</span></td>
            <td class="muted">${c.market_cap_rank ? "Rank #" + c.market_cap_rank : ""}</td>
          </tr>
        `,
            )
            .join("")}</tbody></table></div>`;
          results.querySelectorAll("tr[data-id]").forEach((tr) => {
            tr.onclick = () => (location.hash = "#/coin/" + tr.dataset.id);
          });
        } catch (e) {
          W.ui.toast(e.message, "warn");
        }
      }, 350),
    );
  }

  // ── Render Coin Detail ─────────────────────────────────
  async function renderCoin(view, id) {
    view.innerHTML = W.ui.spinner();
    try {
      const c = await W.api.coin(id);
      if (!c) throw new Error("Coin not found");

      const md = c.market_data || {};
      const cur = W.currency();
      const contract =
        c.platforms && Object.keys(c.platforms).length
          ? Object.entries(c.platforms)
              .filter(([, addr]) => addr)
              .map(
                ([net, addr]) =>
                  `<div class="small kv-row"><span class="muted">${escapeHTML(net)}</span><span><code>${escapeHTML(addr)}</code> <button class="icon-btn" data-copy="${escapeHTML(addr)}">📋</button></span></div>`,
              )
              .join("")
          : '<span class="muted">Native coin (no contract)</span>';

      view.innerHTML = `
        <div class="card coin-head">
          <img class="coin-lg" src="${c.image?.large}" alt="${escapeHTML(c.name)}">
          <div>
            <h2>${escapeHTML(c.name)} <span class="muted">${c.symbol.toUpperCase()}</span> ${c.market_cap_rank ? `<span class="tag rank">#${c.market_cap_rank}</span>` : ""}</h2>
            <div class="coin-price">${W.fmt.price(md.current_price?.[cur])} <span class="ml">${W.fmt.pct(md.price_change_percentage_24h)}</span></div>
            <div class="mt qa">
              <button class="btn tiny ${W.watchlist.has(id) ? "primary" : ""}" id="x-watch">${W.watchlist.has(id) ? "★ Watching" : "☆ Watch"}</button>
              <button class="btn tiny" id="x-add">+ Add to Portfolio</button>
              ${c.links?.homepage?.[0] ? `<a class="btn tiny" href="${escapeHTML(c.links.homepage[0])}" target="_blank">🌐 Website</a>` : ""}
            </div>
          </div>
        </div>
        <div class="card">
          <div class="range-row">${[
            ["1", "24H"],
            ["7", "7D"],
            ["30", "1M"],
            ["90", "3M"],
            ["365", "1Y"],
          ]
            .map(
              ([d, label]) =>
                `<button class="chip ${d === "7" ? "active" : ""}" data-days="${d}">${label}</button>`,
            )
            .join("")}</div>
          <div class="chart-box tall"><canvas id="x-chart"></canvas></div>
        </div>
        <div class="grid-2">
          <div class="card"><h3>Market Statistics</h3>
            ${kv("Market Cap", W.fmt.money(md.market_cap?.[cur], { compact: true }))}
            ${kv("24h Volume", W.fmt.money(md.total_volume?.[cur], { compact: true }))}
            ${kv("Circulating Supply", W.fmt.num(Math.round(md.circulating_supply)) + " " + c.symbol.toUpperCase())}
            ${kv("Max Supply", md.max_supply ? W.fmt.num(Math.round(md.max_supply)) : "∞")}
            ${kv("All-Time High", W.fmt.price(md.ath?.[cur]) + ' <span class="small muted">(' + W.fmt.pct(md.ath_change_percentage?.[cur]) + ")</span>")}
            ${kv("All-Time Low", W.fmt.price(md.atl?.[cur]))}
          </div>
          <div class="card"><h3>Contract Address</h3>${contract}
            <h3 class="mt">About</h3><div class="about">${(
              c.description?.en || "No description available."
            )
              .replace(/<[^>]+>/g, " ")
              .split(". ")
              .slice(0, 4)
              .join(". ")}.</div>
          </div>
        </div>
      `;

      // Watch button
      view.querySelector("#x-watch").onclick = (e) => {
        const on = W.watchlist.toggle(id);
        e.target.textContent = on ? "★ Watching" : "☆ Watch";
        e.target.classList.toggle("primary", on);
      };

      // Add to portfolio
      view.querySelector("#x-add").onclick = () => {
        if (W.dashboard?.holdingModal) W.dashboard.holdingModal(null, c);
        else W.ui.toast("Portfolio module not available", "warn");
      };

      // Copy contract
      view.querySelectorAll("[data-copy]").forEach((btn) => {
        btn.onclick = () => {
          navigator.clipboard.writeText(btn.dataset.copy);
          W.ui.toast("Address copied ✓", "ok");
        };
      });

      // Chart range buttons
      view.querySelectorAll("[data-days]").forEach((ch) => {
        ch.onclick = () => {
          view
            .querySelectorAll("[data-days]")
            .forEach((x) => x.classList.remove("active"));
          ch.classList.add("active");
          drawChart(id, ch.dataset.days, view);
        };
      });
      drawChart(id, 7, view);
    } catch (e) {
      view.innerHTML = `<p class="muted">${escapeHTML(e.message)}</p>`;
    }
  }

  // ── Draw Chart ─────────────────────────────────────────
  async function drawChart(id, days, view) {
    const data = await W.api.chart(id, days);
    chart?.destroy();
    const canvas = view.querySelector("#x-chart");
    if (!canvas || !window.Chart) return;
    const prices = Array.isArray(data) ? data : data?.prices || [];
    if (prices.length < 2) {
      canvas.parentElement.innerHTML =
        '<p class="muted small center" style="padding:40px 0;">📉 No chart data on this network right now — the stats below are live.</p>';
      return;
    }
    const up = prices[prices.length - 1][1] >= prices[0][1];
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 0, 260);
    const color = up ? "46,230,168" : "255,92,122";
    gradient.addColorStop(0, `rgba(${color},.32)`);
    gradient.addColorStop(1, `rgba(${color},0)`);

    chart = new Chart(canvas, {
      type: "line",
      data: {
        labels: prices.map((p) =>
          new Date(p[0]).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          }),
        ),
        datasets: [
          {
            data: prices.map((p) => p[1]),
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
        plugins: { legend: { display: false } },
        scales: {
          x: {
            ticks: { color: "#9aa3b2", maxTicksLimit: 8 },
            grid: { display: false },
          },
          y: {
            ticks: { color: "#9aa3b2" },
            grid: { color: "rgba(255,255,255,.05)" },
          },
        },
        interaction: { intersect: false, mode: "index" },
      },
    });
  }

  return { render, renderCoin };
})();

console.log("[Explorer] Module loaded.");
