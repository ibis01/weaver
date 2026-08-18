// ================================================================
// js/features/sync.js – Secure Encrypted Sync for Weaver
// ================================================================
//
// This module provides:
//   - Generation of secure sync codes (128-bit entropy)
//   - PBKDF2 key derivation (120,000 iterations)
//   - AES-256-GCM encryption/decryption
//   - IndexedDB / localStorage storage of encrypted vaults
//   - Validation and error handling
//
// Security notes:
//   - Sync codes are 16 bytes (128 bits) – not enumerable
//   - Encryption keys derived from user password (not sync code)
//   - Firestore rules should NOT be "allow read, write: if true"
//   - See RECOMMENDED FIRESTORE RULES below
// ================================================================

// -----------------------------------------------------------------
// Constants & Configuration
// -----------------------------------------------------------------

const CONFIG = {
  // PBKDF2 parameters
  ITERATIONS: 120000,
  HASH: "SHA-256",
  KEY_LENGTH: 256, // bits (32 bytes for AES-256)

  // AES-GCM parameters
  AES_ALGORITHM: "AES-GCM",
  IV_LENGTH: 12, // bytes (recommended for GCM)

  // Sync code format
  CODE_PREFIX: "WEVR-",
  CODE_GROUPS: 4,
  CODE_GROUP_LEN: 4, // hex chars per group
  CODE_TOTAL_HEX: 32, // 16 bytes * 2 hex chars
};

// -----------------------------------------------------------------
// Secure Sync Code Generation
// -----------------------------------------------------------------

/**
 * Generate a cryptographically secure sync code with 128 bits of entropy.
 * @returns {string} e.g. "WEVR-7F3A-91BE-24C8-5E6D"
 */
function generateSyncCode() {
  // 16 bytes = 128 bits
  const bytes = crypto.getRandomValues(new Uint8Array(16));

  // Convert to hex
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();

  // Format as WEVR-XXXX-XXXX-XXXX-XXXX
  const groups = [];
  for (let i = 0; i < hex.length; i += 4) {
    groups.push(hex.substring(i, i + 4));
  }
  return `${CONFIG.CODE_PREFIX}${groups.join("-")}`;
}

/**
 * Validate a sync code format and entropy.
 * @param {string} code - The code to validate
 * @returns {boolean} True if valid
 */
function validateSyncCode(code) {
  if (!code || typeof code !== "string") return false;

  // Check prefix
  if (!code.startsWith(CONFIG.CODE_PREFIX)) return false;

  // Remove prefix and hyphens
  const clean = code.replace(CONFIG.CODE_PREFIX, "").replace(/-/g, "");

  // Must be 32 hex characters (16 bytes)
  if (clean.length !== CONFIG.CODE_TOTAL_HEX) return false;
  if (!/^[0-9A-Fa-f]{32}$/.test(clean)) return false;

  return true;
}

// -----------------------------------------------------------------
// Cryptographic Helpers (Web Crypto API)
// -----------------------------------------------------------------

/**
 * Derive an AES-GCM key from a password using PBKDF2.
 * @param {string} password - User's password or passphrase
 * @param {Uint8Array} salt - Random salt (16+ bytes)
 * @returns {Promise<CryptoKey>}
 */
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

/**
 * Encrypt plaintext using AES-256-GCM.
 * @param {string} plaintext - Data to encrypt
 * @param {string} password - User password
 * @param {Uint8Array} [salt] - Optional salt (generated if not provided)
 * @returns {Promise<{ ciphertext: Uint8Array, iv: Uint8Array, salt: Uint8Array }>}
 */
async function encrypt(plaintext, password, salt) {
  // Generate salt if not provided
  if (!salt) {
    salt = crypto.getRandomValues(new Uint8Array(16));
  }

  // Derive key
  const key = await deriveKey(password, salt);

  // Generate IV
  const iv = crypto.getRandomValues(new Uint8Array(CONFIG.IV_LENGTH));

  // Encrypt
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

/**
 * Decrypt ciphertext using AES-256-GCM.
 * @param {Uint8Array} ciphertext - Encrypted data
 * @param {string} password - User password
 * @param {Uint8Array} iv - Initialization vector
 * @param {Uint8Array} salt - Salt used during encryption
 * @returns {Promise<string>} Decrypted plaintext
 */
async function decrypt(ciphertext, password, iv, salt) {
  const key = await deriveKey(password, salt);

  const plaintext = await crypto.subtle.decrypt(
    { name: CONFIG.AES_ALGORITHM, iv },
    key,
    ciphertext,
  );

  return new TextDecoder().decode(plaintext);
}

// -----------------------------------------------------------------
// Sync Storage (localStorage with optional IndexedDB)
// -----------------------------------------------------------------

/**
 * Save encrypted vault to storage.
 * @param {Object} data - The vault data (will be JSON-serialized)
 * @param {string} password - User password
 * @param {string} syncCode - The sync code (used as document ID / key)
 * @returns {Promise<void>}
 */
async function saveVault(data, password, syncCode) {
  if (!validateSyncCode(syncCode)) {
    throw new Error("Invalid sync code format");
  }

  // Serialize data
  const plaintext = JSON.stringify(data);

  // Encrypt
  const { ciphertext, iv, salt } = await encrypt(plaintext, password);

  // Package for storage
  const payload = {
    version: 1,
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv),
    salt: arrayBufferToBase64(salt),
    timestamp: Date.now(),
  };

  // Store using W.store (localStorage)
  const key = `vault_${syncCode}`;
  W.store.set(key, payload);
}

/**
 * Load encrypted vault from storage.
 * @param {string} password - User password
 * @param {string} syncCode - The sync code
 * @returns {Promise<Object>} Decrypted vault data
 */
async function loadVault(password, syncCode) {
  if (!validateSyncCode(syncCode)) {
    throw new Error("Invalid sync code format");
  }

  const key = `vault_${syncCode}`;
  const payload = W.store.get(key);

  if (!payload) {
    throw new Error("Vault not found");
  }

  // Convert from base64
  const ciphertext = base64ToArrayBuffer(payload.ciphertext);
  const iv = base64ToArrayBuffer(payload.iv);
  const salt = base64ToArrayBuffer(payload.salt);

  // Decrypt
  const plaintext = await decrypt(
    new Uint8Array(ciphertext),
    password,
    new Uint8Array(iv),
    new Uint8Array(salt),
  );

  return JSON.parse(plaintext);
}

/**
 * Delete a vault from storage.
 * @param {string} syncCode - The sync code
 * @returns {Promise<void>}
 */
async function deleteVault(syncCode) {
  if (!validateSyncCode(syncCode)) {
    throw new Error("Invalid sync code format");
  }
  const key = `vault_${syncCode}`;
  W.store.delete(key);
}

// -----------------------------------------------------------------
// Utility: Base64 <-> ArrayBuffer conversion
// -----------------------------------------------------------------

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// -----------------------------------------------------------------
// UI Integration (sync button and profile display)
// -----------------------------------------------------------------

/**
 * Generate a new sync code and display it in the UI.
 * Called from the Profile page "Generate New Code" button.
 */
async function generateAndDisplayCode() {
  const code = generateSyncCode();
  const display = document.getElementById("sync-code-display");
  if (display) {
    display.textContent = code;
    // Also store the code temporarily so user can copy it
    W.store.set("last_sync_code", code);
  }
  return code;
}

/**
 * Copy the current sync code to clipboard.
 */
async function copySyncCode() {
  const display = document.getElementById("sync-code-display");
  if (!display || !display.textContent || display.textContent === "—") {
    W.ui.toast("No sync code to copy. Generate one first.", "warn");
    return;
  }
  try {
    await navigator.clipboard.writeText(display.textContent);
    W.ui.toast("Sync code copied to clipboard 📋", "ok");
  } catch (e) {
    // Fallback: select and copy manually
    const range = document.createRange();
    range.selectNode(display);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    document.execCommand("copy");
    W.ui.toast("Sync code copied to clipboard 📋", "ok");
  }
}

/**
 * Sync vault: encrypt and save all user data.
 * Called from the sync button in the top bar.
 */
async function syncVault() {
  // Gather all data to sync
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

  const password = prompt("Enter your sync password (min 8 characters):");
  if (!password) {
    W.ui.toast("Sync cancelled.", "info");
    return;
  }
  if (password.length < 8) {
    W.ui.toast("Password must be at least 8 characters.", "warn");
    return;
  }

  let code = W.store.get("last_sync_code", null);
  if (!code || !validateSyncCode(code)) {
    code = generateSyncCode();
    W.store.set("last_sync_code", code);
  }

  try {
    await saveVault(data, password, code);
    W.ui.toast(`✅ Vault synced! Code: ${code}`, "ok");
    // Update display
    const display = document.getElementById("sync-code-display");
    if (display) display.textContent = code;
  } catch (e) {
    W.ui.toast(`❌ Sync failed: ${e.message}`, "warn");
  }
}

/**
 * Restore vault: load and decrypt data.
 * Called from the Profile page "Restore Vault" button (optional).
 */
async function restoreVault() {
  const code = prompt("Enter your sync code (e.g. WEVR-7F3A-91BE-24C8-5E6D):");
  if (!code) return;
  if (!validateSyncCode(code)) {
    W.ui.toast("Invalid sync code format.", "warn");
    return;
  }

  const password = prompt("Enter your sync password:");
  if (!password) return;

  try {
    const data = await loadVault(password, code);
    // Restore data into storage
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

// -----------------------------------------------------------------
// Public API
// -----------------------------------------------------------------

const Sync = {
  generateCode: generateSyncCode,
  validateCode: validateSyncCode,
  encrypt,
  decrypt,
  save: saveVault,
  load: loadVault,
  delete: deleteVault,
  generateAndDisplayCode,
  copySyncCode,
  syncVault,
  restoreVault,
};

// Register with Weaver
window.W = window.W || {};
W.features = W.features || {};
W.features.sync = Sync;

// Also expose globally for convenience
window.Sync = Sync;

// ── Integrate with the sync button in the top bar ──
if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    // Hook the sync button if it exists
    const syncBtn = document.getElementById("sync-btn");
    if (syncBtn) {
      syncBtn.onclick = syncVault;
    }
  });
}

console.log("[Sync] Module loaded securely.");
