// ================================================================
// js/ui/particles.js – Futuristic Particle System (Starfield + Neural Network)
// ================================================================
(function () {
  // Create canvas and inject it behind the content
  const canvas = document.createElement("canvas");
  canvas.id = "particles-canvas";
  canvas.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: -1;
    pointer-events: none;
    display: block;
  `;
  document.body.prepend(canvas);

  const ctx = canvas.getContext("2d");
  let width, height;
  let particles = [];
  const PARTICLE_COUNT = 180;
  const MAX_DIST = 180; // max distance for line connections

  // ── Resize handler ──────────────────────────────────
  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }
  window.addEventListener("resize", resize);
  resize();

  // ── Particle class ──────────────────────────────────
  class Particle {
    constructor() {
      this.reset();
    }
    reset() {
      this.x = Math.random() * width;
      this.y = Math.random() * height;
      this.size = Math.random() * 3 + 0.8;
      this.speedX = (Math.random() - 0.5) * 0.6;
      this.speedY = (Math.random() - 0.5) * 0.6;
      this.opacity = Math.random() * 0.6 + 0.3;
      this.pulse = Math.random() * Math.PI * 2;
      this.pulseSpeed = 0.02 + Math.random() * 0.04;
      // Slight color variation: purple, cyan, or white
      const hue =
        Math.random() > 0.6 ? "cyan" : Math.random() > 0.5 ? "purple" : "white";
      this.color = hue;
    }
    update() {
      this.x += this.speedX;
      this.y += this.speedY;
      this.pulse += this.pulseSpeed;
      // Wrap around edges
      if (this.x < 0) this.x = width;
      if (this.x > width) this.x = 0;
      if (this.y < 0) this.y = height;
      if (this.y > height) this.y = 0;
    }
    draw() {
      const alpha = this.opacity * (0.7 + 0.3 * Math.sin(this.pulse));
      let color;
      if (this.color === "purple") {
        color = `rgba(124, 92, 255, ${alpha})`;
      } else if (this.color === "cyan") {
        color = `rgba(92, 214, 255, ${alpha})`;
      } else {
        color = `rgba(255, 255, 255, ${alpha * 0.8})`;
      }
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  // ── Initialize particles ────────────────────────────
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push(new Particle());
  }

  // ── Animation loop ──────────────────────────────────
  function animate() {
    ctx.clearRect(0, 0, width, height);

    // Update and draw each particle
    particles.forEach((p) => {
      p.update();
      p.draw();
    });

    // Draw connecting lines between nearby particles
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MAX_DIST) {
          const alpha = (1 - dist / MAX_DIST) * 0.25;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(124, 92, 255, ${alpha})`;
          ctx.lineWidth = 0.7;
          ctx.stroke();
        }
      }
    }

    requestAnimationFrame(animate);
  }

  animate();

  // ── Debounce resize ─────────────────────────────────
  let resizeTimeout;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(resize, 150);
  });

  console.log("[Particles] Initialized");
})();
