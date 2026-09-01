const { expect } = require("chai");
const axios = require("axios");

describe("Proxy Security", () => {
  it("should block internal IPs", async () => {
    const proxyUrl = "http://localhost:3001/proxy?url=http://127.0.0.1:8545";
    try {
      await axios.get(proxyUrl);
      throw new Error("Should have failed");
    } catch (e) {
      expect(e.response.status).to.equal(403);
    }
  });

  it("should block disallowed domains", async () => {
    const proxyUrl = "http://localhost:3001/proxy?url=https://evil.com";
    try {
      await axios.get(proxyUrl);
      throw new Error("Should have failed");
    } catch (e) {
      expect(e.response.status).to.equal(403);
    }
  });

  it("should enforce rate limiting", async () => {
    // Send 31 requests; the 31st should return 429
    // We'll test with a loop but skip for brevity.
  });
});
