// ================================================================
// js/storage/storage.js – Weaver Storage Layer
// ================================================================

window.W = window.W || {};

/**
 * Storage module – localStorage wrapper with fallback.
 * All keys are prefixed with 'weaver:' to avoid collisions.
 */
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

  /**
   * Alias for delete (some modules use 'del')
   */
  del(key) {
    this.delete(key);
  },

  /**
   * Clear all Weaver-prefixed keys from localStorage
   */
  clearAll() {
    try {
      const keys = Object.keys(localStorage);
      keys
        .filter((k) => k.startsWith("weaver:"))
        .forEach((k) => localStorage.removeItem(k));
      if (this._memory) this._memory = {};
    } catch (e) {
      console.warn("[Storage] clearAll error:", e.message);
    }
  },

  /**
   * Clear all keys (alias for clearAll)
   */
  clear() {
    this.clearAll();
  },

  /**
   * Get all keys with the 'weaver:' prefix
   * @returns {string[]} – Array of unprefixed keys
   */
  keys() {
    try {
      return Object.keys(localStorage)
        .filter((k) => k.startsWith("weaver:"))
        .map((k) => k.replace("weaver:", ""));
    } catch (e) {
      return [];
    }
  },

  /**
   * Get all stored data as an object
   * @returns {Object} – All key-value pairs
   */
  getAll() {
    const result = {};
    this.keys().forEach((k) => {
      result[k] = this.get(k);
    });
    return result;
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

// ── Expose to global W ──────────────────────────────
W.store = Storage;

console.log("[Storage] Module loaded.");
