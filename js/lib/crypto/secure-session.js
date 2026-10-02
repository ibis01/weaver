// ================================================================
// Shared decrypted-settings cache
// ================================================================
// Problem this solves: encrypted_settings (AI key, Telegram token) is
// encrypted at rest via SecureCrypto, but more than one module needs to
// read the decrypted values during a session (the Settings page, and
// the Telegram sender for background alerts). Without a shared cache,
// each module either re-prompts for the passphrase constantly, or
// (as telegram.js used to) keeps its own plaintext copy on disk.
//
// This module holds the decrypted sensitive settings ONLY in memory,
// for the current page session. It is never written to localStorage.
// Reloading the page clears it — same as clicking "Lock Keys".
//
// The plaintext passphrase is captured by unlock()/saveWithPassphrase()
// and never leaves the module. Callers use save(sensitiveObj) which
// re-encrypts with the cached key — they never need to see or hold the
// passphrase themselves.

window.W = window.W || {};

W.secureSession = (() => {
  "use strict";

  let _passphrase = null;
  let _cache = null; // { ai: {...}, telegram: {...} } — decrypted, memory-only

  function isUnlocked() {
    return !!_cache;
  }

  function hasStoredSecrets() {
    return !!W.store.get("encrypted_settings", null);
  }

  async function unlock(passphrase) {
    if (typeof passphrase !== "string" || !passphrase) {
      throw new Error("Passphrase is required");
    }
    const blob = W.store.get("encrypted_settings", null);
    if (!blob) {
      throw new Error("No encrypted settings found");
    }
    const data = await W.crypto.secure.decryptSettings(blob, passphrase);
    _passphrase = passphrase;
    _cache = data;
    return data;
  }

  async function save(sensitiveObj) {
    if (!_passphrase) {
      throw new Error("Session is locked");
    }
    if (!sensitiveObj || typeof sensitiveObj !== "object") {
      throw new Error("save() requires a plain object");
    }
    const encrypted = await W.crypto.secure.encryptSettings(
      sensitiveObj,
      _passphrase,
    );
    W.store.set("encrypted_settings", encrypted);
    _cache = sensitiveObj;
  }

  async function saveWithPassphrase(sensitiveObj, passphrase) {
    if (typeof passphrase !== "string" || !passphrase) {
      throw new Error("Passphrase is required");
    }
    if (!sensitiveObj || typeof sensitiveObj !== "object") {
      throw new Error("saveWithPassphrase() requires a plain object");
    }
    const encrypted = await W.crypto.secure.encryptSettings(
      sensitiveObj,
      passphrase,
    );
    W.store.set("encrypted_settings", encrypted);
    _passphrase = passphrase;
    _cache = sensitiveObj;
  }

  function lock() {
    _passphrase = null;
    _cache = null;
  }

  function clear() {
    W.store.delete("encrypted_settings");
    _passphrase = null;
    _cache = null;
  }

  function get(key) {
    if (!_cache) return null;
    const v = _cache[key];
    if (v === null || v === undefined) return null;
    return typeof v === "object" ? { ...v } : v;
  }

  return Object.freeze({
    isUnlocked,
    hasStoredSecrets,
    unlock,
    save,
    saveWithPassphrase,
    lock,
    clear,
    get,
  });
})();

console.log("[SecureSession] Module loaded.");
