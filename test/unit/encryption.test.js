const { expect } = require("chai");
const secure = require("../../js/lib/crypto/secure.js");

describe("Encryption", () => {
  it("should encrypt and decrypt correctly", async () => {
    const plaintext = "secret data";
    const password = "myPassword123";
    const encrypted = await secure.encrypt(plaintext, password);
    const decrypted = await secure.decrypt(encrypted, password);
    expect(decrypted).to.equal(plaintext);
  });

  it("should fail decryption with wrong password", async () => {
    const plaintext = "secret";
    const password = "correct";
    const encrypted = await secure.encrypt(plaintext, password);
    try {
      await secure.decrypt(encrypted, "wrong");
      throw new Error("Should have thrown");
    } catch (e) {
      expect(e.message).to.include("incorrect password");
    }
  });
});
