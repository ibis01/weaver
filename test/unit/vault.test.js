const { expect } = require("chai");

// Must be set BEFORE requiring the vault module.
globalThis.__WEAVER_VAULT_NO_RELOAD__ = true;

if (!globalThis.crypto || !globalThis.crypto.subtle) {
  throw new Error(
    "globalThis.crypto.subtle is required (Node 20+). " +
      "Check the Node version in .nvmrc.",
  );
}

function makeStore() {
  return {
    get(key, fallback = null) {
      const raw = localStorage.getItem("weaver:" + key);
      if (raw === null) return fallback;
      try {
        return JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      localStorage.setItem("weaver:" + key, JSON.stringify(value));
    },
    delete(key) {
      localStorage.removeItem("weaver:" + key);
    },
    clearAll() {
      localStorage.clear();
    },
  };
}

describe("Vault", () => {
  let W;

  beforeEach(() => {
    localStorage.clear();
    global.window = global.window || {};
    global.window.W = global.window.W || {};
    global.W = global.window.W;
    global.W.store = makeStore();
    delete require.cache[require.resolve("../../js/lib/crypto/vault.js")];
    require("../../js/lib/crypto/vault.js");
    W = global.W;
  });

  it("is locked on fresh boot", () => {
    expect(W.vault.isLocked()).to.equal(true);
    expect(W.vault.hasStoredVault()).to.equal(false);
  });

  it("setup creates the vault and unlocks it", async () => {
    await W.vault.setup("correct horse battery staple");
    expect(W.vault.isUnlocked()).to.equal(true);
    expect(W.vault.hasStoredVault()).to.equal(true);
  });

  it("set/get/delete round-trip", async () => {
    await W.vault.setup("pw-123456");
    await W.vault.set("portfolio", [{ id: "btc", qty: 1 }]);
    const got = await W.vault.get("portfolio");
    expect(got).to.deep.equal([{ id: "btc", qty: 1 }]);
    await W.vault.delete("portfolio");
    expect(await W.vault.get("portfolio")).to.equal(null);
  });

  it("locked get throws VaultLockedError", async () => {
    await W.vault.setup("pw-123456");
    W.vault.__test.clear();
    let threw = false;
    try {
      await W.vault.get("portfolio");
    } catch (e) {
      threw = true;
      expect(e.name).to.equal("VaultLockedError");
      expect(e.code).to.equal("VAULT_LOCKED");
    }
    expect(threw).to.equal(true);
  });

  it("locked set throws VaultLockedError", async () => {
    await W.vault.setup("pw-123456");
    W.vault.__test.clear();
    let threw = false;
    try {
      await W.vault.set("portfolio", []);
    } catch (e) {
      threw = true;
      expect(e.name).to.equal("VaultLockedError");
    }
    expect(threw).to.equal(true);
  });

  it("unlock with wrong passphrase throws and leaves locked", async () => {
    await W.vault.setup("pw-123456");
    W.vault.__test.clear();
    let threw = false;
    try {
      await W.vault.unlock("WRONG");
    } catch (e) {
      threw = true;
    }
    expect(threw).to.equal(true);
    expect(W.vault.isLocked()).to.equal(true);
  });

  it("unlock with correct passphrase succeeds", async () => {
    await W.vault.setup("pw-123456");
    await W.vault.set("portfolio", [1, 2, 3]);
    W.vault.__test.clear();
    await W.vault.unlock("pw-123456");
    expect(W.vault.isUnlocked()).to.equal(true);
    expect(await W.vault.get("portfolio")).to.deep.equal([1, 2, 3]);
  });

  it("blob has v:1 and a fresh IV per write", async () => {
    await W.vault.setup("pw-123456");
    await W.vault.set("a", 1);
    const blob1 = W.store.get("vault::a", null);
    await W.vault.set("a", 2);
    const blob2 = W.store.get("vault::a", null);
    expect(blob1.v).to.equal(1);
    expect(blob2.v).to.equal(1);
    expect(blob1.iv).to.be.a("string");
    expect(blob2.iv).to.be.a("string");
    expect(blob1.iv).to.not.equal(blob2.iv);
  });

  it("root marker carries v:1 and a salt", async () => {
    await W.vault.setup("pw-123456");
    const root = W.store.get("vault::__root", null);
    expect(root.v).to.equal(1);
    expect(root.salt).to.be.a("string");
    expect(root.verifier.iv).to.be.a("string");
    expect(root.verifier.ct).to.be.a("string");
  });

  it("lock() clears in-memory key", async () => {
    await W.vault.setup("pw-123456");
    expect(W.vault.isUnlocked()).to.equal(true);
    W.vault.lock();
    expect(W.vault.isLocked()).to.equal(true);
  });

  it("migrateKeys moves plaintext into vault and removes plaintext", async () => {
    W.store.set("portfolio", [{ id: "btc" }]);
    W.store.set("watchlist", ["eth"]);
    await W.vault.setup("pw-123456");
    const result = await W.vault.migrateKeys(["portfolio", "watchlist"]);
    expect(result.migrated).to.include("portfolio");
    expect(result.migrated).to.include("watchlist");
    // W.store.get(key, undefined) does not work: the default
    // parameter replaces undefined with null. Check raw localStorage.
    expect(localStorage.getItem("weaver:portfolio")).to.equal(null);
    expect(localStorage.getItem("weaver:watchlist")).to.equal(null);
    expect(await W.vault.get("portfolio")).to.deep.equal([{ id: "btc" }]);
    expect(await W.vault.get("watchlist")).to.deep.equal(["eth"]);
  });

  it("migration aborts if staging cannot persist", async () => {
    W.store.set("portfolio", [{ id: "btc" }]);
    await W.vault.setup("pw-123456");
    const origSet = W.store.set.bind(W.store);
    W.store.set = (k, v) => {
      if (k.startsWith("vault::__staging::")) return; // simulate quota
      return origSet(k, v);
    };
    const result = await W.vault.migrateKeys(["portfolio"]);
    expect(result.failed.length).to.equal(1);
    expect(result.failed[0].reason).to.equal("staging-not-persisted");
    expect(W.store.get("portfolio", undefined)).to.not.equal(undefined);
  });

  it("migration skips names with no plaintext and names already in vault", async () => {
    await W.vault.setup("pw-123456");
    await W.vault.set("portfolio", ["existing"]);
    W.store.set("watchlist", ["new"]);
    const result = await W.vault.migrateKeys(["portfolio", "watchlist", "nonexistent"]);
    const skipped = result.skipped.map((s) => s.reason);
    expect(skipped).to.include("vault-entry-exists");
    expect(skipped).to.include("no-plaintext");
    expect(result.migrated).to.deep.equal(["watchlist"]);
  });

  it("exportBlob returns ciphertext structure, not plaintext", async () => {
    await W.vault.setup("pw-123456");
    await W.vault.set("portfolio", [{ id: "btc" }]);
    const blob = W.vault.exportBlob();
    expect(blob).to.have.property("root");
    expect(blob).to.have.property("entries");
    expect(blob.entries).to.have.property("portfolio");
    const entry = blob.entries.portfolio;
    expect(entry).to.have.property("iv");
    expect(entry).to.have.property("ct");
    // The plaintext value must not appear anywhere in the serialized blob.
    const serialized = JSON.stringify(blob);
    expect(serialized).to.not.include("btc");
  });

  it("exportBlob throws when locked", async () => {
    await W.vault.setup("pw-123456");
    W.vault.__test.clear();
    let threw = false;
    try {
      W.vault.exportBlob();
    } catch (e) {
      threw = true;
      expect(e.name).to.equal("VaultLockedError");
    }
    expect(threw).to.equal(true);
  });
});
