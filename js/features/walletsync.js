window.W = window.W || {};

W.walletSync = (() => {
  const ERC20 = [
    [
      "tether",
      "usdt",
      "Tether",
      "0xdac17f958d2ee523a2206206994597c13d831ec7",
      6,
    ],
    [
      "usd-coin",
      "usdc",
      "USDC",
      "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      6,
    ],
    [
      "chainlink",
      "link",
      "Chainlink",
      "0x514910771af9ca656af840dff83e8264ecf986ca",
      18,
    ],
    [
      "uniswap",
      "uni",
      "Uniswap",
      "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984",
      18,
    ],
    ["aave", "aave", "Aave", "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9", 18],
    ["dai", "dai", "Dai", "0x6b175474e89094c44da98b954eedeac495271d0f", 18],
  ];
  const SPL = [
    [
      "tether",
      "usdt",
      "Tether (Solana)",
      "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11Mc8wjjcPbW",
      9,
    ],
    [
      "usd-coin",
      "usdc",
      "USDC (Solana)",
      "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      6,
    ],
  ];

  const post = (url, body) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => r.json());

  async function detect() {
    const w = {};
    if (window.ethereum) {
      try {
        const a = await window.ethereum.request({ method: "eth_accounts" });
        if (a && a[0]) w.evm = a[0];
      } catch (e) {}
    }
    if (
      window.phantom &&
      window.phantom.solana &&
      window.phantom.solana.isConnected
    ) {
      try {
        const r = await window.phantom.solana.request({ method: "connect" });
        w.sol = r.publicKey.toString();
      } catch (e) {}
    }
    return w;
  }

  async function evm(addr) {
    const rows = [];
    try {
      const d = await post("https://cloudflare-eth.com", {
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getBalance",
        params: [addr, "latest"],
      });
      const q = parseInt(d.result || "0x0", 16) / 1e18;
      if (q > 1e-9)
        rows.push({
          id: "w-eth",
          coinId: "ethereum",
          symbol: "eth",
          name: "Ethereum",
          qty: q,
          wallet: true,
        });
    } catch (e) {}
    for (const [cid, sym, name, contract, dec] of ERC20) {
      try {
        const data = "0x70a08231" + addr.slice(2).padStart(64, "0");
        const d = await post("https://cloudflare-eth.com", {
          jsonrpc: "2.0",
          id: 1,
          method: "eth_call",
          params: [{ to: contract, data: data }, "latest"],
        });
        const q = parseInt(d.result || "0x0", 16) / Math.pow(10, dec);
        if (q > 1e-9)
          rows.push({
            id: "w-" + sym,
            coinId: cid,
            symbol: sym,
            name: name,
            qty: q,
            wallet: true,
          });
      } catch (e) {}
    }
    return rows;
  }

  async function sol(addr) {
    const rows = [];
    try {
      const d = await post("https://api.mainnet-beta.solana.com", {
        jsonrpc: "2.0",
        id: 1,
        method: "getBalance",
        params: [addr],
      });
      const q = ((d.result && d.result.value) || 0) / 1e9;
      if (q > 1e-9)
        rows.push({
          id: "w-sol",
          coinId: "solana",
          symbol: "sol",
          name: "Solana",
          qty: q,
          wallet: true,
        });
    } catch (e) {}
    for (const [cid, sym, name, mint, dec] of SPL) {
      try {
        const d = await post("https://api.mainnet-beta.solana.com", {
          jsonrpc: "2.0",
          id: 1,
          method: "getTokenAccountsByOwner",
          params: [addr, { mint: mint }, { encoding: "jsonParsed" }],
        });
        let q = 0;
        ((d.result || {}).value || []).forEach((a) => {
          q +=
            +a.account.data.parsed.info.tokenAmount.amount / Math.pow(10, dec);
        });
        if (q > 1e-9)
          rows.push({
            id: "w-" + sym.toLowerCase(),
            coinId: cid,
            symbol: sym,
            name: name,
            qty: q,
            wallet: true,
          });
      } catch (e) {}
    }
    return rows;
  }

  async function refresh() {
    const w = await detect();
    W.store.set("wallets", w);
    let rows = [];
    if (w.evm) rows = rows.concat(await evm(w.evm));
    if (w.sol) rows = rows.concat(await sol(w.sol));
    W.store.set("wallet-holdings", rows);
    W.store.set("wallet-last", Date.now());
    return rows;
  }

  return {
    refresh: refresh,
    holdings: () => W.store.get("wallet-holdings", []) || [],
    wallets: () => W.store.get("wallets", {}) || {},
  };
})();
