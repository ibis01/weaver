// ================================================================
// js/features/sectors.js – Sector Rotation Heatmap
// ================================================================

window.W = window.W || {};

W.sectors = (() => {
  let canvas,
    ctx,
    bubbles = [],
    mouse = { x: -1000, y: -1000 },
    animId;
  let cw = 0,
    ch = 0;

  // ── API Helpers ──────────────────────────────────────────
  const PROX = [
    (u) => u,
    (u) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
    (u) => "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(u),
  ];

  async function fetchCategories() {
    const url =
      "https://api.coingecko.com/api/v3/coins/categories?order=market_cap_desc";
    let lastErr;
    for (const wrap of PROX) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 9000);
      try {
        const r = await fetch(wrap(url), { signal: ctrl.signal });
        clearTimeout(t);
        if (r.ok) return await r.json();
      } catch (e) {
        lastErr = e;
        clearTimeout(t);
      }
    }
    throw lastErr || new Error("unreachable");
  }

  // ── Canvas Helpers ──────────────────────────────────────
  function resize() {
    const rect = canvas?.parentElement?.getBoundingClientRect?.() || {
      width: 800,
      height: 450,
    };
    cw = canvas.width = rect.width || 800;
    ch = canvas.height = Math.max(450, window.innerHeight * 0.55);
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // ── Escape helper ──────────────────────────────────────
  function escapeHTML(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Draw Frame ──────────────────────────────────────────
  function drawFrame(view) {
    if (!view?.isConnected) {
      cancelAnimationFrame(animId);
      return;
    }

    ctx.clearRect(0, 0, cw, ch);

    // Grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cw / 2, 0);
    ctx.lineTo(cw / 2, ch);
    ctx.stroke();

    // Labels
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = "11px Inter, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("📉 DUMPING", 20, 30);
    ctx.textAlign = "right";
    ctx.fillText("PUMPING 📈", cw - 20, 30);
    ctx.textAlign = "center";
    ctx.fillText("0% CHANGE", cw / 2, ch - 10);
    ctx.textAlign = "left";

    const time = Date.now() / 1000;
    let hovered = null;

    bubbles.forEach((b) => {
      const x =
        cw * 0.1 +
        ((Math.max(-20, Math.min(20, b.change)) + 20) / 40) * (cw * 0.8);
      const y = ch * 0.82 - b.volNorm * ch * 0.6;
      const fy = y + Math.sin(time + b.phase) * 5;
      b.dx = x;
      b.dy = fy;
      const dist = Math.sqrt(
        (mouse.x - x) * (mouse.x - x) + (mouse.y - fy) * (mouse.y - fy),
      );
      const isH = dist < b.r;
      if (isH) hovered = b;

      const g = ctx.createRadialGradient(x, fy, 0, x, fy, b.r);
      const color = b.change >= 0 ? "46,230,168" : "255,92,122";
      g.addColorStop(0, `rgba(${color},.75)`);
      g.addColorStop(1, `rgba(${color},.06)`);

      ctx.beginPath();
      ctx.fillStyle = g;
      ctx.shadowColor = b.change >= 0 ? "#2ee6a8" : "#ff5c7a";
      ctx.shadowBlur = isH ? 22 : 10;
      ctx.arc(x, fy, isH ? b.r * 1.08 : b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Label
      if (b.r > 22) {
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.font = `bold ${Math.max(10, Math.min(15, b.r / 2.6))}px Sora, system-ui, sans-serif`;
        ctx.fillText(
          b.name.length > 14 ? b.name.slice(0, 12) + ".." : b.name,
          x,
          fy + 4,
        );
        ctx.textAlign = "left";
      }
    });

    // Tooltip
    if (hovered) {
      const tx = Math.min(hovered.dx + hovered.r + 12, cw - 200);
      const ty = Math.max(10, hovered.dy - 50);
      ctx.fillStyle = "rgba(16,18,30,.94)";
      ctx.strokeStyle = hovered.change >= 0 ? "#2ee6a8" : "#ff5c7a";
      ctx.lineWidth = 2;
      roundRect(ctx, tx, ty, 190, 78, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#fff";
      ctx.font = "bold 13px Sora, system-ui, sans-serif";
      ctx.fillText(escapeHTML(hovered.name), tx + 12, ty + 22);

      ctx.font = "12px Inter, system-ui, sans-serif";
      ctx.fillStyle = hovered.change >= 0 ? "#2ee6a8" : "#ff5c7a";
      ctx.fillText(
        `${hovered.change >= 0 ? "+" : ""}${hovered.change.toFixed(2)}% (24h)`,
        tx + 12,
        ty + 42,
      );

      ctx.fillStyle = "#9aa3b2";
      ctx.fillText(
        `MCap ${W.fmt.money(hovered.mcap, { compact: true })} · Vol ${W.fmt.money(hovered.vol, { compact: true })}`,
        tx + 12,
        ty + 62,
      );
    }

    animId = requestAnimationFrame(() => drawFrame(view));
  }

  // ── Render ──────────────────────────────────────────────
  async function render(view) {
    if (!view) {
      console.warn("[Sectors] No view element provided");
      return;
    }

    view.innerHTML = `
      <div class="card">
        <div class="watch-head">
          <h3>🌊 Sector Rotation Map</h3>
          <span class="muted small">Live narrative tracking · Hover bubbles for details</span>
        </div>
        <p class="muted small">Where is smart money flowing today? Right = Pumping · Left = Dumping · Higher = More Volume · Bigger = Larger Market Cap.</p>
      </div>
      <div class="card" style="padding:0;overflow:hidden;position:relative;">
        <canvas id="sector-canvas" style="width:100%;display:block;cursor:crosshair;"></canvas>
      </div>
    `;

    canvas = view.querySelector("#sector-canvas");
    if (!canvas) return;
    ctx = canvas.getContext("2d");
    resize();
    window.addEventListener("resize", resize);

    canvas.addEventListener("pointermove", (e) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
    });
    canvas.addEventListener("pointerleave", () => {
      mouse.x = -1000;
      mouse.y = -1000;
    });

    try {
      const cats = await fetchCategories();
      const IGNORE = [
        "cryptocurrency",
        "layer-1",
        "smart-contract-platform",
        "us-treasury-backed",
        "stablecoin-protocol",
      ];
      const valid = cats
        .filter(
          (c) =>
            (c.market_cap || 0) > 50e6 &&
            c.name &&
            c.name.length < 25 &&
            !IGNORE.includes(c.id),
        )
        .slice(0, 40);

      const maxMcap = Math.max(...valid.map((c) => c.market_cap));
      const maxVol = Math.max(...valid.map((c) => c.volume_24h));

      bubbles = valid.map((c, i) => ({
        name: c.name,
        change: c.market_cap_change_24h || 0,
        mcap: c.market_cap,
        vol: c.volume_24h,
        volNorm: Math.min(1, (c.volume_24h || 0) / maxVol),
        r: 16 + 56 * Math.sqrt((c.market_cap || 0) / maxMcap),
        phase: i * 0.7,
      }));

      drawFrame(view);
    } catch (e) {
      console.warn("[Sectors] Error:", e);
      view.querySelector("#sector-canvas").outerHTML =
        `<div class="empty"><div class="empty-icon">🌊</div><p>Sector map unreachable on this network</p></div>`;
    }
  }

  // ── Exports ─────────────────────────────────────────────
  return { render };
})();

console.log("[Sectors] Module loaded.");
