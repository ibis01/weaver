// ================================================================
// Weaver Vault
// ================================================================
//
// Encrypted local storage for user-sensitive data. Implements the
// Session 1 audit design. See memory-bank/vault-audit-2026-10.md.
//
// Storage layout (raw localStorage keys, after W.store's "weaver:"):
//   vault::__root             { v, salt, verifier, writtenAt }
//   vault::<name>             { v, iv, ct, writtenAt }
//   vault::__staging::<name>  same shape as entries; migration only
//
// The `vault::` prefix is deliberately distinct from `vault_<code>`
// used by sync.js — no collision.
//
// Crypto:
//   PBKDF2-SHA256, 600k iterations, 256-bit → AES-GCM CryptoKey
//   16-byte salt, fixed per vault, stored in the root marker
//   Fresh 12-byte IV per write
//   Imported key is non-extractable, cached for the page session
//
// Session 1 decisions implemented:
//   1. Sibling W.vault (this file)
//   2. Locked reads throw VaultLockedError
//   3. lock() clears in-memory state, then location.reload()
//   4. No key persistence across refresh (re-prompt)
//   5. Migration uses staging key + raw localStorage read-back
//   6. exportBlob() returns ciphertext for sync.js
//   7. Derived CryptoKey cached for the page session

window.W = window.W || {};

W.vault = (() => {
  "use strict";

  const KDF_ITERATIONS = 600000;
  const KDF_HASH = "SHA-256";
  const KEY_LENGTH = 256;
  const AES = "AES-GCM";
  const IV_LENGTH = 12;
  const SALT_LENGTH = 16;
  const BLOB_V = 1;

  // Sentinel for "key not present". Cannot collide with any JSON
  // value because Symbols do not serialize. W.store.get(key,
  // undefined) would be silently replaced by the default parameter,
  // so we must pass a distinct sentinel.
  const MISSING = Symbol("vault-missing");

  // Canonical list of keys that route through the vault. W.store
  // consults this via routingFor(). Additions here are the ONLY place
  // to declare a new vault-routed key.
  const VAULT_KEYS = Object.freeze([
    "portfolio",
    "transactions",
    "watchlist",
    "theses",
    "journal",
    "alerts",
    "unlocks",
    "learn",
    "achievements",
    "web3_state",
    "deployer_store",
    "wallet_cost_basis",
  ]);
  const VAULT_KEY_SET = new Set(VAULT_KEYS);

  const ROOT_KEY = "vault::__root";
  const ENTRY_PREFIX = "vault::";
  const STAGING_PREFIX = "vault::__staging::";
  const VERIFIER_PLAINTEXT = "weaver-vault-v1";
  const STORE_RAW_PREFIX = "weaver:";

  // Tests set globalThis.__WEAVER_VAULT_NO_RELOAD__ = true to make
  // lock() skip the page reload.
  function testMode() {
    return globalThis.__WEAVER_VAULT_NO_RELOAD__ === true;
  }

  class VaultLockedError extends Error {
    constructor(message) {
      super(message || "Vault is locked");
      this.name = "VaultLockedError";
      this.code = "VAULT_LOCKED";
    }
  }

  let _key = null;        // CryptoKey | null
  let _cache = null;      // { [name]: plaintext } | null
  let _unlocking = null;  // in-flight unlock, deduped

  function isLocked() { return _key === null; }
  function isUnlocked() { return _key !== null; }

  function hasStoredVault() {
    try { return W.store.get(ROOT_KEY, null) !== null; }
    catch { return false; }
  }

  // ── Base64 ────────────────────────────────────────────────
  function u8ToBase64(u8) {
    let s = "";
    for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return btoa(s);
  }
  function base64ToU8(b64) {
    const s = atob(b64);
    const u8 = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
    return u8;
  }

  // ── KDF ───────────────────────────────────────────────────
  async function deriveKey(passphrase, salt) {
    if (typeof passphrase !== "string" || !passphrase) {
      throw new Error("Passphrase is required");
    }
    const enc = new TextEncoder();
    const material = await crypto.subtle.importKey(
      "raw",
      enc.encode(passphrase),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: KDF_ITERATIONS,
        hash: KDF_HASH,
      },
      material,
      { name: AES, length: KEY_LENGTH },
      false,
      ["encrypt", "decrypt"],
    );
  }

  // ── Encrypt / decrypt ─────────────────────────────────────
  async function encrypt(key, value) {
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const enc = new TextEncoder();
    const ct = await crypto.subtle.encrypt(
      { name: AES, iv },
      key,
      enc.encode(JSON.stringify(value)),
    );
    return { iv: u8ToBase64(iv), ct: u8ToBase64(new Uint8Array(ct)) };
  }

  async function decrypt(key, ivB64, ctB64) {
    const iv = base64ToU8(ivB64);
    const ct = base64ToU8(ctB64);
    const pt = await crypto.subtle.decrypt({ name: AES, iv }, key, ct);
    return JSON.parse(new TextDecoder().decode(pt));
  }

  // ── Raw read-back ─────────────────────────────────────────
  // storage.js swallows QuotaExceededError and falls back to an
  // in-memory map. That's invisible through W.store.get (which reads
  // the map). Direct localStorage is the only way to know whether a
  // write actually persisted.
  // Raw localStorage read/write that bypasses W.store's vault
  // routing. Migration must read the actual plaintext bytes — once
  // the vault is set up and unlocked, W.store.get(name) would route
  // to the vault cache and return fallback, not the plaintext.
  function rawGet(name) {
    try {
      const raw = localStorage.getItem(STORE_RAW_PREFIX + name);
      if (raw === null) return MISSING;
      return JSON.parse(raw);
    } catch {
      return MISSING;
    }
  }
  function rawSet(name, value) {
    localStorage.setItem(STORE_RAW_PREFIX + name, JSON.stringify(value));
  }

  function isPersisted(name) {
    try {
      return localStorage.getItem(STORE_RAW_PREFIX + name) !== null;
    } catch {
      return false;
    }
  }

  // ── Setup / unlock ────────────────────────────────────────
  async function setup(passphrase) {
    if (hasStoredVault()) {
      throw new Error("Vault already exists; use unlock()");
    }
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const key = await deriveKey(passphrase, salt);
    const verifier = await encrypt(key, VERIFIER_PLAINTEXT);
    W.store.set(ROOT_KEY, {
      v: BLOB_V,
      salt: u8ToBase64(salt),
      verifier,
      writtenAt: Date.now(),
    });
    if (!isPersisted(ROOT_KEY)) {
      try { W.store.delete(ROOT_KEY); } catch (_) {}
      throw new Error(
        "Vault root could not be persisted (storage full?)",
      );
    }
    _key = key;
    _cache = Object.create(null);
  }

  async function unlock(passphrase) {
    if (_unlocking) return _unlocking;
    _unlocking = (async () => {
      const root = W.store.get(ROOT_KEY, null);
      if (!root || typeof root !== "object" || root.v !== BLOB_V) {
        throw new Error("No vault found");
      }
      const salt = base64ToU8(root.salt);
      const key = await deriveKey(passphrase, salt);
      let plain;
      try {
        plain = await decrypt(key, root.verifier.iv, root.verifier.ct);
      } catch {
        throw new Error(
          "Incorrect passphrase or corrupted vault (decryption failed)",
        );
      }
      if (plain !== VERIFIER_PLAINTEXT) {
        throw new Error("Incorrect passphrase (verifier mismatch)");
      }
      _key = key;
      _cache = Object.create(null);
      // Pre-decrypt every blob into the sync cache. Reads after
      // unlock are synchronous (getCached); this is where the cost
      // is paid, once.
      const existing = keys();
      for (const name of existing) {
        try {
          const blob = W.store.get(ENTRY_PREFIX + name, null);
          if (blob && blob.v === BLOB_V) {
            _cache[name] = await decrypt(_key, blob.iv, blob.ct);
          }
        } catch (e) {
          console.warn("[Vault] Failed to decrypt", name, e && e.message);
        }
      }
    })();
    try {
      await _unlocking;
    } finally {
      _unlocking = null;
    }
  }

  // ── Lock ──────────────────────────────────────────────────
  function lock() {
    _key = null;
    _cache = null;
    _unlocking = null;
    if (
      !testMode() &&
      typeof location !== "undefined" &&
      typeof location.reload === "function"
    ) {
      location.reload();
    }
  }

  // ── CRUD ──────────────────────────────────────────────────
  async function get(name) {
    if (isLocked()) throw new VaultLockedError();
    if (typeof name !== "string" || !name) {
      throw new Error("Vault key must be a non-empty string");
    }
    if (name in _cache) return _cache[name];
    const blob = W.store.get(ENTRY_PREFIX + name, null);
    if (!blob || blob.v !== BLOB_V) return null;
    const value = await decrypt(_key, blob.iv, blob.ct);
    _cache[name] = value;
    return value;
  }

  async function set(name, value) {
    if (isLocked()) throw new VaultLockedError();
    if (typeof name !== "string" || !name) {
      throw new Error("Vault key must be a non-empty string");
    }
    // Sync cache update first: reads immediately after set() see the
    // new value even before the async encryption completes.
    _cache[name] = value;
    const { iv, ct } = await encrypt(_key, value);
    const blob = { v: BLOB_V, iv, ct, writtenAt: Date.now() };
    W.store.set(ENTRY_PREFIX + name, blob);
    if (!isPersisted(ENTRY_PREFIX + name)) {
      throw new Error("Vault write did not persist (storage full?)");
    }
    _cache[name] = value;
  }

  async function del(name) {
    if (isLocked()) throw new VaultLockedError();
    W.store.delete(ENTRY_PREFIX + name);
    if (_cache) delete _cache[name];
  }

  function has(name) {
    return W.store.get(ENTRY_PREFIX + name, null) !== null;
  }

  function keys() {
    const out = [];
    const prefix = STORE_RAW_PREFIX + ENTRY_PREFIX;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(prefix)) continue;
        const name = k.slice(prefix.length);
        if (name.startsWith("__")) continue;
        out.push(name);
      }
    } catch (_) {}
    return out;
  }

  // ── Migration ─────────────────────────────────────────────
  // Plaintext names live at W.store.get(name). Vault entries live at
  // W.store.get("vault::" + name). Migration:
  //   1. encrypt plaintext → staging key
  //   2. verify staging persisted via raw localStorage
  //   3. delete plaintext, verify gone
  //   4. write to vault key, verify persisted
  //   5. delete staging
  // Any verification failure aborts and leaves plaintext intact.
  async function migrateKeys(names) {
    if (isLocked()) throw new VaultLockedError();
    if (!Array.isArray(names)) throw new Error("names must be an array");

    const result = { migrated: [], skipped: [], failed: [] };

    for (const name of names) {
      if (typeof name !== "string" || !name || name.startsWith("__")) {
        result.skipped.push({ name, reason: "invalid-name" });
        continue;
      }
      if (W.store.get(ENTRY_PREFIX + name, null) !== null) {
        result.skipped.push({ name, reason: "vault-entry-exists" });
        continue;
      }
      const plain = rawGet(name);
      if (plain === MISSING) {
        result.skipped.push({ name, reason: "no-plaintext" });
        continue;
      }

      const stagingName = STAGING_PREFIX + name;
      let blob;
      try {
        const { iv, ct } = await encrypt(_key, plain);
        blob = { v: BLOB_V, iv, ct, writtenAt: Date.now() };
        W.store.set(stagingName, blob);
      } catch (e) {
        result.failed.push({
          name,
          reason: "encrypt-or-stage-failed",
          error: String(e && e.message ? e.message : e),
        });
        continue;
      }

      if (!isPersisted(stagingName)) {
        // W.store.set fell to _memory. Plaintext untouched.
        try { W.store.delete(stagingName); } catch (_) {}
        result.failed.push({ name, reason: "staging-not-persisted" });
        continue;
      }

      try { localStorage.removeItem(STORE_RAW_PREFIX + name); } catch (_) {}
      if (isPersisted(name)) {
        try { W.store.delete(stagingName); } catch (_) {}
        result.failed.push({ name, reason: "plaintext-delete-failed" });
        continue;
      }

      W.store.set(ENTRY_PREFIX + name, blob);
      if (!isPersisted(ENTRY_PREFIX + name)) {
        // Vault write failed. Restore plaintext from in-memory copy.
        try { rawSet(name, plain); } catch (_) {}
        try { W.store.delete(stagingName); } catch (_) {}
        result.failed.push({ name, reason: "vault-write-failed" });
        continue;
      }

      W.store.delete(stagingName);
      _cache[name] = plain;
      result.migrated.push(name);
    }

    return result;
  }

  // ── Sync read from cache ──────────────────────────────────
  // Throws when locked. Returns fallback if the key is not cached.
  // This is the sync read path that W.store routes vault keys to.
  function getCached(name, fallback) {
    if (isLocked()) throw new VaultLockedError();
    if (_cache && name in _cache) return _cache[name];
    return fallback === undefined ? null : fallback;
  }

  // ── Routing decision for W.store ──────────────────────────
  // Returns "vault"    → W.store should call getCached / set / delete
  //         "locked"   → throw VaultLockedError (sensitive key, vault locked)
  //         "plaintext"→ no vault, or non-sensitive key: normal path
  function routingFor(key) {
    if (!VAULT_KEY_SET.has(key)) return "plaintext";
    if (!hasStoredVault()) return "plaintext";
    if (isLocked()) return "locked";
    return "vault";
  }

  // ── Export ────────────────────────────────────────────────
  // Returns the raw ciphertext structure. sync.js calls this and
  // writes the result under vault_<syncCode>. No re-encryption.
  function exportBlob() {
    if (isLocked()) throw new VaultLockedError();
    const root = W.store.get(ROOT_KEY, null);
    const entries = {};
    for (const k of keys()) {
      entries[k] = W.store.get(ENTRY_PREFIX + k, null);
    }
    return { root, entries, exportedAt: Date.now() };
  }

  // ── Test hooks ────────────────────────────────────────────
  function __testClear() {
    _key = null;
    _cache = null;
    _unlocking = null;
  }
  function __testSetKey(key) {
    _key = key;
    _cache = Object.create(null);
  }

  return Object.freeze({
    isLocked,
    isUnlocked,
    hasStoredVault,
    setup,
    unlock,
    lock,
    get,
    set,
    delete: del,
    has,
    keys,
    migrateKeys,
    exportBlob,
    getCached,
    routingFor,
    VAULT_KEYS,
    VaultLockedError,
    __test: Object.freeze({
      clear: __testClear,
      setKey: __testSetKey,
    }),
  });
})();

console.log("[Vault] Module loaded.");
