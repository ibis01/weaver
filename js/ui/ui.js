window.W = window.W || {};

W.ui = {
  toast(msg, type = "info", ms = 3500) {
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.innerHTML = msg;
    document.getElementById("toasts").appendChild(el);
    setTimeout(() => {
      el.classList.add("hide");
      setTimeout(() => el.remove(), 300);
    }, ms);
  },

  modal({ title, body, footer }) {
    const root = document.getElementById("modal-root");
    root.innerHTML = `
      <div class="modal-backdrop" id="modal-backdrop">
        <div class="modal">
          <div class="modal-head"><h3>${title}</h3><button class="modal-x">✕</button></div>
          <div class="modal-body">${body}</div>
          ${footer ? `<div class="modal-foot">${footer}</div>` : ""}
        </div>
      </div>`;
    const close = () => (root.innerHTML = "");
    root.querySelector(".modal-x").onclick = close;
    root.querySelector("#modal-backdrop").addEventListener("click", (e) => {
      if (e.target.id === "modal-backdrop") close();
    });
    return { close, el: root.querySelector(".modal") };
  },

  confirm(msg, onYes) {
    const m = this.modal({
      title: "Are you sure?",
      body: `<p>${msg}</p>`,
      footer: `<button class="btn ghost" data-a="no">Cancel</button><button class="btn danger" data-a="yes">Delete</button>`,
    });
    m.el.querySelector("[data-a=no]").onclick = m.close;
    m.el.querySelector("[data-a=yes]").onclick = () => {
      m.close();
      onYes();
    };
  },

  /* Search-as-you-type coin picker used by forms */
  coinPicker(container, onPick) {
    container.innerHTML = `
      <div class="picker">
        <input class="picker-input" placeholder="Search coin (e.g. bitcoin, ETH)…" autocomplete="off">
        <div class="picker-results hidden"></div>
        <div class="picker-chip hidden"></div>
      </div>`;
    const input = container.querySelector(".picker-input");
    const results = container.querySelector(".picker-results");
    const chip = container.querySelector(".picker-chip");

    const doSearch = W.debounce(async () => {
      const q = input.value.trim();
      if (q.length < 2) {
        results.classList.add("hidden");
        return;
      }
      try {
        const data = await W.api.search(q);
        const coins = (data.coins || []).slice(0, 8);
        results.innerHTML =
          coins
            .map(
              (c) => `
          <div class="picker-item" data-id="${c.id}" data-symbol="${c.symbol}" data-name="${c.name}" data-img="${c.thumb || ""}">
            <img src="${c.thumb || ""}" alt=""><span>${c.name} <b class="muted">${c.symbol.toUpperCase()}</b></span>
            ${c.market_cap_rank ? `<span class="muted small">#${c.market_cap_rank}</span>` : ""}
          </div>`,
            )
            .join("") || '<div class="picker-item muted">No results</div>';
        results.classList.remove("hidden");
        results.querySelectorAll(".picker-item[data-id]").forEach((it) => {
          it.onclick = () => {
            const pick = {
              id: it.dataset.id,
              symbol: it.dataset.symbol,
              name: it.dataset.name,
              img: it.dataset.img,
            };
            chip.innerHTML = `<img src="${pick.img}"> ${pick.name} (${pick.symbol.toUpperCase()}) <button class="picker-clear">✕</button>`;
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
        console.warn(e);
      }
    }, 350);

    input.addEventListener("input", doSearch);
    input.addEventListener("focus", () => {
      if (results.innerHTML) results.classList.remove("hidden");
    });
    document.addEventListener("click", (e) => {
      if (!container.contains(e.target)) results.classList.add("hidden");
    });
  },

  spinner() {
    return '<div class="spinner"></div>';
  },
  empty(icon, msg, sub = "") {
    return `<div class="empty"><div class="empty-icon">${icon}</div><p>${msg}</p>${sub ? `<p class="muted small">${sub}</p>` : ""}</div>`;
  },
};
