// ===============================================================
//  Weaver Storage Layer
// ===============================================================

// Prevent if redeclaration errors

// CRITICAL: Initialize W namespace FIRST
window.W = window.W || {};

const StorageModule = (function () {
  const Storage = {
    /**
     * Generate a prefixed key
     * @param {string} key – The raw key
     * @returns {string} – Prefixed key
     */
    _key(key) {
      return `weaver:${key}`;
    },

    /**
     * Store a value in localStorage
     * @param {string} key – The key
     * @param {*} value – Any JSON-serializable value
     */
    set(key, value) {
      try {
        localStorage.setItem(this._key(key), JSON.stringify(value));
      } catch (e) {
        console.warn("[Storage] set error:", e.message);
        // Fallback: store in memory if localStorage fails
        if (!this._memory) this._memory = {};
        this._memory[key] = value;
      }
    },

    /**
     * Retrieve a value from localStorage
     * @param {string} key – The key
     * @param {*} fallback – Value to return if key not found
     * @returns {*} – Parsed JSON or fallback
     */
    get(key, fallback = null) {
      try {
        const raw = localStorage.getItem(this._key(key));
        if (raw === null) {
          // Check memory fallback
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

    /**
     * Delete a key from localStorage
     * @param {string} key – The key
     */
    delete(key) {
      try {
        localStorage.removeItem(this._key(key));
        if (this._memory) delete this._memory[key];
      } catch (e) {
        console.warn("[Storage] delete error:", e.message);
      }
    },

    // ── Secure Storage Methods ──────────────────────────────

    /**
     * Store sensitive settings with encryption
     * @param {Object} settings - The full settings object
     * @param {string} password - User's security password
     */
    async setSecureSettings(settings, password) {
      try {
        if (!W.crypto || !W.crypto.secure) {
          throw new Error("SecureCrypto module not loaded");
        }

        // Encrypt sensitive fields
        const encrypted = await W.crypto.secure.encryptSettings(
          settings,
          password,
        );

        // Store encrypted data
        const secureData = {
          encrypted: encrypted,
          timestamp: Date.now(),
        };

        localStorage.setItem(
          this._key("secure_settings"),
          JSON.stringify(secureData),
        );

        // Remove sensitive fields from regular settings
        const safeSettings = { ...settings };
        delete safeSettings.ai;
        delete safeSettings.telegram;

        // Store non-sensitive settings normally
        this.set("settings", safeSettings);

        console.log("[Storage] Secure settings saved");
      } catch (e) {
        console.error("[Storage] setSecureSettings error:", e.message);
        throw e;
      }
    },

    /**
     * Retrieve and decrypt sensitive settings
     * @param {string} password - User's security password
     * @returns {Object|null} - Decrypted sensitive settings or null
     */
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

    /**
     * Check if migration from plaintext to encrypted is needed
     * @returns {boolean}
     */
    needsMigration() {
      const settings = this.get("settings", {});
      return !!(settings.ai?.key || settings.telegram?.token);
    },

    /**
     * Migrate plaintext settings to encrypted storage
     * @param {string} password - User's security password
     * @returns {Promise<boolean>} - True if migration succeeded
     */
    async migrateToSecure(password) {
      try {
        const settings = this.get("settings", {});

        // Check if migration is needed
        if (!this.needsMigration()) {
          console.log("[Storage] No migration needed");
          return true;
        }

        console.log("[Storage] Starting migration to secure storage...");

        // Encrypt and save
        await this.setSecureSettings(settings, password);

        // Verify by attempting to read back
        const testRead = await this.getSecureSettings(password);
        if (!testRead) {
          throw new Error("Migration verification failed");
        }

        console.log("[Storage] Migration completed successfully");
        return true;
      } catch (e) {
        console.error("[Storage] Migration failed:", e.message);
        throw e;
      }
    },

    /**
     * Clear all secure settings (for logout/reset)
     */
    clearSecureSettings() {
      try {
        localStorage.removeItem(this._key("secure_settings"));
        console.log("[Storage] Secure settings cleared");
      } catch (e) {
        console.warn("[Storage] clearSecureSettings error:", e.message);
      }
    },

    /**
     * Check if secure settings exist
     * @returns {boolean}
     */
    hasSecureSettings() {
      const raw = localStorage.getItem(this._key("secure_settings"));
      return !!raw;
    },

    // ── Optional IndexedDB methods (for large data) ──
    // These are placeholders; you can implement them later
    // if you need to store large amounts of data.

    /**
     * Open an IndexedDB database (placeholder)
     * @param {string} dbName – Database name
     * @param {number} version – Database version
     * @returns {Promise<IDBDatabase>}
     */
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

    /**
     * Save to IndexedDB (placeholder)
     * @param {string} key – The key
     * @param {*} value – The value
     * @returns {Promise<void>}
     */
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

    /**
     * Load from IndexedDB (placeholder)
     * @param {string} key – The key
     * @returns {Promise<any>}
     */
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

// Only assign if not already assigned
if (!W.store) {
  W.store = StorageModule;
  console.log("[Storage] Module loaded.");
} else {
  console.log("[Storage] Module already loaded, skipping reassignment.");
}
