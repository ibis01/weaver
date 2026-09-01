// ===============================================================
//         Simple Logger – Unified Logging with Levels
// ===============================================================

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4,
};

const currentLevel = (() => {
  const env = localStorage.getItem("weaver_log_level") || "info";
  return LOG_LEVELS[env] || LOG_LEVELS.info;
})();

function log(level, module, message, data = null) {
  if (LOG_LEVELS[level] > currentLevel) return;
  const prefix = `[${new Date().toISOString()}] [${level.toUpperCase()}] [${module}]`;
  if (data) {
    console[level === "error" ? "error" : "log"](prefix, message, data);
  } else {
    console[level === "error" ? "error" : "log"](prefix, message);
  }
}

window.W = window.W || {};
W.logger = {
  error: (module, msg, data) => log("error", module, msg, data),
  warn: (module, msg, data) => log("warn", module, msg, data),
  info: (module, msg, data) => log("info", module, msg, data),
  debug: (module, msg, data) => log("debug", module, msg, data),
  trace: (module, msg, data) => log("trace", module, msg, data),
  setLevel: (level) => {
    if (LOG_LEVELS[level] !== undefined) {
      localStorage.setItem("weaver_log_level", level);
    }
  },
};

console.log("[Logger] Module loaded.");
