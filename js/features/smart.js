window.W = window.W || {};

W.smart = (() => {
  const BSCOUT = "https://eth.blockscout.com/api/v2";
  const j = (r) => r.json();
  const short = (a) => a.slice(0, 6) + "…" + a.slice(-4);
  let scanCoin = null;

  const qtyOf = (t) => {
    const raw =
      typeof t.total === "object" ? t.total?.value || "0" : t.total || "0";
    const dec = parseInt(
      t.token?.decimals ||
        (typeof t.total === "object" ? t.total?.decimals : 18) ||
        18,
      10,
    );
    return parseFloat(raw) / Math.pow(10, dec);
  };

  function analyze(transfers, addr, pm, nowPrice) {
    const week = Date.now() - 7 * 864e5;
    let bal = 0,
      cost = 0,
      realized = 0,
      invested = 0,
      in7 = 0;
    transfers
      .slice()
      .reverse()
      .forEach((t) => {
        // oldest → newest
        const qty = qtyOf(t),
          ts = new Date(t.timestamp).getTime();
        const p = pm[new Date(ts).toDateString()] ?? nowPrice;
        if ((t.to?.hash || "").toLowerCase() === addr.toLowerCase()) {
          bal += qty;
          cost += qty * p;
          invested += qty * p;
          if (ts >= week) in7 += qty;
        } else {
          const q = Math.min(qty, bal),
            avg = bal > 0 ? cost / bal : p;
          realized += q * (p - avg);
          cost -= q * avg;
          bal -= qty;
          if (ts >= week) in7 -= qty;
        }
      });
    const unreal = bal * (nowPrice - (bal > 0 ? cost / bal : 0));
    return { bal, realized, unreal, total: realized + unreal, invested, in7 };
  }

  async function scan(view) {
    const body = view.querySelector("#sm-body");
    body.innerHTML = W.ui.spinner();
    try {
      const coin = await W.api.coin(scanCoin.id);
      const contract = coin.platforms?.ethereum;
      if (!contract) {
        body.innerHTML = W.ui.empty(
          "🧠",
          "No Ethereum contract for this token",
          "Smart scanning supports ERC-20 tokens.",
        );
        return;
      }
      const cur = W.currency();
      const nowPrice = coin.market_data?.current_price?.[cur] || 0;
      const chart = await W.api.chart(scanCoin.id, 365);
      const pm = {};
      chart.prices.forEach(([ts, p]) => (pm[new Date(ts).toDateString()] = p));

      const [tok, holders] = await Promise.all([
        fetch(`${BSCOUT}/tokens/${contract}`).then(j),
        fetch(`${BSCOUT}/tokens/${contract}/holders`).then(j),
      ]);
      const dec = parseInt(tok.decimals || "18", 10);
      const top = (holders.items || []).slice(0, 8);

      const results = (
        await Promise.allSettled(
          top.map((h) =>
            fetch(
              `${BSCOUT}/addresses/${h.address.hash}/token-transfers?token=${contract}`,
            )
              .then(j)
              .then((d) => ({
                addr: h.address.hash,
                raw: h.value,
                s: analyze(d.items || [], h.address.hash, pm, nowPrice),
              })),
          ),
        )
      )
        .filter((r) => r.status === "fulfilled")
        .map((r) => r.value)
        .sort((a, b) => b.s.total - a.s.total);

      const best = results[0];
      body.innerHTML = `
        <div class="card"><h3>${coin.name} · top ${results.length} holders ranked by P/L</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>#</th><th>Wallet</th><th>Holdings</th><th>Realized P/L</th><th>Unrealized</th><th>Total</th><th>7d Activity</th><th></th></tr></thead>
          <tbody>${results
            .map(
              (r, i) => `<tr>
            <td class="muted">${i + 1}</td>
            <td><code>${short(r.addr)}</code> <a class="link small" target="_blank" href="https://eth.blockscout.com/address/${r.addr}">↗</a></td>
            <td>${r.s.bal.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${coin.symbol.toUpperCase()}</td>
            <td class="${r.s.realized >= 0 ? "up" : "down"}">${r.s.realized >= 0 ? "+" : ""}${W.fmt.money(r.s.realized, { compact: true })}</td>
            <td class="${r.s.unreal >= 0 ? "up" : "down"}">${r.s.unreal >= 0 ? "+" : ""}${W.fmt.money(r.s.unreal, { compact: true })}</td>
            <td><b class="${r.s.total >= 0 ? "up" : "down"}">${r.s.invested ? ((r.s.total / r.s.invested) * 100).toFixed(0) + "%" : ""}</b></td>
            <td>${r.s.in7 > 0.0001 ? '<span class="tag buy">Accumulating</span>' : r.s.in7 < -0.0001 ? '<span class="tag sell">Distributing</span>' : '<span class="tag">Idle</span>'}</td>
            <td><button class="btn tiny" data-track="${r.addr}">🐋 Track</button></td>
          </tr>`,
            )
            .join("")}</tbody></table></div>
        ${best ? `<div class="ai-brief mt">🤖 <b>Weaver:</b> the strongest wallet <code>${short(best.addr)}</code> has generated <b>${W.fmt.money(best.total, { compact: true })}</b> on ${coin.name} and is currently <b>${best.s.in7 > 0 ? "accumulating" : "distributing"}</b>. High-P/L wallets buying now = smart money signal. Not financial advice.</div>` : ""}
        </div>`;
      body.querySelectorAll("[data-track]").forEach(
        (b) =>
          (b.onclick = () => {
            W.whales.track(
              b.dataset.track,
              "Smart: " +
                scanCoin.symbol.toUpperCase() +
                " " +
                short(b.dataset.track),
            )
              ? W.ui.toast("Added to Whale Tracker 🐋", "ok")
              : W.ui.toast("Already tracked", "warn");
          }),
      );
    } catch (e) {
      body.innerHTML = `<p class="muted">Scan failed: ${e.message} (Blockscout rate limit — wait a few seconds and retry)</p>`;
    }
  }

  async function render(view) {
    view.innerHTML = `
      <div class="card">
        <h3>🧠 Smart Money Tracker</h3>
        <p class="muted small">Scans a token's top on-chain holders, reconstructs 1 year of transfers at historical prices, and ranks wallets by total P/L. Profitable wallets that are <b>accumulating</b> right now = smart money. ERC-20 tokens only.</p>
        <div class="qa mt"><div id="sm-picker" style="min-width:280px"></div><button class="btn primary" id="sm-go">Scan Holders</button></div>
      </div>
      <div id="sm-body"></div>`;
    W.ui.coinPicker(view.querySelector("#sm-picker"), (p) => (scanCoin = p));
    view.querySelector("#sm-go").onclick = () => {
      if (!scanCoin) return W.ui.toast("Pick a token first", "warn");
      scan(view);
    };
  }

  return { render };
})();
