// ================================================================
// js/ui/tilt.js – 3D Tilt on .card elements (smooth, subtle)
// ================================================================
(function () {
  // Select all cards (exclude cards inside modals to avoid interference)
  const cards = document.querySelectorAll(".card:not(.no-tilt)");

  if (!cards.length) {
    console.log("[Tilt] No cards found.");
    return;
  }

  let tiltActive = true;

  // Disable tilt on touch devices (prevents weird behavior)
  if ("ontouchstart" in window) {
    tiltActive = false;
    console.log("[Tilt] Disabled on touch devices.");
    return;
  }

  cards.forEach((card) => {
    // Save original transform to restore later
    let originalTransform = card.style.transform || "";

    card.addEventListener("mousemove", (e) => {
      if (!tiltActive) return;
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      // Rotate X axis based on vertical offset, Y axis on horizontal offset
      const rotateX = ((y - centerY) / centerY) * -8; // max ±8 deg
      const rotateY = ((x - centerX) / centerX) * 8;
      // Apply transform with perspective and a small scale boost
      card.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.02)`;
      card.style.transition = "transform 0.08s ease-out";
    });

    card.addEventListener("mouseleave", () => {
      if (!tiltActive) return;
      // Smoothly return to original state
      card.style.transform =
        "perspective(800px) rotateX(0deg) rotateY(0deg) scale(1)";
      card.style.transition = "transform 0.4s cubic-bezier(0.2, 0.9, 0.4, 1)";
    });

    // Optional: add a slight initial transition to prevent jump on first hover
    card.style.transition = "transform 0.3s cubic-bezier(0.2, 0.9, 0.4, 1)";
  });

  console.log(`[Tilt] Enabled on ${cards.length} cards.`);
})();
