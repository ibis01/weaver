// ===============================================================
//         Initialization Script for Weaver
// ===============================================================
// Moved from inline script in index.html to comply with strict CSP.

(function () {
  // Ensure W is defined
  window.W = window.W || {};

  // Initialize clock
  function updateClock() {
    const clockEl = document.getElementById("clock");
    if (clockEl) {
      clockEl.textContent = new Date().toLocaleTimeString();
    }
  }

  // Update immediately, then every second
  updateClock();
  setInterval(updateClock, 1000);

  console.log("✅ Index.html init loaded. Weaver ready.");
})();
