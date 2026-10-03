const { expect } = require("chai");

// Must be set BEFORE requiring the vault module.
globalThis.__WEAVER_VAULT_NO_RELOAD__ = true;

if (!globalThis.crypto || !globalThis.crypto.subtle) {
  throw new Error(
    "globalThis.crypto.subtle is required (Node 20+). " +
      "Check the Node version in .nvmrc.",
  );
}

// Mirrors js/storage/storage.js routing behavior so tests exercise
// the same vault-routing path production does. Without this, the
// regression test for migrateKeys would pass against a buggy
// W.store.get that routes through the empty vault cache.
function makeStore() {
  return {
    get(key, fallback = null) {
      if (global.W && global.W.vault && typeof global.W.vault.routingFor === "function") {
        const route = global.W.vault.routingFor(key);
        if (route === "vault") return global.W.vault.getCached(key, fallback);
        if (route === "locked") throw new global.W.vault.VaultLockedError();
      }
      const raw = localStorage.getItem("weaver:" + key);
      if (raw === null) return fallback;
      try {
        return JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      if (global.W && global.W.vault && typeof global.W.vault.routingFor === "function") {
        const route = global.W.vault.routingFor(key);
        if (route === "vault") return global.W.vault.set(key, value);
        if (route === "locked") throw new global.W.vault.VaultLockedError();
      }
      localStorage.setItem("weaver:" + key, JSON.stringify(value));
    },
    delete(key) {
      if (global.W && global.W.vault && typeof global.W.vault.routingFor === "function") {
        const route = global.W.vault.routingFor(key);
        if (route === "vault") return global.W.vault.delete(key);
        if (route === "locked") throw new global.W.vault.VaultLockedError();
      }
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
    W.store.set("portfolio_holdings", [{ id: "btc" }]);
    W.store.set("watchlist", ["eth"]);
    await W.vault.setup("pw-123456");
    const result = await W.vault.migrateKeys([
      "portfolio_holdings",
      "watchlist",
    ]);
    expect(result.migrated).to.include("portfolio_holdings");
    expect(result.migrated).to.include("watchlist");
    // W.store.get(key, undefined) does not work: the default
    // parameter replaces undefined with null. Check raw localStorage.
    expect(localStorage.getItem("weaver:portfolio_holdings")).to.equal(
      null,
    );
    expect(localStorage.getItem("weaver:watchlist")).to.equal(null);
    expect(await W.vault.get("portfolio_holdings")).to.deep.equal([
      { id: "btc" },
    ]);
    expect(await W.vault.get("watchlist")).to.deep.equal(["eth"]);
  });

  it("migrateKeys reads through raw localStorage, not vault routing", async () => {
    // Regression: once setup() completes, W.store.get(name) routes
    // to the vault for names in VAULT_KEYS. If migrateKeys used
    // W.store.get, it would read the empty cache and skip every key
    // as no-plaintext. Verify plaintext actually moves.
    //
    // Use the real key names declared in VAULT_KEYS (portfolio.js
    // writes "portfolio_holdings", not "portfolio").
    W.store.set("portfolio_holdings", [{ id: "btc" }]);
    W.store.set("watchlist", ["eth", "sol"]);
    await W.vault.setup("pw-123456");
    // Sanity: W.store.get now routes to vault and returns fallback.
    expect(W.store.get("portfolio_holdings", "FALLBACK")).to.equal(
      "FALLBACK",
    );
    const result = await W.vault.migrateKeys([
      "portfolio_holdings",
      "watchlist",
    ]);
    expect(result.migrated.sort()).to.deep.equal([
      "portfolio_holdings",
      "watchlist",
    ]);
    expect(result.skipped.length).to.equal(0);
    expect(await W.vault.get("portfolio_holdings")).to.deep.equal([
      { id: "btc" },
    ]);
    expect(await W.vault.get("watchlist")).to.deep.equal(["eth", "sol"]);
  });

  it("migration aborts if staging cannot persist", async () => {
    W.store.set("portfolio_holdings", [{ id: "btc" }]);
    await W.vault.setup("pw-123456");
    const origSet = W.store.set.bind(W.store);
    W.store.set = (k, v) => {
      if (k.startsWith("vault::__staging::")) return; // simulate quota
      return origSet(k, v);
    };
    const result = await W.vault.migrateKeys(["portfolio_holdings"]);
    expect(result.failed.length).to.equal(1);
    expect(result.failed[0].reason).to.equal("staging-not-persisted");
    expect(localStorage.getItem("weaver:portfolio_holdings")).to.not.equal(
      null,
    );
  });

  it("migration skips names with no plaintext and names already in vault", async () => {
    // Write plaintext BEFORE setup so it lands in localStorage
    // rather than being routed to the vault cache. After setup()
    // the shim (like production storage.js) routes vault-key
    // writes to the vault — so this two-step order is required.
    W.store.set("portfolio", ["plain-will-be-skipped"]);
    W.store.set("watchlist", ["new"]);
    await W.vault.setup("pw-123456");
    // Inject a vault entry for portfolio to simulate the
    // already-migrated case. Now both a vault entry AND plaintext
    // exist under portfolio; migrateKeys must prefer the vault
    // entry and skip.
    await W.vault.set("portfolio", ["vault-preexisting"]);
    const result = await W.vault.migrateKeys([
      "portfolio",
      "watchlist",
      "nonexistent",
    ]);
    const skipped = result.skipped.map((s) => s.reason);
    expect(skipped).to.include("vault-entry-exists");
    expect(skipped).to.include("no-plaintext");
    expect(result.migrated).to.deep.equal(["watchlist"]);
    // watchlist plaintext is gone; portfolio plaintext stays because
    // the vault entry took precedence and migration skipped it.
    // Cleanup happens in the next enable-vault run.
    expect(localStorage.getItem("weaver:watchlist")).to.equal(null);
    expect(await W.vault.get("watchlist")).to.deep.equal(["new"]);
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
