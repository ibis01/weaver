const { JSDOM } = require("jsdom");
const { webcrypto } = require("crypto");

// ── DOM Environment ──────────────────────────────────────
const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});

global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.HTMLElement = dom.window.HTMLElement;
global.Element = dom.window.Element;
global.Node = dom.window.Node;
global.CSSStyleDeclaration = dom.window.CSSStyleDeclaration;

// ── Storage Mocks ────────────────────────────────────────
global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
};
global.sessionStorage = global.localStorage;

// ── Crypto Mocks ──────────────────────────────────────────
global.crypto = {
  getRandomValues: (arr) => {
    const rand = require("crypto").randomBytes(arr.length);
    for (let i = 0; i < arr.length; i++) arr[i] = rand[i];
    return arr;
  },
  subtle: webcrypto.subtle,
};

// ── Fetch Mock ────────────────────────────────────────────
global.fetch = async (url, options) => {
  return {
    ok: true,
    status: 200,
    json: async () => ({}),
    text: async () => "",
  };
};

// ── W Namespace ───────────────────────────────────────────
global.W = {};

W.fmt = {
  escapeHTML: (str) => {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  },
  money: (amount) => `$${amount}`,
  price: (price) => `$${price}`,
  pct: (val) => `${val.toFixed(2)}%`,
  maskAddress: (addr) => (addr ? addr.slice(0, 6) + "…" + addr.slice(-4) : ""),
};

W.store = {
  get: () => null,
  set: () => {},
  delete: () => {},
};

// ── Silence Console ──────────────────────────────────────
console.log = () => {};
console.warn = () => {};
console.error = () => {};
