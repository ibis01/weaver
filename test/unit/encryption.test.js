const { expect } = require("chai");

describe("Encryption", () => {
  it("should encrypt and decrypt correctly", async () => {
    const secure = global.W.crypto.secure;
    const plaintext = "secret data";
    const password = "myPassword123";
    const encrypted = await secure.encrypt(plaintext, password);
    const decrypted = await secure.decrypt(encrypted, password);
    expect(decrypted).to.equal(plaintext);
    expect(encrypted).to.not.equal(plaintext);
  });

  it("should fail decryption with wrong password", async () => {
    const secure = global.W.crypto.secure;
    const plaintext = "secret data";
    const password = "myPassword123";
    const encrypted = await secure.encrypt(plaintext, password);
    // The production implementation throws on wrong-password decrypt
    // ("Decryption failed: incorrect password or corrupted data").
    // The earlier mock returned null, which hid that contract. Test
    // the real behavior.
    let threw = false;
    try {
      await secure.decrypt(encrypted, "wrongPassword");
    } catch {
      threw = true;
    }
    expect(threw).to.equal(true);
  });
});
