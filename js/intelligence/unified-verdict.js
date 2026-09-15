// ===============================================================
// Unified Verdict – provenance-preserving composition layer
// ===============================================================

window.W = window.W || {};

W.unifiedVerdict = (() => {
  const VERSIONS = Object.freeze({
    schema: "unified-verdict-v1",
    methodology: "methodology-v1",
    evidence: "evidence-gate-v1",
    scenario: "scenario-v1",
  });

  const VALID_STATUSES = new Set([
    "verified",
    "available",
    "partial",
    "unavailable",
    "stale",
    "failed",
    "unknown",
  ]);
  const normalizeDomain = (name, value) => {
    const input = typeof value === "string" ? { status: value } : value || {};
    const status = VALID_STATUSES.has(input.status) ? input.status : "unknown";
    const reasons = Array.isArray(input.reasons)
      ? input.reasons.slice(0, 5)
      : [];
    if (
      !reasons.length &&
      ["unavailable", "unknown", "stale", "failed", "partial"].includes(status)
    )
      reasons.push(`${name} evidence is ${status}.`);
    return {
      name,
      status,
      score: Number.isFinite(input.score)
        ? Math.max(0, Math.min(100, input.score))
        : null,
      source: input.source || null,
      asOf: input.asOf || null,
      reasons,
    };
  };

  function evidenceGate(domains) {
    const values = Object.values(domains);
    const reasons = values.flatMap((d) =>
      d.reasons.map((reason) => `${d.name}: ${reason}`),
    );
    const hardFailure = [
      domains.market,
      domains.technical,
      domains.security,
    ].some((d) => ["failed"].includes(d.status));
    const coreMissing = [domains.market, domains.technical].some((d) =>
      ["unavailable", "unknown"].includes(d.status),
    );
    const incomplete = values.some((d) =>
      ["partial", "unavailable", "stale", "unknown"].includes(d.status),
    );
    const status =
      hardFailure || coreMissing
        ? "INSUFFICIENT"
        : incomplete
          ? "PARTIAL"
          : "SUFFICIENT";
    const score =
      status === "SUFFICIENT"
        ? 100
        : status === "PARTIAL"
          ? Math.max(
              25,
              100 -
                values.filter((d) =>
                  ["partial", "unavailable", "stale", "unknown"].includes(
                    d.status,
                  ),
                ).length *
                  12,
            )
          : 0;
    return { status, score, reasons };
  }

  function compose(input = {}) {
    const raw = input.domains || {};
    const domains = {
      market: normalizeDomain(
        "Market",
        raw.market || {
          status: input.technical ? "available" : "unavailable",
          source: "market-api",
        },
      ),
      technical: normalizeDomain(
        "Technical",
        raw.technical || {
          status: input.technical ? "available" : "unavailable",
          source: "ohlcv",
        },
      ),
      security: normalizeDomain(
        "Security",
        raw.security || {
          status: "unavailable",
          reasons: ["Security verification was not supplied."],
        },
      ),
      holders: normalizeDomain(
        "Holders",
        raw.holders || {
          status: "unavailable",
          reasons: ["Holder analysis was not supplied."],
        },
      ),
      liquidity: normalizeDomain(
        "Liquidity",
        raw.liquidity || {
          status: input.technical?.multiTimeframe?.liquidityZones?.length
            ? "available"
            : "partial",
          source: "ohlcv-heuristic",
          reasons: ["Liquidity zones are heuristic OHLCV levels."],
        },
      ),
      freshness: normalizeDomain(
        "Freshness",
        raw.freshness || {
          status: "unknown",
          reasons: ["Freshness metadata was not supplied."],
        },
      ),
    };
    const evidence = evidenceGate(domains);
    return {
      schemaVersion: VERSIONS.schema,
      scoreVersion: input.scoreVersion || "token-analysis-v1",
      methodologyVersion: VERSIONS.methodology,
      evidenceVersion: VERSIONS.evidence,
      scenarioVersion: VERSIONS.scenario,
      generatedAt: input.generatedAt || new Date().toISOString(),
      asset: input.asset || null,
      opportunity: {
        score: Number.isFinite(input.opportunityScore)
          ? input.opportunityScore
          : null,
        label: input.opportunityLabel || null,
      },
      risk: {
        score: Number.isFinite(input.riskScore) ? input.riskScore : null,
        label: input.riskLabel || null,
      },
      evidence,
      domains,
      scenario: {
        label: input.scenario || "Neutral / insufficient evidence",
        action: input.action || "HOLD",
        levels: input.tradeLevels || null,
      },
      provenance: Array.isArray(input.provenance)
        ? input.provenance.slice(0, 30)
        : [],
    };
  }

  return { VERSIONS, compose, evidenceGate, normalizeDomain };
})();

console.log("[UnifiedVerdict] Versioned composition layer loaded.");
