// ===============================================================
//         AI Provider Abstraction Layer
// ===============================================================
//
// Purpose: Decouple Weaver from specific LLM APIs.
// Allows adding new providers (Qwen, DeepSeek, Local) without
// modifying the core AI logic.
//
// ===============================================================

window.W = window.W || {};
W.ai = W.ai || {}; // Ensure we don't overwrite existing W.ai properties

W.ai.providers = (() => {
  const registry = {};

  function register(name, provider) {
    if (!name || !provider) throw new Error("Invalid provider registration");
    registry[name] = provider;
  }

  async function generate({
    providerName,
    messages,
    model,
    apiKey,
    endpointOverride,
  }) {
    const provider = registry[providerName];
    if (!provider)
      throw new Error(`AI Provider '${providerName}' is not registered.`);
    if (!apiKey) throw new Error("API key is required.");

    const endpoint = endpointOverride || provider.endpoint;
    if (!endpoint) throw new Error("API endpoint is missing.");

    const headers = provider.buildHeaders(apiKey);
    const body = provider.buildPayload(messages, model);

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let errorMsg = `HTTP ${response.status}`;
      try {
        const errorData = await response.json();
        errorMsg = errorData.error?.message || errorData.message || errorMsg;
      } catch (e) {}
      throw new Error(errorMsg);
    }

    const data = await response.json();
    return provider.parseResponse(data);
  }

  return { register, generate };
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
