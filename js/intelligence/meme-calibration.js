// ===============================================================
// Meme Alert Calibration
// Evaluates whether an alert had a durable, executable market outcome.
// This is measurement only; it never creates a trade signal.
// ===============================================================
window.W = window.W || {};
W.memeCalibration = (() => {
  const VERSION = "meme-calibration-v1";
  const finite = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  const clamp = (v, min = 0, max = 100) => Math.max(min, Math.min(max, v));

  function evaluate(alert, snapshots = [], options = {}) {
    const startPrice = finite(alert?.priceUsd);
    const startLiquidity = finite(alert?.liquidityUsd);
    const startAt = new Date(alert?.observedAt || 0).getTime();
    if (!(startPrice > 0) || !Number.isFinite(startAt)) {
      return {
        version: VERSION,
        valid: false,
        reason: "Missing alert price or timestamp",
      };
    }
    const rows = snapshots
      .map((s) => ({
        ...s,
        at: new Date(s?.observedAt || s?.timestamp || 0).getTime(),
        price: finite(s?.priceUsd),
        liquidity: finite(s?.liquidityUsd),
      }))
      .filter((s) => s.at > startAt && s.price !== null)
      .sort((a, b) => a.at - b.at);
    if (!rows.length)
      return {
        version: VERSION,
        valid: false,
        reason: "No future observations",
      };

    const returns = rows.map((s) => (s.price / startPrice - 1) * 100);
    const maxReturnPct = Math.max(...returns);
    const minReturnPct = Math.min(...returns);
    const liquidityRows = rows.filter((s) => s.liquidity !== null);
    const minLiquidityRatio =
      startLiquidity > 0 && liquidityRows.length
        ? Math.min(...liquidityRows.map((s) => s.liquidity / startLiquidity))
        : null;
    const horizonHours = Number(options.horizonHours || 24);
    const horizonMs = horizonHours * 36e5;
    const atHorizon =
      rows.find((s) => s.at - startAt >= horizonMs) || rows[rows.length - 1];
    const horizonReturnPct = (atHorizon.price / startPrice - 1) * 100;
    const liquidityMaintained =
      minLiquidityRatio === null || minLiquidityRatio >= 0.5;
    const executable =
      rows.every((s) => s.canSell !== false) && liquidityMaintained;
    const threshold = Number(options.successReturnPct ?? 20);
    const durable = horizonReturnPct >= threshold && executable;
    const outcome = durable
      ? "DURABLE_OPPORTUNITY"
      : executable
        ? "TRADABLE_BUT_UNCONFIRMED"
        : "EXECUTION_FAILURE_RISK";
    return {
      version: VERSION,
      valid: true,
      outcome,
      executable,
      durable,
      horizonHours,
      horizonReturnPct,
      maxReturnPct,
      maxDrawdownPct: Math.abs(Math.min(0, minReturnPct)),
      minLiquidityRatio,
      observationCount: rows.length,
    };
  }

  function summarize(evaluations = []) {
    const valid = evaluations.filter((e) => e && e.valid);
    const durable = valid.filter((e) => e.durable);
    const executable = valid.filter((e) => e.executable);
    const avg = (key) => {
      const values = valid.map((e) => finite(e[key])).filter((v) => v !== null);
      return values.length
        ? values.reduce((a, b) => a + b, 0) / values.length
        : null;
    };
    return {
      version: VERSION,
      evaluated: valid.length,
      durableRate: valid.length ? durable.length / valid.length : null,
      executableRate: valid.length ? executable.length / valid.length : null,
      averageHorizonReturnPct: avg("horizonReturnPct"),
      averageMaxDrawdownPct: avg("maxDrawdownPct"),
      calibrationScore: valid.length
        ? Math.round(clamp((durable.length / valid.length) * 100))
        : null,
    };
  }

  return { VERSION, evaluate, summarize };
})();
