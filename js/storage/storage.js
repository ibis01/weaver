// ===============================================================
//  Weaver Storage Layer
// ===============================================================

// CRITICAL: Initialize W namespace FIRST
window.W = window.W || {};

const StorageModule = (function () {
  const Storage = {
    _key(key) {
      return `weaver:${key}`;
    },

    set(key, value) {
      try {
        localStorage.setItem(this._key(key), JSON.stringify(value));
      } catch (e) {
        console.warn("[Storage] set error:", e.message);
        if (!this._memory) this._memory = {};
        this._memory[key] = value;
      }
    },

    get(key, fallback = null) {
      try {
        const raw = localStorage.getItem(this._key(key));
        if (raw === null) {
          if (this._memory && key in this._memory) {
            return this._memory[key];
          }
          return fallback;
        }
        return JSON.parse(raw);
      } catch (e) {
        console.warn("[Storage] get error:", e.message);
        return fallback;
      }
    },

    delete(key) {
      try {
        localStorage.removeItem(this._key(key));
        if (this._memory) delete this._memory[key];
      } catch (e) {
        console.warn("[Storage] delete error:", e.message);
      }
    },

    // ── Secure Storage Methods ──────────────────────────────
    async setSecureSettings(settings, password) {
      try {
        if (!W.crypto || !W.crypto.secure) {
          throw new Error("SecureCrypto module not loaded");
        }
        const encrypted = await W.crypto.secure.encryptSettings(
          settings,
          password,
        );
        const secureData = {
          encrypted: encrypted,
          timestamp: Date.now(),
        };
        localStorage.setItem(
          this._key("secure_settings"),
          JSON.stringify(secureData),
        );
        const safeSettings = { ...settings };
        delete safeSettings.ai;
        delete safeSettings.telegram;
        this.set("settings", safeSettings);
        console.log("[Storage] Secure settings saved");
      } catch (e) {
        console.error("[Storage] setSecureSettings error:", e.message);
        throw e;
      }
    },

    async getSecureSettings(password) {
      try {
        const raw = localStorage.getItem(this._key("secure_settings"));
        if (!raw) return null;
        const secureData = JSON.parse(raw);
        if (!secureData.encrypted) return null;
        const sensitiveData = await W.crypto.secure.decryptSettings(
          secureData.encrypted,
          password,
        );
        return sensitiveData;
      } catch (e) {
        console.warn("[Storage] getSecureSettings error:", e.message);
        return null;
      }
    },

    needsMigration() {
      const settings = this.get("settings", {});
      return !!(settings.ai?.key || settings.telegram?.token);
    },

    async migrateToSecure(password) {
      try {
        const settings = this.get("settings", {});
        if (!this.needsMigration()) {
          console.log("[Storage] No migration needed");
          return true;
        }
        console.log("[Storage] Starting migration to secure storage...");
        await this.setSecureSettings(settings, password);
        const testRead = await this.getSecureSettings(password);
        if (!testRead) throw new Error("Migration verification failed");
        console.log("[Storage] Migration completed successfully");
        return true;
      } catch (e) {
        console.error("[Storage] Migration failed:", e.message);
        throw e;
      }
    },

    clearSecureSettings() {
      try {
        localStorage.removeItem(this._key("secure_settings"));
        console.log("[Storage] Secure settings cleared");
      } catch (e) {
        console.warn("[Storage] clearSecureSettings error:", e.message);
      }
    },

    hasSecureSettings() {
      const raw = localStorage.getItem(this._key("secure_settings"));
      return !!raw;
    },

    // ── IndexedDB placeholders ──────────────────────────────
    async openIndexedDB(dbName = "WeaverDB", version = 1) {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, version);
        request.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains("store")) {
            db.createObjectStore("store", { keyPath: "key" });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    },

    async saveToIndexedDB(key, value) {
      try {
        const db = await this.openIndexedDB();
        const tx = db.transaction("store", "readwrite");
        const store = tx.objectStore("store");
        store.put({ key, value });
        return new Promise((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } catch (e) {
        console.warn("[Storage] IndexedDB save error:", e.message);
      }
    },

    async loadFromIndexedDB(key) {
      try {
        const db = await this.openIndexedDB();
        const tx = db.transaction("store", "readonly");
        const store = tx.objectStore("store");
        const request = store.get(key);
        return new Promise((resolve, reject) => {
          request.onsuccess = () => resolve(request.result?.value);
          request.onerror = () => reject(request.error);
        });
      } catch (e) {
        console.warn("[Storage] IndexedDB load error:", e.message);
        return null;
      }
    },
  };

  return Storage;
})();

// ── ALWAYS assign the proper storage module ──────────────────
W.store = StorageModule;
console.log("[Storage] Module loaded.");
