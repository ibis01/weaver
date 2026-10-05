// ===============================================================
//         Weaver Evidence Drawer 
// ===============================================================


window.W = window.W || {};
W.ui = W.ui || {};

W.ui.evidenceDrawer = (() => {
  const MODULE_VERSION = "evidence-drawer-v2";

  // ── Caps ────────────────────────────────────────────────────
  // Chosen so a single drawer open cannot allocate more than a few
  // hundred KB of DOM. A legitimate evidence drawer stays well
  // under these.
  const MAX_ITEMS_PER_BUCKET = 200;
  const MAX_REASONS_PER_ITEM = 30;
  const MAX_TITLE_LEN = 200;
  const MAX_DETAIL_LEN = 2000;
  const MAX_REASON_LEN = 500;
  const MAX_META_LEN = 200;
  const MAX_DOMAINS = 500;

  // ── Escaping ───────────────────────────────────────────────
  // Safe in both text and quoted-attribute contexts. Handles
  // Symbol, BigInt, null, undefined, and objects whose toString
  // throws. Prefers W.fmt.escapeHTML when it exists and behaves
  // like a string escaper; otherwise falls back to the local
  // implementation.
  function localEsc(v) {
    if (v === null || v === undefined) return "";
    let s;
    try {
      s = String(v);
    } catch {
      // Symbol, BigInt wrappers with a broken toString, proxies
      // that trap access — return an empty string rather than
      // letting the render crash.
      return "";
    }
    if (!/[&<>"']/.test(s)) return s;
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  const esc =
    W.fmt && typeof W.fmt.escapeHTML === "function"
      ? function (v) {
          // Prefer the canonical escaper, but fall back to localEsc
          // if it throws. A hostile value should not be able to
          // disable escaping by triggering a throw inside the
          // shared helper.
          try {
            return String(W.fmt.escapeHTML(String(v ?? "")));
          } catch {
            return localEsc(v);
          }
        }
      : localEsc;

  // Safe property access. A getter that throws, a Proxy that traps
  // `get`, or a missing property all produce undefined rather than
  // an uncaught exception.
  function safeProp(obj, key) {
    if (!obj || typeof obj !== "object") return undefined;
    try {
      return obj[key];
    } catch {
      return undefined;
    }
  }

  // String coercion with a length cap. Applied before any HTML
  // wrapping, so the cap counts the visible characters, not the
  // escaped entities.
  function capStr(v, max) {
    if (v === null || v === undefined) return "";
    let s;
    try {
      s = String(v);
    } catch {
      return "";
    }
    if (s.length > max) return s.slice(0, max) + "…";
    return s;
  }

  // ── Relationship normalisation ─────────────────────────────
  const RELATIONSHIP_VALUES = Object.freeze({
    supporting: "supporting",
    contradicting: "contradicting",
    neutral: "neutral",
    unknown: "unknown",
  });

  function normalizeRelationship(value) {
    if (typeof value !== "string") return "unknown";
    const v = value.trim().toLowerCase();
    return RELATIONSHIP_VALUES[v] || "unknown";
  }

  // Prototype-pollution guard. A hostile domain name of
  // "__proto__" or "constructor" is dropped at ingest.
  const RESERVED_KEYS = new Set(["__proto__", "constructor", "prototype"]);
  function isReservedKey(k) {
    return RESERVED_KEYS.has(k);
  }

  // ── Bucketing ───────────────────────────────────────────────
  // Relationship drives the bucket. Status is preserved on the item
  // for display but does not determine where the item appears.
  //
  // "neutral" is explicitly mapped to Unknowns — the drawer has
  // three sections and neutral evidence is neither for nor against
  // the thesis.
  //
  // Item count is capped at MAX_ITEMS_PER_BUCKET. Overflow is
  // reported as a single note in the bucket rather than being
  // silently dropped.
  function bucket(domains) {
    const out = { supporting: [], contradicting: [], unknowns: [] };
    if (!domains || typeof domains !== "object" || Array.isArray(domains)) {
      return out;
    }

    let inspected = 0;
    const keys = (() => {
      try {
        return Object.keys(domains);
      } catch {
        return [];
      }
    })();

    for (const name of keys) {
      if (inspected++ >= MAX_DOMAINS) break;
      if (isReservedKey(name)) continue;

      const d = safeProp(domains, name);
      if (!d || typeof d !== "object") {
        // A non-object domain value is recorded as unknown rather
        // than dropped — the reader sees that something existed
        // there but could not be interpreted.
        out.unknowns.push({
          name: capStr(name, MAX_TITLE_LEN),
          status: "unknown",
          source: undefined,
          observedAt: undefined,
          freshness: undefined,
          methodologyVersion: undefined,
          relationship: "unknown",
          reliability: undefined,
          reasons: [],
        });
        continue;
      }

      const relationship = normalizeRelationship(safeProp(d, "relationship"));
      const rawReasons = safeProp(d, "reasons");
      const reasons = Array.isArray(rawReasons)
        ? rawReasons
            .slice(0, MAX_REASONS_PER_ITEM)
            .map((r) => capStr(r, MAX_REASON_LEN))
            .filter(Boolean)
        : [];

      const e = {
        name: capStr(name, MAX_TITLE_LEN),
        status: capStr(safeProp(d, "status") || "unknown", MAX_META_LEN),
        source: capStr(safeProp(d, "source"), MAX_META_LEN) || undefined,
        observedAt: safeProp(d, "observedAt") || safeProp(d, "asOf"),
        freshness: safeProp(d, "freshness"),
        methodologyVersion:
          capStr(safeProp(d, "methodologyVersion"), MAX_META_LEN) || undefined,
        relationship,
        reliability: safeProp(d, "reliability"),
        reasons,
      };

      if (relationship === "supporting") out.supporting.push(e);
      else if (relationship === "contradicting") out.contradicting.push(e);
      else {
        // Unknowns must not carry the engine's eligibility string
        // ("ELIGIBLE"/"available"). That value describes an internal
        // gate, not the reader's evidence state.
        e.status = "unassessed";
        out.unknowns.push(e);
      }
    }

    // Enforce the per-bucket cap after sorting. Overflow produces a
    // synthetic note rather than dropping the excess silently.
    for (const k of Object.keys(out)) {
      if (out[k].length > MAX_ITEMS_PER_BUCKET) {
        const overflow = out[k].length - MAX_ITEMS_PER_BUCKET;
        out[k] = out[k].slice(0, MAX_ITEMS_PER_BUCKET);
        out[k].push({
          name: `+${overflow} more not shown`,
          status: "overflow",
          relationship: "unknown",
          reasons: [],
        });
      }
    }

    return out;
  }

  // ── Provenance rendering ────────────────────────────────────
  // Every field renders. Missing values become the literal string
  // "unknown" — they are never omitted, because an omitted field
  // reads as "not applicable" rather than "not known".
  function formatProvenanceField(label, rawValue) {
    const v =
      rawValue === null || rawValue === undefined || rawValue === ""
        ? "unknown"
        : capStr(rawValue, MAX_META_LEN);
    return label + ": " + v;
  }

  function formatPercent(value) {
    return Number.isFinite(value) ? Math.round(value * 100) + "%" : null;
  }

  function formatDate(value) {
    if (!value) return null;
    // Guard the type check before constructing a Date. Symbol and
    // BigInt cannot be passed to new Date() without throwing.
    if (typeof value !== "string" && typeof value !== "number") return null;
    try {
      const d = new Date(value);
      if (!Number.isFinite(d.getTime())) return null;
      return d.toLocaleString();
    } catch (_) {
      return null;
    }
  }

  function renderProvenance(it) {
    const fields = [
      formatProvenanceField("Source", it.source),
      formatProvenanceField("Observed", formatDate(it.observedAt)),
      formatProvenanceField("Freshness", formatPercent(it.freshness)),
      formatProvenanceField("Methodology", it.methodologyVersion),
      formatProvenanceField("Relationship", it.relationship),
      formatProvenanceField("Reliability", formatPercent(it.reliability)),
    ];
    return '<p class="muted text-2xs mt-4">' + esc(fields.join(" · ")) + "</p>";
  }

  function renderItems(items, empty) {
    if (!Array.isArray(items) || !items.length) {
      return '<p class="muted small">' + esc(empty) + "</p>";
    }
    return (
      '<ul class="tx-list">' +
      items
        .map((it) => {
          if (!it || typeof it !== "object") return "";
          const title = capStr(
            it.title || it.name || "Evidence",
            MAX_TITLE_LEN,
          );
          // "unassessed" is the unknowns-bucket sentinel set by
          // bucket(). Rendering it is noise — the item's presence
          // in Unknowns already communicates the same thing, and
          // the raw engine status ("ELIGIBLE") leaked through the
          // meta span without a separator as "signalELIGIBLE".
          const rawStatus = String(it.status || "");
          const meta =
            rawStatus === "unassessed" ? "" : capStr(rawStatus, MAX_META_LEN);
          const detail = capStr(it.detail || it.evidence || "", MAX_DETAIL_LEN);
          const reasons = (Array.isArray(it.reasons) ? it.reasons : [])
            .slice(0, MAX_REASONS_PER_ITEM)
            .map(
              (r) =>
                '<p class="muted small mt-4">• ' +
                esc(capStr(r, MAX_REASON_LEN)) +
                "</p>",
            )
            .join("");
          return (
            '<li><div class="flex-between"><b>' +
            esc(title) +
            '</b><span class="muted small">' +
            esc(meta) +
            "</span></div>" +
            renderProvenance(it) +
            (detail
              ? '<p class="muted small mt-4">' + esc(detail) + "</p>"
              : "") +
            reasons +
            "</li>"
          );
        })
        .join("") +
      "</ul>"
    );
  }

  // Carry provenance fields from a source evidence object onto the
  // drawer item, so renderItems() has all six fields regardless of
  // which layer produced the item.
  //
  // relationship is NOT defaulted to "supporting" here — a caller
  // that produced bullish evidence has already declared that
  // relationship upstream, and this carry function preserves it.
  //
  // Reads go through safeProp; a source with a throwing getter
  // yields undefined rather than crashing.
  function carryProvenance(item, source) {
    const s = source && typeof source === "object" ? source : {};
    const i = item && typeof item === "object" ? item : {};
    const pick = (key) => {
      const iv = safeProp(i, key);
      if (iv !== undefined) return iv;
      return safeProp(s, key);
    };
    return {
      title: capStr(pick("title") || pick("name") || "Evidence", MAX_TITLE_LEN),
      detail: capStr(pick("detail") || pick("evidence") || "", MAX_DETAIL_LEN),
      source: capStr(pick("source"), MAX_META_LEN) || undefined,
      observedAt: pick("observedAt") || pick("timestamp") || undefined,
      freshness: pick("freshness"),
      methodologyVersion:
        capStr(pick("methodologyVersion"), MAX_META_LEN) || undefined,
      relationship: normalizeRelationship(pick("relationship")),
      reliability: pick("reliability"),
      reasons: (Array.isArray(pick("reasons")) ? pick("reasons") : [])
        .slice(0, MAX_REASONS_PER_ITEM)
        .map((r) => capStr(r, MAX_REASON_LEN))
        .filter(Boolean),
      status: capStr(pick("status"), MAX_META_LEN) || undefined,
    };
  }

  // ── Optional lines ─────────────────────────────────────────
  // Each renderer returns "" when no summary is supplied, so the
  // caller can concatenate the result unconditionally.

  function renderTrajectoryLine(summary) {
    if (typeof summary !== "string" || !summary.trim()) return "";
    return (
      '<p class="small"><b>Trajectory:</b> ' +
      esc(capStr(summary, MAX_DETAIL_LEN)) +
      "</p>"
    );
  }

  function renderOwnerLine(summary) {
    if (typeof summary !== "string" || !summary.trim()) return "";
    return (
      '<p class="small"><b>Owner:</b> ' +
      esc(capStr(summary, MAX_DETAIL_LEN)) +
      "</p>"
    );
  }

  function renderDeployerLine(summary) {
    if (typeof summary !== "string" || !summary.trim()) return "";
    return (
      '<p class="small"><b>Deployer:</b> ' +
      esc(capStr(summary, MAX_DETAIL_LEN)) +
      "</p>"
    );
  }

  function renderTrackRecordLine(summary) {
    if (typeof summary !== "string" || !summary.trim()) return "";
    return (
      '<p class="small"><b>Your Track Record:</b> ' +
      esc(capStr(summary, MAX_DETAIL_LEN)) +
      "</p>"
    );
  }

  // ── Top-level open ─────────────────────────────────────────
  function open(result) {
    const r = result && typeof result === "object" ? result : {};

    let b;
    try {
      b = bucket(safeProp(r, "domains"));
    } catch (e) {
      console.warn("[EvidenceDrawer] bucket failed:", e && e.message);
      b = { supporting: [], contradicting: [], unknowns: [] };
    }

    const readSummary = (key) => {
      const v = safeProp(r, key);
      return typeof v === "string" && v.trim()
        ? capStr(v, MAX_DETAIL_LEN)
        : null;
    };

    const trajectorySummary = readSummary("trajectorySummary");
    const ownerSummary = readSummary("ownerSummary");
    const deployerSummary = readSummary("deployerSummary");
    const trackRecordSummary = readSummary("trackRecordSummary");

    // Build each bucket with a try/catch per map step so one
    // malformed entry cannot blank the entire section.
    const safeArrayMap = (raw, mapper) => {
      if (!Array.isArray(raw)) return [];
      const out = [];
      for (const item of raw.slice(0, MAX_ITEMS_PER_BUCKET)) {
        try {
          out.push(mapper(item));
        } catch (e) {
          console.warn("[EvidenceDrawer] item map failed:", e && e.message);
        }
      }
      return out;
    };

    const supporting = [
      ...safeArrayMap(safeProp(r, "bullishEvidence"), (e) =>
        carryProvenance(
          {
            title: safeProp(e, "title"),
            detail: safeProp(e, "evidence"),
            status: "supporting",
            relationship: "supporting",
          },
          e,
        ),
      ),
      ...b.supporting,
    ];

    const contradicting = [
      ...safeArrayMap(safeProp(r, "bearishEvidence"), (e) =>
        carryProvenance(
          {
            title: safeProp(e, "title"),
            detail: safeProp(e, "evidence"),
            status: "contradicting",
            relationship: "contradicting",
          },
          e,
        ),
      ),
      ...safeArrayMap(safeProp(r, "contradictions"), (c) => {
        const bull = capStr(safeProp(c, "bull"), MAX_TITLE_LEN);
        const bear = capStr(safeProp(c, "bear"), MAX_TITLE_LEN);
        return carryProvenance({
          title: bull + " vs " + bear,
          detail: safeProp(c, "details"),
          status: "contradicting",
          relationship: "contradicting",
        });
      }),
      ...b.contradicting,
    ];

    const eqReasons = (() => {
      const eq = safeProp(r, "evidenceQuality");
      const reasons = safeProp(eq, "reasons");
      return Array.isArray(reasons) ? reasons : [];
    })();

    const unknowns = [
      ...b.unknowns,
      ...safeArrayMap(eqReasons, (x) =>
        carryProvenance({
          title: "Evidence gap",
          detail: x,
          relationship: "unknown",
        }),
      ),
    ];

    const meta = [
      safeProp(r, "methodologyVersion")
        ? "Methodology " +
          capStr(safeProp(r, "methodologyVersion"), MAX_META_LEN)
        : null,
      safeProp(r, "evidenceVersion")
        ? "Evidence " + capStr(safeProp(r, "evidenceVersion"), MAX_META_LEN)
        : null,
    ]
      .filter(Boolean)
      .join(" · ");

    const explanation = capStr(
      safeProp(r, "explanation") || "Evidence behind the current scenario.",
      MAX_DETAIL_LEN,
    );

    const body =
      '<p class="small muted">' +
      esc(explanation) +
      "</p>" +
      (meta ? '<p class="small muted">' + esc(meta) + "</p>" : "") +
      renderTrajectoryLine(trajectorySummary) +
      renderOwnerLine(ownerSummary) +
      renderDeployerLine(deployerSummary) +
      renderTrackRecordLine(trackRecordSummary) +
      '<div class="mt-12">' +
      "<h4>🟢 Supporting evidence</h4>" +
      renderItems(supporting, "None recorded.") +
      "<h4>🔴 Contradicting evidence</h4>" +
      renderItems(contradicting, "None recorded.") +
      "<h4>❓ Unknowns</h4>" +
      renderItems(unknowns, "No evidence gaps recorded.") +
      "</div>";

    // The modal call is wrapped. If W.ui.modal is missing or throws,
    // the drawer falls back to a plain-text notice rather than
    // leaving the user with a blank screen and no explanation.
    if (!W.ui || typeof W.ui.modal !== "function") {
      console.warn("[EvidenceDrawer] W.ui.modal is unavailable.");
      return null;
    }

    let m;
    try {
      m = W.ui.modal({
        title: "Why this verdict?",
        body,
        footer: '<button class="btn ghost" data-a="close">Close</button>',
      });
    } catch (e) {
      console.warn("[EvidenceDrawer] modal failed:", e && e.message);
      return null;
    }

    if (m && m.el) {
      const btn = m.el.querySelector('[data-a="close"]');
      if (btn) btn.onclick = m.close;
    }
    return m;
  }

  // ── Public API ─────────────────────────────────────────────
  return Object.freeze({
    open,
    version: MODULE_VERSION,
    // Exposed for tests only. Frozen.
    _internal: Object.freeze({
      bucket,
      renderItems,
      renderProvenance,
      renderTrajectoryLine,
      renderOwnerLine,
      renderDeployerLine,
      renderTrackRecordLine,
      carryProvenance,
      normalizeRelationship,
      esc,
      safeProp,
      capStr,
      isReservedKey,
      constants: Object.freeze({
        MAX_ITEMS_PER_BUCKET,
        MAX_REASONS_PER_ITEM,
        MAX_TITLE_LEN,
        MAX_DETAIL_LEN,
        MAX_REASON_LEN,
        MAX_META_LEN,
        MAX_DOMAINS,
      }),
    }),
  });
})();

console.log(
  "[EvidenceDrawer] Module loaded (evidence-drawer-v2: correct escaper, capped strings, prototype-safe, robust against throwing getters).",
);
