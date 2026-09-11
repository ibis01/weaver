const { expect } = require("chai");
const axios = require("axios");

describe("Proxy SSRF Protection", () => {
  const base = "http://localhost:3001/proxy?url=";

  it("should block AWS metadata endpoint", async () => {
    try {
      await axios.get(
        base + encodeURIComponent("http://169.254.169.254/latest/meta-data/"),
      );
      throw new Error("Should have blocked");
    } catch (e) {
      expect(e.response?.status).to.equal(403);
    }
  });

  it("should block localhost", async () => {
    try {
      await axios.get(base + encodeURIComponent("http://127.0.0.1:8545"));
      throw new Error("Should have blocked");
    } catch (e) {
      expect(e.response?.status).to.equal(403);
    }
  });

  it("should block private IP ranges", async () => {
    try {
      await axios.get(base + encodeURIComponent("http://192.168.1.1/"));
      throw new Error("Should have blocked");
    } catch (e) {
      expect(e.response?.status).to.equal(403);
    }
  });

  it("should block non-allowed domains", async () => {
    try {
      await axios.get(base + encodeURIComponent("https://evil.com/"));
      throw new Error("Should have blocked");
    } catch (e) {
      expect(e.response?.status).to.equal(403);
    }
  });

  it("should allow whitelisted domains", async () => {
    const res = await axios.get(
      base + encodeURIComponent("https://api.coingecko.com/api/v3/ping"),
    );
    expect(res.status).to.equal(200);
  });
});
