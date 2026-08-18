//  Debounce Utility

window.W = window.W || {};

/**
 * Debounce a function – limits how often it can be called.
 *
 * @param {Function} fn - The function to debounce
 * @param {number} ms - Delay in milliseconds (default: 300)
 * @param {boolean} immediate - If true, call on leading edge instead of trailing
 * @returns {Function} Debounced function
 *
 * @example
 * const search = W.debounce(async (query) => {
 *   const results = await api.search(query);
 *   render(results);
 * }, 350);
 *
 * input.addEventListener('input', (e) => search(e.target.value));
 */
W.debounce = function (fn, ms = 300, immediate = false) {
  // Validate inputs
  if (typeof fn !== "function") {
    console.warn("[Debounce] Expected a function, got", typeof fn);
    return () => {};
  }
  if (typeof ms !== "number" || ms < 0) {
    console.warn("[Debounce] Invalid delay, using 300ms");
    ms = 300;
  }

  let timer = null;
  let lastCall = 0;

  return function (...args) {
    const context = this;
    const now = Date.now();

    // If immediate and timer is not set, call immediately
    if (immediate && timer === null) {
      fn.apply(context, args);
      timer = setTimeout(() => {
        timer = null;
      }, ms);
      return;
    }

    // Clear the previous timer
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }

    // Set a new timer
    timer = setTimeout(() => {
      timer = null;
      // Only call if enough time has passed (for trailing edge)
      if (!immediate || now - lastCall >= ms) {
        fn.apply(context, args);
        lastCall = now;
      }
    }, ms);
  };
};

/**
 * Throttle a function – ensures it's called at most once per interval.
 *
 * @param {Function} fn - The function to throttle
 * @param {number} ms - Minimum time between calls (default: 300)
 * @returns {Function} Throttled function
 *
 * @example
 * const update = W.throttle(() => renderChart(), 1000);
 * window.addEventListener('resize', update);
 */
W.throttle = function (fn, ms = 300) {
  if (typeof fn !== "function") {
    console.warn("[Throttle] Expected a function, got", typeof fn);
    return () => {};
  }

  let timer = null;
  let lastCall = 0;

  return function (...args) {
    const context = this;
    const now = Date.now();

    if (timer !== null) {
      // Already scheduled
      return;
    }

    const remaining = ms - (now - lastCall);
    if (remaining <= 0) {
      // Enough time has passed – call immediately
      fn.apply(context, args);
      lastCall = now;
    } else {
      // Schedule for later
      timer = setTimeout(() => {
        timer = null;
        lastCall = Date.now();
        fn.apply(context, args);
      }, remaining);
    }
  };
};

/**
 * Leading-edge throttle – calls immediately, then ignores subsequent calls
 * until the interval has passed.
 *
 * @param {Function} fn - The function to throttle
 * @param {number} ms - Minimum time between calls (default: 300)
 * @returns {Function} Throttled function (leading edge)
 */
W.throttleLeading = function (fn, ms = 300) {
  if (typeof fn !== "function") {
    console.warn("[ThrottleLeading] Expected a function, got", typeof fn);
    return () => {};
  }

  let lastCall = 0;

  return function (...args) {
    const context = this;
    const now = Date.now();

    if (now - lastCall >= ms) {
      lastCall = now;
      fn.apply(context, args);
    }
  };
};

console.log("[Utils] Debounce module loaded.");
