window.W = window.W || {};

W.sectors = (() => {
  let canvas,
    ctx,
    bubbles = [],
    mouse = { x: -1000, y: -1000 },
    animId,
    W = 0,
    H = 0;

  const PROX = [
    (u) => u,
    (u) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
    (u) => "https://corsproxy.io/?url=" + encodeURIComponent(u),
  ];
  async function fetchCategories() {
    const url =
      "https://api.coingecko.com/api/v3/coins/categories?order=market_cap_desc";
    for (const w of PROX) {
      try {
        const r = await fetch(w(url), { signal: AbortSignal.timeout(9000) });
        if (r.ok) return await r.json();
      } catch (e) {}
    }
    throw new Error("Categories API unreachable");
  }

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    W = canvas.width = rect.width;
    H = canvas.height = Math.max(450, window.innerHeight * 0.55);
  }

  function drawFrame(view) {
    if (!view.isConnected) {
      cancelAnimationFrame(animId);
      return;
    }
    ctx.clearRect(0, 0, W, H);

    // Draw axes
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W / 2, 0);
    ctx.lineTo(W / 2, H);
    ctx.stroke(); // Zero line (0% change)
    ctx.beginPath();
    ctx.moveTo(0, H * 0.8);
    ctx.lineTo(W, H * 0.8);
    ctx.stroke(); // Volume baseline

    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = "11px Inter";
    ctx.fillText("DUMPING 📉", 20, 30);
    ctx.textAlign = "right";
    ctx.fillText("📈 PUMPING", W - 20, 30);
    ctx.textAlign = "center";
    ctx.fillText("0% CHANGE", W / 2, H - 10);
    ctx.textAlign = "left";

    const time = Date.now() / 1000;
    let hovered = null;

    bubbles.forEach((b) => {
      // Map data to coordinates
      const x = W * 0.1 + ((b.change + 20) / 40) * (W * 0.8); // -20% to +20% mapped to 10%-90% width
      const y = H * 0.8 - Math.min(b.volNorm, 1) * H * 0.65; // Volume mapped to bottom 65%

      // Add gentle floating animation
      const floatY = y + Math.sin(time + b.phase) * 6;
      b.drawX = x;
      b.drawY = floatY;

      // Check mouse hover
      const dx = mouse.x - x,
        dy = mouse.y - floatY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const isHover = dist < b.r;
      if (isHover) hovered = b;

      // Draw bubble
      ctx.beginPath();
      const grad = ctx.createRadialGradient(x, floatY, 0, x, floatY, b.r);
      if (b.change >= 0) {
        grad.addColorStop(0, "rgba(46, 230, 168, 0.9)");
        grad.addColorStop(1, "rgba(46, 230, 168, 0.1)");
      } else {
        grad.addColorStop(0, "rgba(255, 92, 122, 0.9)");
        grad.addColorStop(1, "rgba(255, 92, 122, 0.1)");
      }

      ctx.fillStyle = grad;
      ctx.shadowColor = b.change >= 0 ? "#2ee6a8" : "#ff5c7a";
      ctx.shadowBlur = isHover ? 25 : 10;
      ctx.arc(x, floatY, isHover ? b.r * 1.15 : b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Draw label inside if big enough
      if (b.r > 25) {
        ctx.fillStyle = "#fff";
        ctx.font = `bold ${Math.max(10, b.r / 3)}px Sora`;
        ctx.textAlign = "center";
        ctx.fillText(
          b.name.length > 12 ? b.name.slice(0, 10) + ".." : b.name,
          x,
          floatY + 4,
        );
      }
    });

    // Draw Tooltip
    if (hovered) {
      const tx = hovered.drawX + hovered.r + 15;
      const ty = hovered.drawY - 40;
      ctx.fillStyle = "rgba(16, 18, 30, 0.95)";
      ctx.strokeStyle = hovered.change >= 0 ? "#2ee6a8" : "#ff5c7a";
      ctx.lineWidth = 2;
      roundRect(ctx, tx, ty, 180, 85, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#fff";
      ctx.font = "bold 14px Sora";
      ctx.textAlign = "left";
      ctx.fillText(hovered.name, tx + 12, ty + 22);

      ctx.font = "12px Inter";
      ctx.fillStyle = hovered.change >= 0 ? "#2ee6a8" : "#ff5c7a";
      ctx.fillText(
        `${hovered.change >= 0 ? "+" : ""}${hovered.change.toFixed(2)}% (24h)`,
        tx + 12,
        ty + 42,
      );

      ctx.fillStyle = "#9aa3b2";
      ctx.fillText(
        `MCap: $${W.fmt.money(hovered.mcap, { compact: true })}`,
        tx + 12,
        ty + 60,
      );
      ctx.fillText(
        `Vol: $${W.fmt.money(hovered.vol, { compact: true })}`,
        tx + 12,
        ty + 76,
      );
    }

    animId = requestAnimationFrame(() => drawFrame(view));
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  async function render(view) {
    view.innerHTML = `
      <div class="card">
        <div class="watch-head">
          <h3>🌊 Sector Rotation Map</h3>
          <span class="muted small">Live narrative tracking · Hover bubbles for details</span>
        </div>
        <p class="muted small">Where is the smart money flowing today? Right = Pumping. Left = Dumping. Higher = More Volume. Bigger = Larger Market Cap.</p>
      </div>
      <div class="card" style="padding: 0; overflow: hidden; position: relative;">
        <canvas id="sector-canvas" style="width:100%; display:block; cursor: crosshair;"></canvas>
      </div>`;

    canvas = view.querySelector("#sector-canvas");
    ctx = canvas.getContext("2d");
    resize();
    window.addEventListener("resize", resize);

    canvas.addEventListener("pointermove", (e) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    });
    canvas.addEventListener("pointerleave", () => {
      mouse.x = -1000;
      mouse.y = -1000;
    });

    try {
      const cats = await fetchCategories();
      // Filter out generic/boring categories and keep the juicy narratives
      const IGNORE = [
        "cryptocurrency",
        "layer-1",
        "smart-contract-platform",
        "us-treasury-backed",
        "stablecoin-protocol",
      ];
      const validCats = cats
        .filter(
          (c) =>
            c.market_cap > 50e6 && !IGNORE.includes(c.id) && c.name.length < 25,
        )
        .slice(0, 40);

      const maxVol = Math.max(...validCats.map((c) => c.volume_24h));

      bubbles = validCats.map((c, i) => ({
        name: c.name,
        change: c.market_cap_change_24h,
        mcap: c.market_cap,
        vol: c.volume_24h,
        volNorm: c.volume_24h / maxVol,
        r: Math.max(15, Math.sqrt(c.market_cap / 1e9) * 8), // Radius based on MCap
        phase: i * 0.7, // For floating animation offset
      }));

      drawFrame(view);
    } catch (e) {
      view.querySelector("#sector-canvas").outerHTML =
        `<div class="empty"><div class="empty-icon">🌊</div><p>Couldn't load sector map</p><p class="muted small">${e.message}</p></div>`;
    }
  }

  return { render };
})();
