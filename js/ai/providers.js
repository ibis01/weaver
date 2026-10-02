// ===============================================================
//         AI Provider Abstraction Layer
// ===============================================================
//
// Purpose: Decouple Weaver from specific LLM APIs.
// Allows adding new providers (Qwen, DeepSeek, Local) without
// modifying the core AI logic.
//
// SECURITY MODEL
// --------------
// Every generate() call validates the endpoint URL:
//
//   1. Non-empty string; parses as an absolute URL.
//   2. Scheme must be https: — no http:, data:, javascript:, file:.
//   3. No credentials in URL (user:pass@host rejected).
//   4. Host must not be a literal private IP, localhost, or a
//      *.local / *.internal / *.lan / *.corp-style name.
//   5. Port must be standard HTTPS (443 or absent).
//
// Runtime fetch options:
//   redirect: "error"        — never follow a redirect. A relay
//                              cannot bounce the request to an
//                              internal address via a 3xx.
//   credentials: "omit"      — no cookies cross-origin.
//   referrerPolicy: "no-referrer"
//   cache: "no-store"
//   signal: caller-supplied; a local 30s AbortController is used
//           as a fallback if the caller does not supply one.
//
// Response handling:
//   - Content-Length is capped at MAX_RESPONSE_BYTES (declared).
//   - Post-read text length is capped at the same limit (actual).
//   - JSON parse errors become clean Error messages, not raw
//     SyntaxError objects.
//   - Upstream error text is truncated, control-chars stripped,
//     and angle brackets removed before being surfaced.
//
// The browser's CSP connect-src is the outer boundary: even a
// well-formed URL must be permitted by the deployment's CSP.
// api.openai.com and api.anthropic.com are in index.html's
// connect-src. Custom relay endpoints require an entry there too.
// ===============================================================

window.W = window.W || {};
W.ai = W.ai || {}; // Ensure we don't overwrite existing W.ai properties

W.ai.providers = (() => {
  "use strict";

  const registry = {};

  // ── Constants ─────────────────────────────────────────
  const MAX_RESPONSE_BYTES = 512 * 1024; // 512 KB — generous for text
  const PROVIDER_TIMEOUT_MS = 30000;     // matches LLM_TIMEOUT_MS in ai.js
  const MAX_ERROR_LEN = 240;

  // Exact hostnames that are never valid LLM endpoints.
  const FORBIDDEN_HOSTNAMES = new Set([
    "localhost",
    "ip6-localhost",
    "ip6-loopback",
  ]);

  // Hostname suffixes indicating a private or internal scope.
  const FORBIDDEN_HOST_SUFFIXES = [
    ".localhost",
    ".local",
    ".internal",
    ".intranet",
    ".lan",
    ".home",
    ".corp",
  ];

  // ── Endpoint validation ───────────────────────────────
  function isPrivateIPv4(host) {
    const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!m) return false;
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 0) return true;                        // 0.0.0.0/8
    if (a === 10) return true;                       // 10.0.0.0/8
    if (a === 127) return true;                      // 127.0.0.0/8
    if (a === 169 && b === 254) return true;         // 169.254.0.0/16
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true;         // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10
    if (a === 192 && b === 0) return true;           // 192.0.0.0/24
    if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15
    if (a === 198 && b === 51) return true;          // 198.51.100.0/24
    if (a === 203 && b === 0) return true;           // 203.0.113.0/24
    if (a >= 224) return true;                       // multicast + reserved
    return false;
  }

  function isPrivateIPv6(host) {
    const h = host.replace(/^\[|\]$/g, "").toLowerCase();
    if (h === "::1" || h === "::") return true;
    if (h.startsWith("fc") || h.startsWith("fd")) return true; // fc00::/7
    if (
      h.startsWith("fe8") ||
      h.startsWith("fe9") ||
      h.startsWith("fea") ||
      h.startsWith("feb")
    ) {
      return true; // fe80::/10
    }
    const v4mapped = h.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (v4mapped) return isPrivateIPv4(v4mapped[1]);
    return false;
  }

  function isForbiddenHost(hostname) {
    const host = hostname.toLowerCase();
    if (FORBIDDEN_HOSTNAMES.has(host)) return true;
    for (const suffix of FORBIDDEN_HOST_SUFFIXES) {
      if (host.endsWith(suffix)) return true;
    }
    if (isPrivateIPv4(host)) return true;
    if (host.includes(":") && isPrivateIPv6(host)) return true;
    return false;
  }

  function validateEndpoint(raw) {
    if (typeof raw !== "string" || !raw.trim()) {
      throw new Error("AI endpoint must be a non-empty string.");
    }
    let url;
    try {
      url = new URL(raw);
    } catch {
      throw new Error("AI endpoint is not a valid URL.");
    }
    if (url.protocol !== "https:") {
      throw new Error("AI endpoint must use https:.");
    }
    if (url.username || url.password) {
      throw new Error("AI endpoint must not contain credentials.");
    }
    if (url.port) {
      // URL API strips :443 automatically, so any non-empty port
      // here is a non-standard port.
      throw new Error("AI endpoint must use the standard HTTPS port.");
    }
    if (isForbiddenHost(url.hostname)) {
      throw new Error(
        "AI endpoint must not point at a private or local address.",
      );
    }
    return url.toString();
  }

  // ── Response reading with size cap ────────────────────
  async function readTextCapped(response) {
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
      throw new Error("AI response exceeds size cap.");
    }
    const text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) {
      throw new Error("AI response exceeds size cap.");
    }
    return text;
  }

  // ── Error text sanitization ───────────────────────────
  // Upstream error bodies are untrusted. Strip control chars,
  // remove angle brackets, and cap the length.
  function sanitizeErrorText(raw) {
    if (typeof raw !== "string") return "";
    const stripped = raw
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .replace(/[<>]/g, "");
    return stripped.length > MAX_ERROR_LEN
      ? stripped.slice(0, MAX_ERROR_LEN) + "…"
      : stripped;
  }

  // ── Registration ──────────────────────────────────────
  function register(name, provider) {
    if (!name || !provider) throw new Error("Invalid provider registration");
    registry[name] = provider;
  }

  // ── Generate ──────────────────────────────────────────
  async function generate({
    providerName,
    messages,
    model,
    apiKey,
    endpointOverride,
    signal,
  }) {
    const provider = registry[providerName];
    if (!provider)
      throw new Error(`AI Provider '${providerName}' is not registered.`);
    if (!apiKey) throw new Error("API key is required.");

    // Distinguish "no endpoint supplied at all" from "an empty or
    // malformed endpoint was supplied". The former is a configuration
    // error; the latter is a validation error with a specific cause.
    const candidate =
      endpointOverride !== undefined && endpointOverride !== null
        ? endpointOverride
        : provider.endpoint;
    if (candidate === undefined || candidate === null) {
      throw new Error("API endpoint is missing.");
    }
    const endpoint = validateEndpoint(candidate);

    const headers = provider.buildHeaders(apiKey);
    const body = provider.buildPayload(messages, model);

    // Local timeout only if the caller did not supply a signal.
    let controller = null;
    let timer = null;
    let effectiveSignal = signal;
    if (!effectiveSignal) {
      controller = new AbortController();
      timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
      effectiveSignal = controller.signal;
    }

    let response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: effectiveSignal,
        redirect: "error",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        cache: "no-store",
      });
    } catch (e) {
      if (timer) clearTimeout(timer);
      if (e && e.name === "AbortError") {
        throw new Error("AI request timed out.");
      }
      // Raw fetch errors can include the URL; do not surface them.
      throw new Error("AI request failed.");
    }
    if (timer) clearTimeout(timer);

    if (!response.ok) {
      let errorMsg = `HTTP ${response.status}`;
      try {
        const text = await readTextCapped(response);
        const parsed = JSON.parse(text);
        const upstream =
          (parsed && parsed.error && parsed.error.message) ||
          (parsed && parsed.message) ||
          null;
        if (upstream) errorMsg = sanitizeErrorText(upstream);
      } catch {
        /* keep the HTTP status fallback */
      }
      throw new Error(errorMsg);
    }

    let text;
    try {
      text = await readTextCapped(response);
    } catch (e) {
      throw new Error(e && e.message ? e.message : "AI response read failed.");
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("AI response was not valid JSON.");
    }

    if (W.schemas) {
      try {
        W.schemas.validate("llm", data);
      } catch {
        throw new Error("AI response failed schema validation.");
      }
    }

    W.dataHealth?.mark("llm", {
      source: providerName,
      observedAt: Date.now(),
      staleAfter: 15 * 60 * 1000,
    });

    try {
      return provider.parseResponse(data);
    } catch {
      throw new Error("AI response could not be parsed.");
    }
  }

  return Object.freeze({ register, generate });
})();

// ── Register Built-in Providers ─────────────────────────

W.ai.providers.register("openai", {
  name: "OpenAI",
  endpoint: "https://api.openai.com/v1/chat/completions",
  buildHeaders: (apiKey) => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  }),
  buildPayload: (messages, model) => ({
    model: model || "gpt-4o-mini",
    messages: messages,
    temperature: 0.7,
    max_tokens: 1000,
  }),
  parseResponse: (data) => data.choices?.[0]?.message?.content || "",
});

W.ai.providers.register("anthropic", {
  name: "Anthropic",
  endpoint: "https://api.anthropic.com/v1/messages",
  buildHeaders: (apiKey) => ({
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  }),
  buildPayload: (messages, model) => ({
    model: model || "claude-3-sonnet",
    messages: messages,
    max_tokens: 1000,
    temperature: 0.7,
  }),
  parseResponse: (data) => data.content?.[0]?.text || "",
});

W.ai.providers.register("custom", {
  name: "Custom",
  endpoint: "", // Must be provided via settings
  buildHeaders: (apiKey) => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  }),
  buildPayload: (messages, model) => ({
    model: model || "",
    messages: messages,
    temperature: 0.7,
    max_tokens: 1000,
  }),
  parseResponse: (data) =>
    data.choices?.[0]?.message?.content || data.text || "",
});

console.log("[AI Providers] Registry initialized.");
