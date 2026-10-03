// ================================================================
// Vault Unlock View
// ================================================================
// Rendered by the router when #/unlock is reached and a vault exists.
// Setup (creating a new vault) lives in Settings → Security, not
// here — the unlock view is only for users who already opted in.

window.W = window.W || {};

W.vaultUnlock = (() => {
  "use strict";

  function render(view) {
    if (!view) return;

    if (!W.vault || !W.vault.hasStoredVault()) {
      location.hash = "#/dashboard";
      return;
    }
    if (W.vault.isUnlocked()) {
      const target =
        sessionStorage.getItem("post_unlock_route") || "dashboard";
      sessionStorage.removeItem("post_unlock_route");
      location.hash = "#/" + target;
      return;
    }

    view.innerHTML = `
      <div class="card vault-unlock-card">
        <h2>🔓 Unlock Weaver</h2>
        <p class="muted small">
          Your data is encrypted with a passphrase only you know. It
          is not stored anywhere. If you forget it, the encrypted
          data cannot be recovered.
        </p>
        <form id="vault-form" autocomplete="on">
          <label>
            Passphrase
            <input type="password" id="vault-pw" autocomplete="current-password" spellcheck="false" class="w-100">
          </label>
          <p id="vault-error" class="down small hidden"></p>
          <button class="btn primary mt" id="vault-unlock-go" type="submit">Unlock</button>
        </form>
      </div>
    `;

    const pw = view.querySelector("#vault-pw");
    const errEl = view.querySelector("#vault-error");
    const btn = view.querySelector("#vault-unlock-go");

    function showError(msg) {
      errEl.textContent = msg;
      errEl.classList.remove("hidden");
    }

    async function submit() {
      if (btn.disabled) return;
      btn.disabled = true;
      btn.textContent = "Unlocking…";
      const value = pw.value;
      if (!value) {
        showError("Passphrase required.");
        btn.disabled = false;
        btn.textContent = "Unlock";
        return;
      }
      try {
        await W.vault.unlock(value);
        const target =
          sessionStorage.getItem("post_unlock_route") || "dashboard";
        sessionStorage.removeItem("post_unlock_route");
        location.hash = "#/" + target;
      } catch (e) {
        showError(e && e.message ? e.message : "Unlock failed.");
        btn.disabled = false;
        btn.textContent = "Unlock";
        pw.select();
      }
    }

    const form = view.querySelector("#vault-form");
    if (form) {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        submit();
      });
    } else {
      btn.onclick = submit;
    }
    setTimeout(() => pw.focus(), 30);
  }

  return Object.freeze({ render });
})();

console.log("[VaultUnlock] Module loaded.");
