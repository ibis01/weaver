window.W = window.W || {};

W.time = (() => {
  let chart = null;
  const daysLabel = (d) =>
    d == 30
      ? "the last month"
      : d == 90
        ? "the last 3 months"
        : d == 365
          ? "the last year"
          : "the last 2 years";

  async function run(view, days) {
    const body = view.querySelector("#tm-body");
    body.innerHTML = W.ui.spinner();
    const holdings = W.portfolio.all();
    if (!holdings.length) {
      body.innerHTML = W.ui.empty(
        "⏳",
        "No holdings to time-travel",
        "Add holdings, or hit 🎲 on the Dashboard to load the sample portfolio",
      );
      return;
    }

    const results = await Promise.allSettled(
      holdings.map(async (h) => {
        const s = await W.api.chart(h.coinId, days);
        const prices = Array.isArray(s) ? s : (s && s.prices) || [];
        return { h, prices };
      }),
    );
    const data = results
      .filter((r) => r.status === "fulfilled")
      .map((r) => r.value)
      .filter((d) => d.prices.length > 1);
    if (!data.length) {
      body.innerHTML =
        '<p class="muted">No historical data available on this network.</p>';
      return;
    }

    /* align all series from the tail (today) */
    const minLen = Math.min(...data.map((d) => d.prices.length));
    const labels = data[0].prices
      .slice(-minLen)
      .map((p) => new Date(p[0]).toLocaleDateString());
    const total = new Array(minLen).fill(0);
    data.forEach((d) =>
      d.prices.slice(-minLen).forEach((p, i) => (total[i] += d.h.qty * p[1])),
    );

    const start = total[0],
      now = total[minLen - 1];
    const pl = now - start,
      pct = start ? (pl / start) * 100 : 0;

    const per = data
      .map((d) => {
        const s = d.prices[0][1],
          n = d.prices[d.prices.length - 1][1];
        return { h: d.h, s, n, pct: s ? ((n - s) / s) * 100 : 0 };
      })
      .sort((a, b) => b.pct - a.pct);
    const best = per[0],
      worst = per[per.length - 1];

    const whatIf = data.reduce((sum, d) => {
      const s = d.prices[0][1],
        n = d.prices[d.prices.length - 1][1];
      return sum + (1000 / data.length) * (s ? n / s : 1);
    }, 0);

    body.innerHTML = `
      <div class="cards">
        <div class="card stat"><div class="stat-label">Value ${days}d ago</div><div class="stat-big">${W.fmt.money(start)}</div></div>
        <div class="card stat"><div class="stat-label">Value today</div><div class="stat-big">${W.fmt.money(now)}</div></div>
        <div class="card stat"><div class="stat-label">Time-travel P/L</div><div class="stat-big ${pl >= 0 ? "up" : "down"}">${pl >= 0 ? "+" : "-"}${W.fmt.money(Math.abs(pl))}</div><div class="stat-sub">${W.fmt.pct(pct)}</div></div>
        <div class="card stat"><div class="stat-label">$1,000 equal basket →</div><div class="stat-big">${W.fmt.money(whatIf)}</div><div class="stat-sub">x${(whatIf / 1000).toFixed(2)}</div></div>
      </div>
      <div class="card"><h3>📈 Portfolio replay</h3><div class="chart-box tall"><canvas id="tm-chart"></canvas></div></div>
      <div class="card"><h3>🧵 Best & worst threads</h3>
        <div class="table-wrap"><table><thead><tr><th>Asset</th><th>Price then</th><th>Price now</th><th>Change</th></tr></thead>
        <tbody>${per.map((p) => `<tr><td class="coin-cell"><b>${p.h.name}</b></td><td>${W.fmt.price(p.s)}</td><td>${W.fmt.price(p.n)}</td><td>${W.fmt.pct(p.pct)}</td></tr>`).join("")}</tbody></table></div>
      </div>
      <div class="ai-brief">🤖 <b>Weaver:</b> holding this exact portfolio for ${daysLabel(days)} would have turned <b>${W.fmt.money(start)}</b> into <b>${W.fmt.money(now)}</b> (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%). Best thread: <b>${best.h.name}</b> (${best.pct >= 0 ? "+" : ""}${best.pct.toFixed(0)}%). Worst thread: <b>${worst.h.name}</b> (${worst.pct >= 0 ? "+" : ""}${worst.pct.toFixed(0)}%). ${pct >= 0 ? "Past-you wove well — future-you says thanks." : "Even master weavers drop threads; the chart shows the journey, not the verdict."} <span class="muted small">Not financial advice.</span></div>`;

    if (window.Chart) {
      chart?.destroy();
      chart = new Chart(view.querySelector("#tm-chart"), {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              data: total,
              borderColor: "#7c5cff",
              borderWidth: 2.5,
              pointRadius: 0,
              fill: true,
              tension: 0.3,
              backgroundColor: (c) => {
                const a = c.chart.chartArea;
                if (!a) return "transparent";
                const g = c.chart.ctx.createLinearGradient(
                  0,
                  a.top,
                  0,
                  a.bottom,
                );
                g.addColorStop(0, "rgba(124,92,255,.3)");
                g.addColorStop(1, "rgba(124,92,255,0)");
                return g;
              },
            },
          ],
        },
        options: {
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { maxTicksLimit: 8 } },
            y: {
              ticks: { callback: (v) => W.fmt.money(v, { compact: true }) },
            },
          },
        },
      });
    }
  }

  async function render(view) {
    view.innerHTML = `
      <div class="card">
        <div class="watch-head"><h3>⏳ Time Machine</h3>
          <div class="qa">
            <button class="chip" data-d="30">30D</button>
            <button class="chip" data-d="90">90D</button>
            <button class="chip active" data-d="365">1Y</button>
            <button class="chip" data-d="730">2Y</button>
          </div>
        </div>
        <p class="muted small">Replays your <b>current</b> holdings into the past — what they were worth, how the whole portfolio moved day by day, and which threads wove gold.</p>
      </div>
      <div id="tm-body">${W.ui.spinner()}</div>`;
    let days = 365;
    view.querySelectorAll("[data-d]").forEach(
      (c) =>
        (c.onclick = () => {
          view
            .querySelectorAll("[data-d]")
            .forEach((x) => x.classList.remove("active"));
          c.classList.add("active");
          days = +c.dataset.d;
          run(view, days);
        }),
    );
    await run(view, days);
  }

  return { render };
})();
