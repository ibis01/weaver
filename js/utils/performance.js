// ===============================================================
//         Virtual Scrolling for Large Lists
// ===============================================================

window.W = window.W || {};
W.perf = W.perf || {};

/**
 * Virtual scroll for large lists (e.g., holdings, top coins).
 * @param {HTMLElement} container - The scroll container.
 * @param {number} itemHeight - Height of each item in pixels.
 * @param {Array} data - The list of items.
 * @param {Function} renderFn - Function to render a single item.
 */
function virtualScroll(container, itemHeight, data, renderFn) {
  const scrollTop = container.scrollTop;
  const visibleHeight = container.clientHeight;
  const totalHeight = data.length * itemHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - 2);
  const endIndex = Math.min(
    data.length,
    Math.ceil((scrollTop + visibleHeight) / itemHeight) + 2,
  );

  const fragment = document.createDocumentFragment();
  for (let i = startIndex; i < endIndex; i++) {
    const item = data[i];
    const el = renderFn(item, i);
    el.style.position = "absolute";
    el.style.top = `${i * itemHeight}px`;
    el.style.height = `${itemHeight}px`;
    el.style.left = "0";
    el.style.right = "0";
    fragment.appendChild(el);
  }

  container.innerHTML = "";
  container.style.height = `${totalHeight}px`;
  container.style.position = "relative";
  container.appendChild(fragment);
}

W.perf.virtualScroll = virtualScroll;

console.log("[Performance] Virtual scroll module loaded.");
