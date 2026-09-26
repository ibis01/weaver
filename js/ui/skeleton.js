// ===============================================================
//     Weaver Skeleton Loading States
//     Constitution §3.4: Graceful Degradation
//     Constitution §5.3: Calm Visual Language (no spinners)
// ===============================================================
// CSP-safe: no inline styles. All sizing via CSS classes.
// Respects prefers-reduced-motion via existing CSS media query.
// ===============================================================

window.W = window.W || {};
W.ui = W.ui || {};

W.ui.skeleton = (() => {
  function block(className) {
    return '<div class="skeleton ' + W.fmt.escapeHTML(className) + '"></div>';
  }

  function card() {
    return '<div class="skeleton skeleton-card"></div>';
  }

  function stat() {
    return '<div class="skeleton skeleton-stat"></div>';
  }

  function stats(count) {
    var html = "";
    for (var i = 0; i < count; i++) html += stat();
    return html;
  }

  function row() {
    return '<div class="skeleton skeleton-row"></div>';
  }

  function table(rows) {
    var html = "";
    for (var i = 0; i < rows; i++) html += row();
    return html;
  }

  function chart() {
    return '<div class="skeleton skeleton-chart"></div>';
  }

  function feedItem() {
    return '<div class="skeleton skeleton-feed-item"></div>';
  }

  function feed(items) {
    var html = "";
    for (var i = 0; i < items; i++) html += feedItem();
    return html;
  }

  return {
    block: block,
    card: card,
    stat: stat,
    stats: stats,
    row: row,
    table: table,
    chart: chart,
    feedItem: feedItem,
    feed: feed,
  };
})();

console.log("[Skeleton] Module loaded.");
