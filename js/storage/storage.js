window.W = window.W || {};
W.store = {
  k: (key) => "weaver:" + key,
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(this.k(key));
      return v === null ? fallback : JSON.parse(v);
    } catch (e) {
      return fallback;
    }
  },
  set(key, val) {
    localStorage.setItem(this.k(key), JSON.stringify(val));
  },
  del(key) {
    localStorage.removeItem(this.k(key));
  },
  clearAll() {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("weaver:"))
      .forEach((k) => localStorage.removeItem(k));
  },
};
