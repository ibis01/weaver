// ================================================================
// js/ui/ui.js – Weaver UI Utilities
// ================================================================

window.W = window.W || {};

W.ui = {
  /**
   * Show a toast notification
   * @param {string} msg - HTML message to display
   * @param {string} type - 'info', 'ok', 'warn'
   * @param {number} ms - Duration in milliseconds
   */
  toast(msg, type = "info", ms = 3500) {
    const container = document.getElementById("toasts");
    if (!container) {
      console.warn("[UI] Toast container not found");
      return;
    }
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.innerHTML = msg;
    container.appendChild(el);
    setTimeout(() => {
      el.classList.add("hide");
      setTimeout(() => el.remove(), 300);
    }, ms);
  },

  /**
   * Create a modal dialog
   * @param {Object} config - { title, body, footer }
   * @returns {Object} { close, el }
   */
  modal({ title, body, footer }) {
    const root = document.getElementById("modal-root");
    if (!root) {
      console.warn("[UI] Modal root not found");
      return { close: () => {}, el: null };
    }

    root.innerHTML = `
      <div class="modal-backdrop" id="modal-backdrop">
        <div class="modal">
          <div class="modal-head">
            <h3>${title}</h3>
            <button class="modal-x" aria-label="Close">✕</button>
          </div>
          <div class="modal-body">${body}</div>
          ${footer ? `<div class="modal-foot">${footer}</div>` : ""}
        </div>
      </div>
    `;

    const close = () => {
      root.innerHTML = "";
    };

    // Close on X button
    const closeBtn = root.querySelector(".modal-x");
    if (closeBtn) closeBtn.onclick = close;

    // Close on backdrop click
    const backdrop = root.querySelector("#modal-backdrop");
    if (backdrop) {
      backdrop.addEventListener("click", (e) => {
        if (e.target.id === "modal-backdrop") close();
      });
    }

    // Close on Escape key
    const escHandler = (e) => {
      if (e.key === "Escape") {
        close();
        document.removeEventListener("keydown", escHandler);
      }
    };
    document.addEventListener("keydown", escHandler);

    return {
      close,
      el: root.querySelector(".modal"),
    };
  },

  /**
   * Show a confirmation dialog
   * @param {string} msg - Confirmation message
   * @param {Function} onYes - Callback when confirmed
   */
  confirm(msg, onYes) {
    const m = this.modal({
      title: "Are you sure?",
      body: `<p>${msg}</p>`,
      footer: `
        <button class="btn ghost" data-a="no">Cancel</button>
        <button class="btn danger" data-a="yes">Delete</button>
      `,
    });

    const noBtn = m.el?.querySelector('[data-a="no"]');
    const yesBtn = m.el?.querySelector('[data-a="yes"]');

    if (noBtn) noBtn.onclick = m.close;
    if (yesBtn) {
      yesBtn.onclick = () => {
        m.close();
        onYes();
      };
    }
  },

  /**
   * Search-as-you-type coin picker
   * @param {HTMLElement} container - The container element
   * @param {Function} onPick - Callback with selected coin { id, symbol, name, img }
   */
  coinPicker(container, onPick) {
    if (!container) {
      console.warn("[UI] coinPicker: container not found");
      return;
    }

    container.innerHTML = `
      <div class="picker">
        <input class="picker-input" placeholder="Search coin (e.g. bitcoin, ETH)…" autocomplete="off">
        <div class="picker-results hidden"></div>
        <div class="picker-chip hidden"></div>
      </div>
    `;

    const input = container.querySelector(".picker-input");
    const results = container.querySelector(".picker-results");
    const chip = container.querySelector(".picker-chip");

    if (!input || !results || !chip) return;

    const doSearch = W.debounce
      ? W.debounce(async () => {
          const q = input.value.trim();
          if (q.length < 2) {
            results.classList.add("hidden");
            return;
          }

          try {
            if (!W.api || !W.api.search) {
              throw new Error("CoinGecko API not loaded");
            }
            const data = await W.api.search(q);
            const coins = (data.coins || []).slice(0, 8);

            if (!coins.length) {
              results.innerHTML =
                '<div class="picker-item muted">No results</div>';
              results.classList.remove("hidden");
              return;
            }

            results.innerHTML = coins
              .map(
                (c) => `
              <div class="picker-item" data-id="${c.id}" data-symbol="${c.symbol}" data-name="${c.name}" data-img="${c.thumb || ""}">
                <img src="${c.thumb || ""}" alt="">
                <span>${c.name} <b class="muted">${c.symbol.toUpperCase()}</b></span>
                ${c.market_cap_rank ? `<span class="muted small">#${c.market_cap_rank}</span>` : ""}
              </div>
            `,
              )
              .join("");

            results.classList.remove("hidden");

            results.querySelectorAll(".picker-item[data-id]").forEach((it) => {
              it.onclick = () => {
                const pick = {
                  id: it.dataset.id,
                  symbol: it.dataset.symbol,
                  name: it.dataset.name,
                  img: it.dataset.img,
                };
                chip.innerHTML = `
              <img src="${pick.img}" alt="">
              ${pick.name} (${pick.symbol.toUpperCase()})
              <button class="picker-clear">✕</button>
            `;
                chip.classList.remove("hidden");
                input.classList.add("hidden");
                results.classList.add("hidden");
                chip.querySelector(".picker-clear").onclick = () => {
                  chip.classList.add("hidden");
                  input.classList.remove("hidden");
                  input.value = "";
                  onPick(null);
                };
                onPick(pick);
              };
            });
          } catch (e) {
            console.warn("[UI] coinPicker search error:", e.message);
            results.innerHTML = `<div class="picker-item muted">⚠️ ${e.message}</div>`;
            results.classList.remove("hidden");
          }
        }, 350)
      : (() => {
          console.warn("[UI] W.debounce not available");
        })();

    input.addEventListener("input", doSearch);

    input.addEventListener("focus", () => {
      if (results.innerHTML) results.classList.remove("hidden");
    });

    // Close results when clicking outside
    document.addEventListener("click", (e) => {
      if (!container.contains(e.target)) results.classList.add("hidden");
    });
  },

  /**
   * Loading spinner HTML
   * @returns {string} HTML string
   */
  spinner() {
    return '<div class="spinner"></div>';
  },

  /**
   * Empty state HTML
   * @param {string} icon - Emoji or icon
   * @param {string} msg - Main message
   * @param {string} sub - Subtitle message (optional)
   * @returns {string} HTML string
   */
  empty(icon, msg, sub = "") {
    return `
      <div class="empty">
        <div class="empty-icon">${icon}</div>
        <p>${msg}</p>
        ${sub ? `<p class="muted small">${sub}</p>` : ""}
      </div>
    `;
  },
};

console.log("[UI] Module loaded.");
