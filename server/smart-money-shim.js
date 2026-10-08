const { randomUUID } = require("crypto");

function installShim(store) {
  global.window = global;
  global.localStorage = {
    _data: new Map(),
    getItem(k) { return this._data.has(k) ? this._data.get(k) : null; },
    setItem(k, v) { this._data.set(k, String(v)); },
    removeItem(k) { this._data.delete(k); },
    clear() { this._data.clear(); },
    get length() { return this._data.size; },
  };
  global.crypto = global.crypto || { randomUUID };
  if (!global.crypto.randomUUID) global.crypto.randomUUID = randomUUID;

  // Router-safe location. All reads return harmless empty values so
  // the bundle's top-level [App] router does not crash under Node.
  const safeLocation = {
    hash: "",
    href: "http://localhost/",
    pathname: "/",
    search: "",
    origin: "http://localhost",
    protocol: "http:",
    host: "localhost",
    hostname: "localhost",
    port: "",
    assign() {},
    replace() {},
    reload() {},
    toString() { return this.href; },
  };
  global.location = safeLocation;
  global.window.location = safeLocation;

  // No-op listeners — the bundle installs handlers we don't need in Node.
  global.addEventListener = () => {};
  global.removeEventListener = () => {};
  global.window.addEventListener = () => {};
  global.window.removeEventListener = () => {};

  // History stub — some modules read it during init.
  global.history = {
    pushState() {},
    replaceState() {},
    back() {},
    forward() {},
    go() {},
    state: null,
    length: 0,
  };
  global.window.history = global.history;

  const noopEl = () => ({
    style: {},
    classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
    appendChild() {},
    removeChild() {},
    insertBefore() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {},
    setAttribute() {},
    removeAttribute() {},
    getAttribute: () => null,
    hasAttribute: () => false,
    innerHTML: "",
    textContent: "",
    dataset: {},
    children: [],
    childNodes: [],
    parentNode: null,
    cloneNode() { return noopEl(); },
    remove() {},
    focus() {},
    blur() {},
    click() {},
  });

  global.document = {
    createElement: noopEl,
    createElementNS: noopEl,
    createTextNode: () => ({ textContent: "" }),
    createDocumentFragment: noopEl,
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    getElementsByClassName: () => [],
    getElementsByTagName: () => [],
    addEventListener() {},
    removeEventListener() {},
    body: noopEl(),
    head: noopEl(),
    documentElement: noopEl(),
    readyState: "complete",
    visibilityState: "visible",
    hidden: false,
    cookie: "",
    title: "Weaver",
  };

  global.W = {
    store: {
      get: (k, fb) => store.get(k, fb),
      set: (k, v) => store.set(k, v),
      delete: (k) => store.delete(k),
    },
    schemas: {
      validate: () => {},
      SchemaValidationError: class extends Error {},
    },
    dataHealth: { mark() {}, get: () => ({ state: "unknown" }), all: () => [], isStale: () => false },
    requestGuard: {
      fetch: (url, init) => fetch(url, init),
      reset() {},
      before() {},
      success() {},
      failure() {},
    },
    fmt: {
      escapeHTML: (s) => String(s == null ? "" : s),
      money: (n) => String(n),
    },
    config: {},
    ui: {
      modal: () => null,
      skeleton: {},
      evidenceDrawer: { open: () => null },
    },
  };
  return global.W;
}

module.exports = { installShim };
