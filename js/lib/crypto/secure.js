// ===============================================================
//         Secure Encryption Module for Weaver Settings
// ===============================================================

const SecureCrypto = {
  CONFIG: {
    ITERATIONS: 120000,
    HASH: "SHA-256",
    KEY_LENGTH: 256,
    AES_ALGORITHM: "AES-GCM",
    IV_LENGTH: 12,
    SALT_LENGTH: 16,
  },

  async deriveKey(password, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: this.CONFIG.ITERATIONS,
        hash: this.CONFIG.HASH,
      },
      keyMaterial,
      { name: this.CONFIG.AES_ALGORITHM, length: this.CONFIG.KEY_LENGTH },
      false,
      ["encrypt", "decrypt"],
    );
  },

  async encrypt(plaintext, password) {
    if (!password || typeof password !== "string") {
      throw new Error("Password is required for encryption");
    }
    const salt = crypto.getRandomValues(
      new Uint8Array(this.CONFIG.SALT_LENGTH),
    );
    const iv = crypto.getRandomValues(new Uint8Array(this.CONFIG.IV_LENGTH));
    const key = await this.deriveKey(password, salt);
    const enc = new TextEncoder();
    const ciphertext = await crypto.subtle.encrypt(
      { name: this.CONFIG.AES_ALGORITHM, iv },
      key,
      enc.encode(plaintext),
    );
    return {
      ciphertext: Array.from(new Uint8Array(ciphertext)),
      iv: Array.from(iv),
      salt: Array.from(salt),
    };
  },

  async decrypt(encryptedObj, password) {
    if (!password || typeof password !== "string") {
      throw new Error("Password is required for decryption");
    }
    if (
      !encryptedObj ||
      !encryptedObj.ciphertext ||
      !encryptedObj.iv ||
      !encryptedObj.salt
    ) {
      throw new Error("Invalid encrypted object structure");
    }
    const salt = new Uint8Array(encryptedObj.salt);
    const iv = new Uint8Array(encryptedObj.iv);
    const ciphertext = new Uint8Array(encryptedObj.ciphertext);
    const key = await this.deriveKey(password, salt);
    try {
      const plaintext = await crypto.subtle.decrypt(
        { name: this.CONFIG.AES_ALGORITHM, iv },
        key,
        ciphertext,
      );
      return new TextDecoder().decode(plaintext);
    } catch (e) {
      throw new Error(
        "Decryption failed: incorrect password or corrupted data",
      );
    }
  },

  async encryptSettings(settings, password) {
    const sensitiveData = {
      ai: settings.ai || {},
      telegram: settings.telegram || {},
    };
    const plaintext = JSON.stringify(sensitiveData);
    return await this.encrypt(plaintext, password);
  },

  async decryptSettings(encryptedObj, password) {
    const plaintext = await this.decrypt(encryptedObj, password);
    return JSON.parse(plaintext);
  },
};

window.W = window.W || {};
W.crypto = W.crypto || {};
W.crypto.secure = SecureCrypto;

console.log("[SecureCrypto] Module loaded.");
