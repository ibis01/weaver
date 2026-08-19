// ===============================================================
//         Unit Tests for SecureCrypto Module
// ===============================================================

(async function runCryptoTests() {
  console.log("=== Starting Crypto Tests ===\n");

  let passed = 0;
  let failed = 0;

  // Test 1: Basic encryption/decryption round-trip
  try {
    console.log("Test 1: Basic encryption/decryption round-trip");
    const plaintext = "test-api-key-12345";
    const password = "test-password";

    const encrypted = await W.crypto.secure.encrypt(plaintext, password);
    const decrypted = await W.crypto.secure.decrypt(encrypted, password);

    if (decrypted === plaintext) {
      console.log("✓ PASS: Decrypted text matches original\n");
      passed++;
    } else {
      throw new Error("Decrypted text does not match");
    }
  } catch (e) {
    console.log(`✗ FAIL: ${e.message}\n`);
    failed++;
  }

  // Test 2: Unique IV/salt for each encryption
  try {
    console.log("Test 2: Unique IV/salt for each encryption");
    const plaintext = "same-text";
    const password = "same-password";

    const encrypted1 = await W.crypto.secure.encrypt(plaintext, password);
    const encrypted2 = await W.crypto.secure.encrypt(plaintext, password);

    if (
      JSON.stringify(encrypted1.iv) !== JSON.stringify(encrypted2.iv) &&
      JSON.stringify(encrypted1.salt) !== JSON.stringify(encrypted2.salt)
    ) {
      console.log("✓ PASS: IV and salt are unique for each encryption\n");
      passed++;
    } else {
      throw new Error("IV or salt are not unique");
    }
  } catch (e) {
    console.log(`✗ FAIL: ${e.message}\n`);
    failed++;
  }

  // Test 3: Decryption fails with wrong password
  try {
    console.log("Test 3: Decryption fails with wrong password");
    const plaintext = "secret-data";
    const correctPassword = "correct";
    const wrongPassword = "wrong";

    const encrypted = await W.crypto.secure.encrypt(plaintext, correctPassword);

    try {
      await W.crypto.secure.decrypt(encrypted, wrongPassword);
      throw new Error("Decryption should have failed with wrong password");
    } catch (decryptError) {
      if (decryptError.message.includes("Decryption failed")) {
        console.log(
          "✓ PASS: Decryption correctly failed with wrong password\n",
        );
        passed++;
      } else {
        throw decryptError;
      }
    }
  } catch (e) {
    console.log(`✗ FAIL: ${e.message}\n`);
    failed++;
  }

  // Test 4: Settings object encryption
  try {
    console.log("Test 4: Settings object encryption");
    const settings = {
      currency: "usd",
      ai: { key: "sk-test-123", provider: "openai" },
      telegram: { token: "bot-token", chat: "123456" },
    };
    const password = "test-password";

    const encrypted = await W.crypto.secure.encryptSettings(settings, password);
    const decrypted = await W.crypto.secure.decryptSettings(
      encrypted,
      password,
    );

    if (
      decrypted.ai.key === settings.ai.key &&
      decrypted.telegram.token === settings.telegram.token
    ) {
      console.log(
        "✓ PASS: Settings object encrypted and decrypted correctly\n",
      );
      passed++;
    } else {
      throw new Error("Settings object mismatch");
    }
  } catch (e) {
    console.log(`✗ FAIL: ${e.message}\n`);
    failed++;
  }

  // Test 5: Storage integration
  try {
    console.log("Test 5: Storage integration");
    const settings = {
      currency: "eur",
      ai: { key: "sk-live-key", provider: "anthropic" },
      telegram: { token: "live-token", chat: "789" },
    };
    const password = "storage-test";

    await W.store.setSecureSettings(settings, password);
    const retrieved = await W.store.getSecureSettings(password);

    if (retrieved && retrieved.ai.key === settings.ai.key) {
      console.log("✓ PASS: Storage secure methods work correctly\n");
      passed++;
    } else {
      throw new Error("Storage secure methods failed");
    }
  } catch (e) {
    console.log(`✗ FAIL: ${e.message}\n`);
    failed++;
  }

  // Summary
  console.log("=== Test Summary ===");
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);

  if (failed === 0) {
    console.log("\n✓ All tests passed!");
  } else {
    console.log(`\n✗ ${failed} test(s) failed`);
  }
})();
