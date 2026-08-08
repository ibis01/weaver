window.W = window.W || {};

W.sync = (() => {
  const KEYS = [
    "portfolio",
    "transactions",
    "watchlist",
    "alerts",
    "settings",
    "learn",
    "achievements",
    "streak",
    "defi",
    "airdrops",
    "token-unlocks",
    "whale-wallets",
    "news-read",
    "news-saved",
  ];
  const conf = () => W.store.get("sync", {});
  const saveConf = (c) => W.store.set("sync", c);

  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const ub64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  async function key(code) {
    const m = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(code),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: new TextEncoder().encode("weaver-sync-v1"),
        iterations: 120000,
        hash: "SHA-256",
      },
      m,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  }
  async function encrypt(code, obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      await key(code),
      new TextEncoder().encode(JSON.stringify(obj)),
    );
    return { iv: b64(iv), ct: b64(ct) };
  }
  async function decrypt(code, p) {
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ub64(p.iv) },
      await key(code),
      ub64(p.ct),
    );
    return JSON.parse(new TextDecoder().decode(pt));
  }
  async function docId(code) {
    const h = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(code),
    );
    return [...new Uint8Array(h)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function db() {
    const f = (W.store.get("settings", {}) || {}).firebase;
    if (!f || !window.firebase) return null;
    if (!firebase.apps.length) firebase.initializeApp(f);
    return firebase.firestore();
  }

  const snapshot = () => {
    const o = {};
    KEYS.forEach((k) => (o[k] = W.store.get(k)));
    return o;
  };

  async function push(force) {
    const c = conf();
    if (!c.code) return W.ui.toast("Set a sync code first", "warn");
    if (!force && !c.auto) return;
    const d = db();
    if (!d) return;
    try {
      const payload = await encrypt(c.code, snapshot());
      await d
        .collection("vaults")
        .doc(await docId(c.code))
        .set({ updatedAt: Date.now(), iv: payload.iv, ct: payload.ct });
      saveConf({ code: c.code, auto: c.auto, last: Date.now() });
      if (force) W.ui.toast("☁️ Vault updated", "ok");
    } catch (e) {
      if (force) W.ui.toast("Push failed: " + e.message, "warn");
    }
  }
  const schedulePush = W.debounce(() => push(false), 2500);

  async function pull() {
    const c = conf();
    if (!c.code) return W.ui.toast("Enter your sync code first", "warn");
    const d = db();
    if (!d) return W.ui.toast("Firebase not configured", "warn");
    try {
      const doc = await d
        .collection("vaults")
        .doc(await docId(c.code))
        .get();
      if (!doc.exists)
        return W.ui.toast("No vault for that code yet — Push first", "warn");
      const data = await decrypt(c.code, doc.data());
      Object.entries(data).forEach(([k, v]) => {
        if (v !== undefined) W.store.set(k, v);
      });
      saveConf({ code: c.code, auto: c.auto, last: Date.now() });
      W.ui.toast("☁️ Restored — reloading…", "ok");
      setTimeout(() => location.reload(), 900);
    } catch (e) {
      W.ui.toast("Wrong code or corrupted vault", "warn");
    }
  }

  function boot() {
    const orig = W.store.set.bind(W.store);
    W.store.set = (k, v) => {
      orig(k, v);
      if (k !== "sync" && conf().auto && conf().code) schedulePush();
    };
    (async () => {
      const c = conf();
      if (!c.auto || !c.code) return;
      const d = db();
      if (!d) return;
      try {
        const doc = await d
          .collection("vaults")
          .doc(await docId(c.code))
          .get();
        if (doc.exists && doc.data().updatedAt > (c.last || 0)) await pull();
      } catch (e) {}
    })();
  }

  async function render(view) {
    const s = W.store.get("settings", {});
    if (!s.firebase) {
      view.innerHTML = `
        <div class="card"><h3>☁️ Multi-device Sync — Setup</h3>
          <p class="muted small">Your data is <b>end-to-end encrypted</b> (AES-256-GCM) with your sync code before it leaves the browser. Firebase only stores unreadable blobs under hashed IDs.</p>
          <ol class="muted small" style="margin:10px 0 10px 18px;line-height:1.9">
            <li>Create a free project at <b>console.firebase.google.com</b></li>
            <li><b>Build → Firestore Database → Create database</b></li>
            <li><b>Project settings → Your apps → Web (&lt;/&gt;)</b> → copy config values below</li>
            <li>Firestore <b>Rules</b>: <code>match /vaults/{id} { allow read, write: if true; }</code></li>
          </ol>
          <label>apiKey<input id="f-key"></label>
          <label>authDomain<input id="f-domain" placeholder="myapp.firebaseapp.com"></label>
          <label>projectId<input id="f-project"></label>
          <label>appId<input id="f-app"></label>
          <button class="btn primary mt" id="f-save">Save & Enable Sync</button>
        </div>`;
      view.querySelector("#f-save").onclick = () => {
        const firebase = {
          apiKey: view.querySelector("#f-key").value.trim(),
          authDomain: view.querySelector("#f-domain").value.trim(),
          projectId: view.querySelector("#f-project").value.trim(),
          appId: view.querySelector("#f-app").value.trim(),
        };
        if (!firebase.apiKey || !firebase.projectId || !firebase.appId)
          return W.ui.toast("apiKey, projectId and appId are required", "warn");
        W.store.set("settings", Object.assign({}, s, { firebase: firebase }));
        W.ui.toast("Firebase connected ☁️", "ok");
        render(view);
      };
      return;
    }

    const c = conf();
    view.innerHTML = `
      <div class="card"><h3>☁️ Sync Vault</h3>
        <label>Your sync code — this IS your encryption key. Lose it = lose the vault.
          <div class="ask-row"><input id="s-code" value="${c.code || ""}" placeholder="WEVR-…"><button class="btn" id="s-gen">🎲 Generate</button></div>
        </label>
        <label class="small"><input type="checkbox" id="s-auto" ${c.auto ? "checked" : ""} style="width:auto"> Auto-sync (push on every change · pull newer vaults on start)</label>
        <div class="qa mt">
          <button class="btn primary" id="s-push">⬆ Push to Cloud</button>
          <button class="btn" id="s-pull">⬇ Pull / Restore</button>
          <span class="muted small">${c.last ? "Last sync " + new Date(c.last).toLocaleString() : "Never synced"}</span>
        </div>
      </div>
      <div class="card"><h3>Add a second device</h3>
        <p class="muted small">Open Weaver there → Sync tab → paste the same Firebase config → enter this sync code → <b>Pull</b>.</p>
      </div>`;
    view.querySelector("#s-gen").onclick = () => {
      view.querySelector("#s-code").value =
        "WEVR-" +
        [...crypto.getRandomValues(new Uint8Array(4))]
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")
          .toUpperCase();
    };
    const persist = () =>
      saveConf({
        code: view.querySelector("#s-code").value.trim(),
        auto: view.querySelector("#s-auto").checked,
        last: c.last,
      });
    view.querySelector("#s-code").onchange = persist;
    view.querySelector("#s-auto").onchange = persist;
    view.querySelector("#s-push").onclick = () => {
      persist();
      push(true);
    };
    view.querySelector("#s-pull").onclick = () => {
      persist();
      pull();
    };
  }

  return { render: render, boot: boot };
})();
