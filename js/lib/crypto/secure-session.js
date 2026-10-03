// ================================================================
// Secure Session — vault-backed credential cache (Session 3c)
// ================================================================
// Historical role: owned the encrypted_settings blob (AI key,
// Telegram token) under its own passphrase. Session 3c retires that
// role when a vault exists.
//
// New behavior:
//   - When W.vault has a stored vault, this module is a thin proxy
//     over vault.getCached("ai"/"telegram") and vault.set(...).
//     One passphrase. One unlock. Same vault lifecycle.
//   - When no vault exists, this module keeps its legacy behavior
//     (encrypted_settings blob, own passphrase) so pre-3c installs
//     keep working until the user enables a vault.
//
// The migration path is W.vault.migrateSecureSession(oldPassphrase):
// decrypt the legacy blob, write ai + telegram as vault entries, and
// delete the source only after the writes persist.

window.W = window.W || {};

W.secureSession = (() => {
  "use strict";

  let _passphrase = null; // legacy mode only
  let _cache = null;      // legacy mode only { ai, telegram }

  function vaultPresent() {
    try {
      return !!(
        W.vault &&
        typeof W.vault.hasStoredVault === "function" &&
        W.vault.hasStoredVault()
      );
    } catch (_) {
      return false;
    }
  }

  function isUnlocked() {
    if (vaultPresent()) return W.vault.isUnlocked();
    return !!_cache;
  }

  function hasStoredSecrets() {
    if (vaultPresent()) {
      // Vault mode: consider credentials present if the vault holds
      // either sub-object. has() reads the raw key list, so it works
      // while locked without needing to decrypt.
      try {
        return W.vault.has("ai") || W.vault.has("telegram");
      } catch (_) {
        return false;
      }
    }
    return !!W.store.get("encrypted_settings", null);
  }

  async function unlock(passphrase) {
    if (vaultPresent()) {
      // Delegates to the vault. The vault handles the KDF, decrypts
      // every entry into cache, and rejects wrong passphrases.
      await W.vault.unlock(passphrase);
      return {
        ai: W.vault.getCached("ai", {}) || {},
        telegram: W.vault.getCached("telegram", {}) || {},
      };
    }
    // Legacy path.
    if (typeof passphrase !== "string" || !passphrase) {
      throw new Error("Passphrase is required");
    }
    const blob = W.store.get("encrypted_settings", null);
    if (!blob) throw new Error("No encrypted settings found");
    const data = await W.crypto.secure.decryptSettings(blob, passphrase);
    _passphrase = passphrase;
    _cache = data;
    return data;
  }

  async function save(sensitiveObj) {
    if (vaultPresent()) {
      if (!W.vault.isUnlocked()) {
        throw new Error("Unlock the vault first");
      }
      if (!sensitiveObj || typeof sensitiveObj !== "object") {
        throw new Error("save() requires a plain object");
      }
      if (sensitiveObj.ai !== undefined) {
        await W.vault.set("ai", sensitiveObj.ai);
      }
      if (sensitiveObj.telegram !== undefined) {
        await W.vault.set("telegram", sensitiveObj.telegram);
      }
      return;
    }
    if (!_passphrase) throw new Error("Session is locked");
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
    if (vaultPresent()) {
      // Vault mode: passphrase is the vault passphrase. Unlock then
      // write. If already unlocked, `unlock` is a no-op refresh.
      await W.vault.unlock(passphrase);
      if (sensitiveObj.ai !== undefined) {
        await W.vault.set("ai", sensitiveObj.ai);
      }
      if (sensitiveObj.telegram !== undefined) {
        await W.vault.set("telegram", sensitiveObj.telegram);
      }
      return;
    }
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
    if (vaultPresent()) {
      // Vault.lock() reloads the page; delegate for a single lock UX.
      W.vault.lock();
      return;
    }
    _passphrase = null;
    _cache = null;
  }

  function clear() {
    if (vaultPresent()) {
      // Vault mode: delete ai + telegram vault entries.
      try {
        W.vault.delete("ai");
      } catch (_) {}
      try {
        W.vault.delete("telegram");
      } catch (_) {}
      return;
    }
    W.store.delete("encrypted_settings");
    _passphrase = null;
    _cache = null;
  }

  function get(key) {
    if (vaultPresent()) {
      if (!W.vault.isUnlocked()) return null;
      return W.vault.getCached(key, null);
    }
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

console.log("[SecureSession] Module loaded (vault-aware).");
