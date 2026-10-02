const { expect } = require("chai");

require("../../js/ai/providers.js");

describe("AI providers — endpoint validation", () => {
  const generate = (endpoint) =>
    W.ai.providers.generate({
      providerName: "custom",
      messages: [{ role: "user", content: "hi" }],
      model: "m",
      apiKey: "k",
      endpointOverride: endpoint,
    });

  beforeEach(() => {
    global.fetch = async () => ({
      ok: true,
      headers: { get: () => null },
      text: async () =>
        JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
    });
  });
  afterEach(() => {
    delete global.fetch;
  });

  describe("rejects dangerous or malformed endpoints", () => {
    const cases = [
      ["http://api.example.com/v1", "https"],
      ["ftp://api.example.com/v1", "https"],
      ["data:text/plain,hi", "https"],
      ["javascript:alert(1)", "https"],
      ["https://user:pass@api.example.com/v1", "credentials"],
      ["https://localhost/v1", "private or local"],
      ["https://ip6-localhost/v1", "private or local"],
      ["https://127.0.0.1/v1", "private or local"],
      ["https://10.1.2.3/v1", "private or local"],
      ["https://192.168.1.1/v1", "private or local"],
      ["https://172.16.0.1/v1", "private or local"],
      ["https://172.31.255.254/v1", "private or local"],
      ["https://169.254.169.254/v1", "private or local"],
      ["https://100.64.0.1/v1", "private or local"],
      ["https://[::1]/v1", "private or local"],
      ["https://[fe80::1]/v1", "private or local"],
      ["https://[fc00::1]/v1", "private or local"],
      ["https://foo.local/v1", "private or local"],
      ["https://svc.internal/v1", "private or local"],
      ["https://api.example.com:8443/v1", "standard HTTPS port"],
      ["", "non-empty"],
      ["not-a-url", "valid URL"],
    ];
    cases.forEach(([url, fragment]) => {
      it(`rejects ${url || "(empty)"}`, async () => {
        try {
          await generate(url);
          throw new Error("did not reject");
        } catch (e) {
          expect(e.message.toLowerCase()).to.include(fragment.toLowerCase());
        }
      });
    });
  });

  describe("accepts public HTTPS endpoints", () => {
    it("accepts a normal HTTPS endpoint", async () => {
      const result = await generate("https://api.example.com/v1/chat");
      expect(result).to.equal("ok");
    });

    it("accepts a public IPv6 address", async () => {
      const result = await generate("https://[2001:db8::1]/v1");
      expect(result).to.equal("ok");
    });

    it("accepts the built-in OpenAI endpoint as custom override", async () => {
      const result = await generate(
        "https://api.openai.com/v1/chat/completions",
      );
      expect(result).to.equal("ok");
    });
  });

  describe("hardened fetch options", () => {
    it("passes redirect:error, credentials:omit, no-referrer, no-store", async () => {
      let opts;
      global.fetch = async (_url, o) => {
        opts = o;
        return {
          ok: true,
          headers: { get: () => null },
          text: async () =>
            JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
        };
      };
      await generate("https://api.example.com/v1");
      expect(opts.redirect).to.equal("error");
      expect(opts.credentials).to.equal("omit");
      expect(opts.referrerPolicy).to.equal("no-referrer");
      expect(opts.cache).to.equal("no-store");
    });
  });

  describe("response handling", () => {
    it("rejects an over-size declared Content-Length", async () => {
      global.fetch = async () => ({
        ok: true,
        headers: {
          get: (h) => (h === "content-length" ? String(10 * 1024 * 1024) : null),
        },
        text: async () => "x",
      });
      try {
        await generate("https://api.example.com/v1");
        throw new Error("did not reject");
      } catch (e) {
        expect(e.message).to.include("size cap");
      }
    });

    it("rejects non-JSON response body", async () => {
      global.fetch = async () => ({
        ok: true,
        headers: { get: () => null },
        text: async () => "<html>bad</html>",
      });
      try {
        await generate("https://api.example.com/v1");
        throw new Error("did not reject");
      } catch (e) {
        expect(e.message).to.include("not valid JSON");
      }
    });

    it("sanitizes upstream error text", async () => {
      global.fetch = async () => ({
        ok: false,
        status: 400,
        headers: { get: () => null },
        text: async () =>
          JSON.stringify({ error: { message: "<script>x</script>oops" } }),
      });
      try {
        await generate("https://api.example.com/v1");
        throw new Error("did not reject");
      } catch (e) {
        expect(e.message).to.not.include("<");
        expect(e.message).to.not.include(">");
        expect(e.message).to.include("oops");
      }
    });
  });
});
