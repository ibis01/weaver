// ================================================================
//  Weaver — bundle-load failsafe
// ================================================================
// Purpose:
//   The application is a client-rendered SPA. If dist/bundle.min.js
//   fails to fetch, parse, or execute, the user sees a blank #view
//   with no indication of what happened. This module detects that
//   condition and renders an honest, actionable error card.
//
// Why it is a separate file:
//   If the failsafe lived inside the bundle, a syntax error or a
//   top-level throw would prevent it from running. A separate file
//   loads independently, so the failsafe works even when the bundle
//   is fundamentally broken.
//
// CSP:
//   No inline handlers, no inline styles. All wiring is via
//   addEventListener. All styling is via the .bundle-error class
//   defined in style.css.
//
// Timing:
//   1500 ms is enough for the bundle to fetch on a slow 3G
//   connection (~500 KB) and execute. If window.W is still
//   undefined after that, the bundle is not going to arrive. The
//   delay is deliberately not longer — a user staring at a blank
//   page for 3 seconds is worse than a slightly premature message.
// ================================================================

(function () {
  "use strict";

  var TIMEOUT_MS = 1500;

  setTimeout(function () {
    // Happy path: the app booted.
    if (typeof window.W !== "undefined") return;

    // The app is expected to inject content into #view. If something
    // already rendered there (a different module got further than W
    // being set), do not clobber it.
    var root = document.getElementById("view");
    if (!root) return;
    if (root.children && root.children.length > 0) return;

    // Build the error card with DOM APIs only. No innerHTML, no
    // inline handlers, no inline styles.
    var box = document.createElement("div");
    box.className = "card bundle-error";

    var h = document.createElement("h3");
    h.textContent = "Weaver failed to load";
    box.appendChild(h);

    var p1 = document.createElement("p");
    p1.className = "muted small";
    p1.textContent =
      "The application bundle could not be fetched. This usually means a network outage or a stale cache entry.";
    box.appendChild(p1);

    var p2 = document.createElement("p");
    p2.className = "muted small";

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn primary";
    btn.textContent = "Reload";
    btn.addEventListener("click", function () {
      // reload() without arguments is the modern, non-deprecated
      // form. It bypasses the memory cache on most browsers.
      window.location.reload();
    });
    p2.appendChild(btn);
    box.appendChild(p2);

    // Clear and replace. root is empty at this point by the guard
    // above, but clearing defensively keeps this safe if the guard
    // is ever weakened.
    while (root.firstChild) root.removeChild(root.firstChild);
    root.appendChild(box);
  }, TIMEOUT_MS);
})();
