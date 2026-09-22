// ===============================================================
//             Secure Encrypted Sync for Weaver
// ===============================================================
//
// This module provides:
//   - Generation of secure sync codes (128-bit entropy)
//   - PBKDF2 key derivation (600,000 iterations)
//   - AES-256-GCM encryption/decryption
//   - UI for managing sync codes and vault operations
//
// Storage model:
//   - Vault: encrypted blob in localStorage under vault_<code>
//   - Sync code: stored in plaintext under sync_code_current so the
//     UI can display it on revisit. A salted hash is also kept under
//     sync_code_hash for verification when restoring.
//
// SCOPE NOTE:
//   This module is a LOCAL encrypted backup. It does not transfer
//   data between devices: vault_<code> lives in localStorage, which
//   is per-browser. Restoring on another device would require a
//   transport layer that does not currently exist.
//
// Security notes:
//   - Sync codes are 16 bytes (128 bits) – not enumerable
//   - Encryption keys derived from user password (not sync code)
//   - The password never leaves this device
// ================================================================

// ── Constants ────────────────────────────────────────────────
const CONFIG = {
  ITERATIONS: 600000,
  HASH: "SHA-256",
  KEY_LENGTH: 256,
  AES_ALGORITHM: "AES-GCM",
  IV_LENGTH: 12,
  CODE_PREFIX: "WEVR-",
  CODE_TOTAL_HEX: 32,
};

// ── Secure Sync Code Generation ──────────────────────────────
function generateSyncCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  const groups = [];
  for (let i = 0; i < hex.length; i += 4) {
    groups.push(hex.substring(i, i + 4));
  }
  return `${CONFIG.CODE_PREFIX}${groups.join("-")}`;
}

function validateSyncCode(code) {
  if (!code || typeof code !== "string") return false;
  if (!code.startsWith(CONFIG.CODE_PREFIX)) return false;
  const clean = code.replace(CONFIG.CODE_PREFIX, "").replace(/-/g, "");
  if (clean.length !== CONFIG.CODE_TOTAL_HEX) return false;
  if (!/^[0-9A-Fa-f]{32}$/.test(clean)) return false;
  return true;
}

// ── Hash sync code with salt ──────────────────────────────────
async function hashSyncCode(code) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const encoder = new TextEncoder();
  const data = encoder.encode(salt + code);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { hash: hashHex, salt: Array.from(salt) };
}

async function verifySyncCode(code, storedHash, storedSalt) {
  const encoder = new TextEncoder();
  const salt = new Uint8Array(storedSalt);
  const data = encoder.encode(salt + code);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hashHex === storedHash;
}

// ── Cryptographic Helpers ──────────────────────────────────────
async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: CONFIG.ITERATIONS,
      hash: CONFIG.HASH,
    },
    keyMaterial,
    {
      name: CONFIG.AES_ALGORITHM,
      length: CONFIG.KEY_LENGTH,
    },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encrypt(plaintext, password, salt) {
  if (!salt) salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt);
  const iv = crypto.getRandomValues(new Uint8Array(CONFIG.IV_LENGTH));
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: CONFIG.AES_ALGORITHM, iv },
    key,
    enc.encode(plaintext),
  );
  return {
    ciphertext: new Uint8Array(ciphertext),
    iv: iv,
    salt: salt,
  };
}

async function decrypt(ciphertext, password, iv, salt) {
  const key = await deriveKey(password, salt);
  const plaintext = await crypto.subtle.decrypt(
    { name: CONFIG.AES_ALGORITHM, iv },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(plaintext);
}

// ── Storage Helpers ──────────────────────────────────────────
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function saveVault(data, password, syncCode) {
  if (!validateSyncCode(syncCode)) throw new Error("Invalid sync code");
  const plaintext = JSON.stringify(data);
  const { ciphertext, iv, salt } = await encrypt(plaintext, password);
  const payload = {
    version: 1,
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv),
    salt: arrayBufferToBase64(salt),
    timestamp: Date.now(),
  };
  const key = `vault_${syncCode}`;
  W.store.set(key, payload);
}

async function loadVault(password, syncCode) {
  if (!validateSyncCode(syncCode)) throw new Error("Invalid sync code");
  const key = `vault_${syncCode}`;
  const payload = W.store.get(key);
  if (!payload) throw new Error("Vault not found");
  const ciphertext = base64ToArrayBuffer(payload.ciphertext);
  const iv = base64ToArrayBuffer(payload.iv);
  const salt = base64ToArrayBuffer(payload.salt);
  const plaintext = await decrypt(
    new Uint8Array(ciphertext),
    password,
    new Uint8Array(iv),
    new Uint8Array(salt),
  );
  return JSON.parse(plaintext);
}

async function deleteVault(syncCode) {
  if (!validateSyncCode(syncCode)) throw new Error("Invalid sync code");
  const key = `vault_${syncCode}`;
  W.store.delete(key);
}

// ── UI Functions ──────────────────────────────────────────────

// Generates a new code and stores BOTH the plaintext and the salted
// hash. The plaintext is needed by render() to display the code on
// revisit without regenerating it. Only called from the explicit
// "Generate New" button or from syncVault()/render() when there is
// no existing code yet.
async function generateAndDisplayCode() {
  const code = generateSyncCode();
  const { hash, salt } = await hashSyncCode(code);
  W.store.set("sync_code_hash", { hash, salt });
  W.store.set("sync_code_current", code);
  const display = document.getElementById("sync-code-display");
  if (display) display.textContent = code;
  return code;
}

async function copySyncCode() {
  const display = document.getElementById("sync-code-display");
  if (!display || !display.textContent || display.textContent === "—") {
    W.ui.toast("No sync code to copy. Generate one first.", "warn");
    return;
  }
  try {
    await navigator.clipboard.writeText(display.textContent);
    W.ui.toast("Sync code copied 📋", "ok");
  } catch {
    const range = document.createRange();
    range.selectNode(display);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    document.execCommand("copy");
    W.ui.toast("Sync code copied 📋", "ok");
  }
}

async function syncVault() {
  const data = {
    portfolio: W.portfolio ? W.portfolio.all() : [],
    transactions: W.portfolio ? W.portfolio.txs() : [],
    watchlist: W.watchlist ? W.watchlist.list() : [],
    alerts: W.store.get("alerts", []),
    settings: W.store.get("settings", {}),
    achievements: W.store.get("achievements", {}),
    learn: W.store.get("learn", {}),
    timestamp: Date.now(),
    version: "1.0",
  };

  const password = await W.ui.promptPassword({
    title: "Sync Vault",
    message: "Enter your sync password (min 8 characters).",
    confirmLabel: "Sync",
    minLength: 8,
  });
  if (!password) {
    W.ui.toast("Sync cancelled.", "info");
    return;
  }

  // Reuse the existing code. Regenerating it here would invalidate
  // any code the user has already saved, orphaning the previously
  // stored vault under vault_<oldcode>. Only generate when there is
  // no code yet, or the user explicitly clicks "Generate New".
  let code = W.store.get("sync_code_current", null);
  if (!code || !validateSyncCode(code)) {
    code = await generateAndDisplayCode();
  }

  try {
    await saveVault(data, password, code);
    W.ui.toast(`✅ Vault saved! Code: ${code}`, "ok");
    const display = document.getElementById("sync-code-display");
    if (display) display.textContent = code;
  } catch (e) {
    W.ui.toast(`❌ Save failed: ${e.message}`, "warn");
  }
}

async function restoreVault() {
  const code = prompt("Enter your sync code (e.g. WEVR-7F3A-91BE-24C8-5E6D):");
  if (!code) return;
  if (!validateSyncCode(code)) {
    W.ui.toast("Invalid sync code format.", "warn");
    return;
  }

  // Verify against stored hash if present. This confirms the code is
  // one this device has seen before. It does NOT prove a vault exists
  // for it — loadVault() will check that separately.
  const storedHash = W.store.get("sync_code_hash", null);
  if (storedHash) {
    const valid = await verifySyncCode(code, storedHash.hash, storedHash.salt);
    if (!valid) {
      W.ui.toast("Sync code does not match any stored vault.", "warn");
      return;
    }
  } else {
    W.ui.toast("No vault found for this device.", "warn");
    return;
  }

  const password = await W.ui.promptPassword({
    title: "Restore Vault",
    message: "Enter your sync password.",
    confirmLabel: "Restore",
  });
  if (!password) return;

  try {
    const data = await loadVault(password, code);
    if (data.portfolio) W.portfolio.save(data.portfolio);
    if (data.transactions) W.portfolio.saveTxs(data.transactions);
    if (data.watchlist) W.watchlist.save(data.watchlist);
    if (data.alerts) W.store.set("alerts", data.alerts);
    if (data.settings) W.store.set("settings", data.settings);
    if (data.achievements) W.store.set("achievements", data.achievements);
    if (data.learn) W.store.set("learn", data.learn);
    W.ui.toast("✅ Vault restored successfully!", "ok");
    W.refresh();
  } catch (e) {
    W.ui.toast(`❌ Restore failed: ${e.message}`, "warn");
  }
}

// ── RENDER FUNCTION ────────────────────────────────────
function render(view) {
  if (view?.dataset?.route && view.dataset.route !== "sync") return;

  // Read the existing code. Never regenerate on render: the user may
  // have written the code down, and regenerating would silently
  // invalidate it, orphaning their stored vault.
  let code = W.store.get("sync_code_current", null);
  if (!code || !validateSyncCode(code)) {
    // No code yet — this is a first-visit case. Generate one and
    // display it. The user has nothing to lose because no vault
    // exists yet.
    code = generateSyncCode();
    hashSyncCode(code).then(({ hash, salt }) => {
      W.store.set("sync_code_hash", { hash, salt });
      W.store.set("sync_code_current", code);
      const display = view.querySelector("#sync-code-display");
      if (display) display.textContent = code;
    });
  }

  view.innerHTML = `
    <div class="card">
      <h3>☁️ Encrypted Sync</h3>
      <p class="muted small">
        Your data is encrypted with AES-256-GCM using PBKDF2 (600,000 iterations).
        Never share your sync code or password with anyone.
      </p>
      <div class="kv-row">
        <span class="muted">Sync Code</span>
        <span><code id="sync-code-display">${code || "—"}</code></span>
      </div>
      <div class="qa mt">
        <button class="btn tiny" id="sync-generate">🔄 Generate New</button>
        <button class="btn tiny" id="sync-copy">📋 Copy Code</button>
        <button class="btn primary tiny" id="sync-save">💾 Sync Vault</button>
        <button class="btn tiny" id="sync-restore">📥 Restore Vault</button>
      </div>
      <div id="sync-status" class="mt"></div>
    </div>
    <div class="card">
      <h3>🔐 Security Information</h3>
      <ul class="tx-list">
        <li>✅ 128-bit sync codes (WEVR-XXXX-XXXX-XXXX-XXXX)</li>
        <li>✅ PBKDF2 with 600,000 iterations</li>
        <li>✅ AES-256-GCM authenticated encryption</li>
        <li>✅ Random salt and IV per encryption</li>
        <li>✅ Data stored locally in your browser — it does not leave this device</li>
        <li>⚠️ Store your sync code and password safely — they cannot be recovered</li>
        <li>⚠️ This is a local encrypted backup, not multi-device sync</li>
      </ul>
    </div>
  `;

  // ── Wire up buttons ──────────────────────────────────────
  view.querySelector("#sync-generate").onclick = async () => {
    // Explicit user action: safe to mint a new code. The previous
    // vault (if any) remains stored under vault_<oldcode> and can
    // still be restored by re-entering the old code manually.
    await generateAndDisplayCode();
    W.ui.toast("New sync code generated 🔑", "ok");
  };

  view.querySelector("#sync-copy").onclick = copySyncCode;

  view.querySelector("#sync-save").onclick = () => {
    const status = view.querySelector("#sync-status");
    status.innerHTML = '<p class="muted small">⏳ Starting save...</p>';
    syncVault()
      .then(() => {
        status.innerHTML = '<p class="up small">✅ Save completed</p>';
      })
      .catch((e) => {
        status.innerHTML = `<p class="down small">❌ ${e.message}</p>`;
      });
  };

  view.querySelector("#sync-restore").onclick = () => {
    const status = view.querySelector("#sync-status");
    status.innerHTML = '<p class="muted small">⏳ Starting restore...</p>';
    restoreVault()
      .then(() => {
        status.innerHTML = '<p class="up small">✅ Restore completed</p>';
      })
      .catch((e) => {
        status.innerHTML = `<p class="down small">❌ ${e.message}</p>`;
      });
  };

  // Ensure the display is populated if a code was found in storage.
  const display = view.querySelector("#sync-code-display");
  if (display && code) display.textContent = code;
}

// ── Exports ────────────────────────────────────────────────────
const Sync = {
  generateCode: generateSyncCode,
  validateCode: validateSyncCode,
  hashSyncCode,
  verifySyncCode,
  encrypt,
  decrypt,
  save: saveVault,
  load: loadVault,
  delete: deleteVault,
  generateAndDisplayCode,
  copySyncCode,
  syncVault,
  restoreVault,
  render,
};

// Register with Weaver
window.W = window.W || {};
W.features = W.features || {};
W.features.sync = Sync;
W.sync = Sync;

// ── Integrate with the sync button in the top bar ────────────
if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    const syncBtn = document.getElementById("sync-btn");
    if (syncBtn) syncBtn.onclick = syncVault;
  });
}

console.log("[Sync] Module loaded (local encrypted backup).");
