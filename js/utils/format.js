window.W = window.W || {};

W.SYMBOLS = {
  usd: "$",
  eur: "€",
  gbp: "£",
  inr: "₹",
  jpy: "¥",
  aud: "A$",
  cad: "C$",
};
W.PALETTE = [
  "#7c5cff",
  "#2ee6a8",
  "#ffb35c",
  "#ff5c7a",
  "#5cd6ff",
  "#c792ea",
  "#f78c6c",
  "#8bd450",
  "#ff8bd0",
  "#9aa3b2",
];

W.fmt = {
  money(n, o) {
    const compact = o && o.compact;
    if (n == null || isNaN(n)) return "—";
    const sym = W.SYMBOLS[W.currency()] || "$";
    const neg = n < 0 ? "-" : "",
      abs = Math.abs(n);
    if (compact || abs >= 1e9) return neg + sym + (abs / 1e9).toFixed(2) + "B";
    if (abs >= 1e6) return neg + sym + (abs / 1e6).toFixed(2) + "M";
    if (abs >= 1e5) return neg + sym + (abs / 1e3).toFixed(1) + "K";
    return (
      neg +
      sym +
      abs.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  },
  price(n) {
    if (n == null || isNaN(n)) return "—";
    const sym = W.SYMBOLS[W.currency()] || "$";
    if (n >= 1)
      return (
        sym +
        n.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      );
    return sym + n.toPrecision(4);
  },
  pct(n) {
    if (n == null || isNaN(n)) return '<span class="muted">—</span>';
    return (
      '<span class="' +
      (n >= 0 ? "up" : "down") +
      '">' +
      (n >= 0 ? "▲ " : "▼ ") +
      Math.abs(n).toFixed(2) +
      "%</span>"
    );
  },
  num(n) {
    return n == null || isNaN(n) ? "—" : n.toLocaleString();
  },
  addr(a) {
    return a ? a.slice(0, 6) + "…" + a.slice(-4) : "—";
  },
  date(t) {
    return t ? new Date(t).toLocaleDateString() : "—";
  },
};
