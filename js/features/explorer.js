window.W = window.W || {};

W.explorer = (() => {
  let chart = null;
  const kv = (k, v) =>
    `<div class="kv-row"><span class="muted">${k}</span><span>${v}</span></div>`;

  async function render(view) {
    view.innerHTML = `
      <div class="card">
        <h3>🔍 Coin Explorer</h3>
        <input id="x-search" class="input big" placeholder="Search any cryptocurrency…">
        <div id="x-results"></div>
      </div>`;
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
          const d = await W.api.search(q);
          results.innerHTML = `<div class="table-wrap"><table><tbody>${(
            d.coins || []
          )
            .slice(0, 10)
            .map(
              (c) => `
          <tr class="clickable" data-id="${c.id}">
            <td style="width:40px"><img class="coin-img" src="${c.thumb}"></td>
            <td><b>${c.name}</b> <span class="muted small">${c.symbol.toUpperCase()}</span></td>
            <td class="muted">${c.market_cap_rank ? "Rank #" + c.market_cap_rank : ""}</td>
          </tr>`,
            )
            .join("")}</tbody></table></div>`;
          results
            .querySelectorAll("tr[data-id]")
            .forEach(
              (tr) =>
                (tr.onclick = () =>
                  (location.hash = "#/coin/" + tr.dataset.id)),
            );
        } catch (e) {
          W.ui.toast(e.message, "warn");
        }
      }, 350),
    );
  }

  async function renderCoin(view, id) {
    view.innerHTML = W.ui.spinner();
    try {
      const c = await W.api.coin(id);
      const md = c.market_data;
      const cur = W.currency();
      const contract =
        c.platforms && Object.keys(c.platforms).length
          ? Object.entries(c.platforms)
              .filter(([, a]) => a)
              .map(
                ([net, addr]) =>
                  `<div class="small kv-row"><span class="muted">${net}</span><span><code>${addr}</code> <button class="icon-btn" data-copy="${addr}">📋</button></span></div>`,
              )
              .join("")
          : '<span class="muted">Native coin (no contract)</span>';

      view.innerHTML = `
        <div class="card coin-head">
          <img class="coin-lg" src="${c.image.large}">
          <div>
            <h2>${c.name} <span class="muted">${c.symbol.toUpperCase()}</span> ${c.market_cap_rank ? `<span class="tag rank">#${c.market_cap_rank}</span>` : ""}</h2>
            <div class="coin-price">${W.fmt.price(md.current_price[cur])} <span class="ml">${W.fmt.pct(md.price_change_percentage_24h)}</span></div>
            <div class="mt qa">
              <button class="btn tiny ${W.watchlist.has(id) ? "primary" : ""}" id="x-watch">${W.watchlist.has(id) ? "★ Watching" : "☆ Watch"}</button>
              <button class="btn tiny" id="x-add">+ Add to Portfolio</button>
              ${c.links?.homepage?.[0] ? `<a class="btn tiny" href="${c.links.homepage[0]}" target="_blank">🌐 Website</a>` : ""}
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
              ([d, l]) =>
                `<button class="chip ${d === "7" ? "active" : ""}" data-days="${d}">${l}</button>`,
            )
            .join("")}</div>
          <div class="chart-box tall"><canvas id="x-chart"></canvas></div>
        </div>
        <div class="grid-2">
          <div class="card"><h3>Market Statistics</h3>
            ${kv("Market Cap", W.fmt.money(md.market_cap[cur], { compact: true }))}
            ${kv("24h Volume", W.fmt.money(md.total_volume[cur], { compact: true }))}
            ${kv("Circulating Supply", W.fmt.num(Math.round(md.circulating_supply)) + " " + c.symbol.toUpperCase())}
            ${kv("Max Supply", md.max_supply ? W.fmt.num(Math.round(md.max_supply)) : "∞")}
            ${kv("All-Time High", W.fmt.price(md.ath[cur]) + ' <span class="small muted">(' + W.fmt.pct(md.ath_change_percentage[cur]) + ")</span>")}
            ${kv("All-Time Low", W.fmt.price(md.atl[cur]))}
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
        </div>`;

      view.querySelector("#x-watch").onclick = (e) => {
        const on = W.watchlist.toggle(id);
        e.target.textContent = on ? "★ Watching" : "☆ Watch";
        e.target.classList.toggle("primary", on);
      };
      view.querySelector("#x-add").onclick = () =>
        W.dashboard.holdingModal(null, c);
      view.querySelectorAll("[data-copy]").forEach(
        (b) =>
          (b.onclick = () => {
            navigator.clipboard.writeText(b.dataset.copy);
            W.ui.toast("Address copied ✓", "ok");
          }),
      );
      view.querySelectorAll("[data-days]").forEach(
        (ch) =>
          (ch.onclick = () => {
            view
              .querySelectorAll("[data-days]")
              .forEach((x) => x.classList.remove("active"));
            ch.classList.add("active");
            drawChart(id, ch.dataset.days, view);
          }),
      );
      drawChart(id, 7, view);
    } catch (e) {
      view.innerHTML = `<p class="muted">${e.message}</p>`;
    }
  }

  async function drawChart(id, days, view) {
    const d = await W.api.chart(id, days);
    chart?.destroy();
    const ctx = view.querySelector("#x-chart");
    if (!ctx || !window.Chart) return;
    const prices = d.prices;
    const up = prices[prices.length - 1][1] >= prices[0][1];
    chart = new Chart(ctx, {
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
            borderWidth: 2,
            pointRadius: 0,
            fill: true,
            backgroundColor: up
              ? "rgba(46,230,168,.08)"
              : "rgba(255,92,122,.08)",
            tension: 0.25,
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
