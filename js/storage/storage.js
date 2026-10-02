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

    // Note: the legacy secure_settings store and its migration
    // helpers were removed — sensitive data now lives in the
    // "encrypted_settings" blob owned by W.secureSession. See
    // js/lib/crypto/secure-session.js.

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
