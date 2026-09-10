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

window.W = window.W || {};

W.secureSession = (() => {
  let _passphrase = null;
  let _cache = null; // { ai: {...}, telegram: {...} } — decrypted, memory-only

  function isUnlocked() {
    return !!_cache;
  }

  /** Decrypts encrypted_settings with the given passphrase and caches the result in memory. */
  async function unlock(passphrase) {
    const blob = W.store.get("encrypted_settings", null);
    if (!blob) {
      throw new Error("No encrypted settings found");
    }
    const data = await W.crypto.secure.decryptSettings(blob, passphrase);
    _passphrase = passphrase;
    _cache = data;
    return data;
  }

  /** Clears the in-memory cache. Does not touch anything on disk. */
  function lock() {
    _passphrase = null;
    _cache = null;
  }

  /** Encrypts + persists sensitiveObj, and updates the in-memory cache to match. */
  async function save(sensitiveObj, passphrase) {
    const encrypted = await W.crypto.secure.encryptSettings(
      sensitiveObj,
      passphrase,
    );
    W.store.set("encrypted_settings", encrypted);
    _passphrase = passphrase;
    _cache = sensitiveObj;
  }

  /** Returns the decrypted sub-object (e.g. "telegram", "ai"), or null if locked. */
  function get(key) {
    if (!_cache) return null;
    return _cache[key] || null;
  }

  function getPassphrase() {
    return _passphrase;
  }

  function hasStoredSecrets() {
    return !!W.store.get("encrypted_settings", null);
  }

  return {
    isUnlocked,
    unlock,
    lock,
    save,
    get,
    getPassphrase,
    hasStoredSecrets,
  };
})();

console.log("[SecureSession] Module loaded.");
