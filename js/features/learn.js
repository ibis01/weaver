//  Comprehensive Crypto & Web3 Education

window.W = window.W || {};

W.learn = (() => {
  // ── Extensive Lesson Library ──────────────────────────
  const LESSONS = [
    // ── Fundamentals ──────────────────────────────────────
    {
      id: "what-is-crypto",
      icon: "🪙",
      title: "What is Cryptocurrency?",
      category: "Fundamentals",
      body: `
        Cryptocurrency is digital money that uses cryptography for security.
        Unlike traditional currencies (fiat), it operates on decentralized networks
        based on blockchain technology — a distributed ledger enforced by a network of computers.
        <br><br>
        <b>Key properties:</b>
        <ul>
          <li><b>Decentralized:</b> No single entity controls it.</li>
          <li><b>Borderless:</b> Transfer value anywhere instantly.</li>
          <li><b>Limited supply:</b> Many cryptos have a capped supply.</li>
          <li><b>Transparent:</b> All transactions are public on the blockchain.</li>
        </ul>
      `,
      quiz: {
        q: "What is the core technology behind cryptocurrencies?",
        a: ["Blockchain", "AI", "Cloud", "Quantum computing"],
        correct: 0,
      },
    },
    {
      id: "how-blockchain-works",
      icon: "⛓️",
      title: "How Blockchain Works",
      category: "Fundamentals",
      body: `
        A blockchain is a chain of blocks containing transaction data.
        Each block has a cryptographic hash of the previous block, creating an immutable chain.
        <br><br>
        <b>Key concepts:</b>
        <ul>
          <li><b>Blocks:</b> Contain transaction data, timestamp, and previous hash.</li>
          <li><b>Hashing:</b> A one-way function that converts data into a fixed-length string.</li>
          <li><b>Consensus:</b> Mechanisms like Proof-of-Work (PoW) or Proof-of-Stake (PoS) to agree on the ledger state.</li>
          <li><b>Nodes:</b> Computers that validate and store the blockchain.</li>
        </ul>
      `,
      quiz: {
        q: "What does a block contain? (Select all that apply)",
        a: [
          "Transaction data",
          "Previous block hash",
          "Timestamp",
          "All of the above",
        ],
        correct: 3,
      },
    },
    {
      id: "wallets-security",
      icon: "🔐",
      title: "Wallet Security 101",
      category: "Security",
      body: `
        Crypto wallets store your private keys — the secret that proves ownership of your assets.
        <br><br>
        <b>Wallet types:</b>
        <ul>
          <li><b>Hot wallets:</b> Connected to the internet (MetaMask, Phantom). Convenient but riskier.</li>
          <li><b>Cold wallets:</b> Offline storage (Ledger, Trezor). Most secure.</li>
          <li><b>Multi-sig:</b> Requires multiple signatures for transactions.</li>
        </ul>
        <br>
        <b>Golden rules:</b>
        <ul>
          <li>Never share your seed phrase (12/24 words).</li>
          <li>Use hardware wallets for long-term holdings.</li>
          <li>Revoke unused contract approvals.</li>
          <li>Enable two-factor authentication where possible.</li>
        </ul>
      `,
      quiz: {
        q: "What is the most secure way to store crypto?",
        a: [
          "Hardware wallet",
          "Exchange wallet",
          "Mobile wallet",
          "Paper wallet (if done correctly)",
        ],
        correct: 0,
      },
    },
    // ── DeFi ──────────────────────────────────────────────
    {
      id: "defi-basics",
      icon: "🏦",
      title: "DeFi Basics",
      category: "DeFi",
      body: `
        Decentralized Finance (DeFi) recreates traditional financial services on blockchains without intermediaries.
        <br><br>
        <b>Core DeFi services:</b>
        <ul>
          <li><b>Lending & Borrowing:</b> Lend assets to earn interest, or borrow against your crypto (e.g., Aave, Compound).</li>
          <li><b>Decentralized Exchanges (DEXs):</b> Swap tokens peer-to-peer (e.g., Uniswap, PancakeSwap).</li>
          <li><b>Yield Farming:</b> Provide liquidity to earn rewards.</li>
          <li><b>Staking:</b> Lock tokens to support a network and earn rewards.</li>
        </ul>
        <br>
        <b>Risks:</b> Smart contract bugs, impermanent loss, liquidation, and protocol failure.
      `,
      quiz: {
        q: "What is impermanent loss?",
        a: [
          "Loss of funds due to price changes in a liquidity pool",
          "Loss from hacks",
          "Loss from forgetting your password",
          "Loss from market crashes",
        ],
        correct: 0,
      },
    },
    {
      id: "dex-vs-cex",
      icon: "🔄",
      title: "DEX vs CEX: What's the Difference?",
      category: "DeFi",
      body: `
        <b>Centralized Exchanges (CEX):</b> Binance, Coinbase, Kraken.
        They hold your funds and match orders on a central order book.
        <br><br>
        <b>Decentralized Exchanges (DEX):</b> Uniswap, PancakeSwap, SushiSwap.
        They use smart contracts and liquidity pools, allowing peer-to-peer trading without custody.
        <br><br>
        <b>Comparison:</b>
        <ul>
          <li><b>Security:</b> DEXs are less prone to exchange hacks (no central honeypot), but smart contract risks exist.</li>
          <li><b>Privacy:</b> DEXs require no KYC.</li>
          <li><b>Fees:</b> CEXs have higher fees, but offer more liquidity.</li>
          <li><b>Usability:</b> CEXs are easier for beginners.</li>
        </ul>
      `,
      quiz: {
        q: "Which type of exchange holds your private keys?",
        a: ["CEX", "DEX", "Both", "Neither"],
        correct: 0,
      },
    },
    // ── NFTs ──────────────────────────────────────────────
    {
      id: "nft-guide",
      icon: "🎨",
      title: "NFTs Explained",
      category: "NFTs",
      body: `
        Non-Fungible Tokens (NFTs) are unique digital assets representing ownership of a specific item.
        <br><br>
        <b>Use cases:</b>
        <ul>
          <li><b>Art & Collectibles:</b> Digital art, trading cards, virtual real estate.</li>
          <li><b>Gaming:</b> In-game items, skins, characters.</li>
          <li><b>Music & Media:</b> Royalty rights, exclusive content.</li>
          <li><b>Identity:</b> Digital IDs, credentials.</li>
        </ul>
        <br>
        <b>Important:</b> NFTs are bought/sold on marketplaces like OpenSea, Rarible. They live on blockchains (Ethereum, Solana, etc.).
      `,
      quiz: {
        q: "What does 'non-fungible' mean?",
        a: [
          "Unique and not interchangeable",
          "Highly valuable",
          "Only on Ethereum",
          "Free to mint",
        ],
        correct: 0,
      },
    },
    // ── Web3 ──────────────────────────────────────────────
    {
      id: "web3-intro",
      icon: "🌐",
      title: "Introduction to Web3",
      category: "Web3",
      body: `
        Web3 is the vision of a decentralized internet built on blockchain technology.
        <br><br>
        <b>Core principles:</b>
        <ul>
          <li><b>Decentralization:</b> No single authority controls data.</li>
          <li><b>User ownership:</b> Users own their data and digital assets.</li>
          <li><b>Trustless:</b> Interactions are governed by code (smart contracts).</li>
          <li><b>Native payments:</b> Built-in crypto payments.</li>
        </ul>
        <br>
        <b>Web3 stack:</b> Blockchain (Ethereum, Solana), Smart Contracts, IPFS (storage), Wallets (MetaMask), dApps.
      `,
      quiz: {
        q: "What is a key feature of Web3?",
        a: [
          "User ownership of data",
          "Centralized servers",
          "No authentication",
          "Only for gaming",
        ],
        correct: 0,
      },
    },
    {
      id: "smart-contracts",
      icon: "📜",
      title: "Smart Contracts",
      category: "Web3",
      body: `
        Smart contracts are self-executing programs on the blockchain that run exactly as programmed.
        <br><br>
        <b>Characteristics:</b>
        <ul>
          <li><b>Autonomous:</b> No intermediary needed.</li>
          <li><b>Transparent:</b> Code is public and auditable.</li>
          <li><b>Immutable:</b> Cannot be changed once deployed.</li>
          <li><b>Programmable:</b> Can hold and transfer assets based on conditions.</li>
        </ul>
        <br>
        They are the backbone of DeFi, NFTs, and DAOs.
      `,
      quiz: {
        q: "What language is most commonly used for Ethereum smart contracts?",
        a: ["Solidity", "Python", "JavaScript", "Rust"],
        correct: 0,
      },
    },
    // ── Trading ───────────────────────────────────────────
    {
      id: "trading-basics",
      icon: "📊",
      title: "Crypto Trading Basics",
      category: "Trading",
      body: `
        Trading crypto involves buying and selling assets to profit from price movements.
        <br><br>
        <b>Key concepts:</b>
        <ul>
          <li><b>Spot trading:</b> Buying/selling actual crypto.</li>
          <li><b>Leverage trading:</b> Borrowing funds to amplify positions.</li>
          <li><b>Limit orders:</b> Set a specific price to buy/sell.</li>
          <li><b>Market orders:</b> Buy/sell at the current market price.</li>
        </ul>
        <br>
        <b>Risk management:</b> Set stop-losses, diversify, never invest more than you can afford to lose.
      `,
      quiz: {
        q: "What is a stop-loss order?",
        a: [
          "An order to sell if price drops to a certain level",
          "An order to buy at market price",
          "A limit order",
          "A type of leverage",
        ],
        correct: 0,
      },
    },
    {
      id: "technical-analysis",
      icon: "📈",
      title: "Technical Analysis",
      category: "Trading",
      body: `
        Technical analysis (TA) uses historical price and volume data to predict future movements.
        <br><br>
        <b>Common tools:</b>
        <ul>
          <li><b>Moving averages (SMA, EMA):</b> Smooth out price action.</li>
          <li><b>RSI:</b> Measures overbought/oversold conditions.</li>
          <li><b>MACD:</b> Trend-following momentum indicator.</li>
          <li><b>Support/Resistance:</b> Key price levels.</li>
        </ul>
        <br>
        TA is not foolproof — combine with fundamental analysis and risk management.
      `,
      quiz: {
        q: "What does RSI stand for?",
        a: [
          "Relative Strength Index",
          "Relative Strength Indicator",
          "Risk Sensitivity Index",
          "Rate of Speed Indicator",
        ],
        correct: 0,
      },
    },
    // ── Advanced ──────────────────────────────────────────
    {
      id: "staking-yield",
      icon: "🌾",
      title: "Staking & Yield Farming",
      category: "DeFi",
      body: `
        <b>Staking:</b> Locking your tokens to support a network (Proof-of-Stake) and earn rewards.
        <br><br>
        <b>Yield Farming:</b> Providing liquidity to DEXs or lending protocols to earn yields.
        <br><br>
        <b>Risks:</b>
        <ul>
          <li><b>Impermanent loss:</b> When the price of deposited tokens changes.</li>
          <li><b>Smart contract risk:</b> Bugs or exploits.</li>
          <li><b>Liquidity risk:</b> Unable to withdraw during high demand.</li>
        </ul>
      `,
      quiz: {
        q: "What is the main reward for staking?",
        a: [
          "Network rewards (inflation)",
          "Trading fees",
          "Airdrops",
          "Governance rights",
        ],
        correct: 0,
      },
    },
    {
      id: "dao-governance",
      icon: "🗳️",
      title: "DAOs and Governance",
      category: "Web3",
      body: `
        DAOs (Decentralized Autonomous Organizations) are communities governed by smart contracts and token holders.
        <br><br>
        <b>How it works:</b>
        <ul>
          <li><b>Tokens:</b> Voting power proportional to holdings.</li>
          <li><b>Proposals:</b> Anyone can submit changes.</li>
          <li><b>Voting:</b> Token holders vote on proposals.</li>
          <li><b>Execution:</b> If passed, the smart contract executes the change.</li>
        </ul>
        <br>
        Examples: Uniswap DAO, Aave DAO, MakerDAO.
      `,
      quiz: {
        q: "What is a DAO?",
        a: [
          "A decentralized community governed by code",
          "A centralized corporation",
          "A type of wallet",
          "A cryptocurrency exchange",
        ],
        correct: 0,
      },
    },
    {
      id: "bridges-crosschain",
      icon: "🌉",
      title: "Bridges & Cross-chain Interoperability",
      category: "Advanced",
      body: `
        Blockchains are silos. Bridges allow assets and data to move between different chains.
        <br><br>
        <b>Types of bridges:</b>
        <ul>
          <li><b>Trusted bridges:</b> Centralized validators (e.g., Binance Bridge).</li>
          <li><b>Trustless bridges:</b> Decentralized validators (e.g., Synapse, Across).</li>
        </ul>
        <br>
        <b>Risks:</b> Smart contract bugs (e.g., Ronin Bridge hack), centralization, and liquidity fragmentation.
      `,
      quiz: {
        q: "What is a blockchain bridge?",
        a: [
          "A protocol that connects different blockchains",
          "A new type of token",
          "A hardware wallet",
          "A mining pool",
        ],
        correct: 0,
      },
    },
    {
      id: "zk-rollups",
      icon: "🔮",
      title: "Scaling Solutions: ZK-Rollups & Optimistic Rollups",
      category: "Advanced",
      body: `
        Rollups are Layer 2 solutions that process transactions off-chain and post proofs to Layer 1.
        <br><br>
        <b>ZK-Rollups:</b> Use zero-knowledge proofs to bundle thousands of transactions into a single proof.
        <br><br>
        <b>Optimistic Rollups:</b> Assume transactions are valid unless challenged (fraud proofs).
        <br><br>
        Both increase throughput and reduce gas fees.
      `,
      quiz: {
        q: "Which rollup uses fraud proofs?",
        a: ["Optimistic Rollups", "ZK-Rollups", "Both", "Neither"],
        correct: 0,
      },
    },
    // ── Ecosystem ──────────────────────────────────────────
    {
      id: "eth-ecosystem",
      icon: "⟠",
      title: "Ethereum Ecosystem",
      category: "Ecosystem",
      body: `
        Ethereum is the leading smart contract platform. Its ecosystem includes:
        <ul>
          <li><b>DeFi:</b> Aave, Uniswap, MakerDAO, Lido.</li>
          <li><b>NFTs:</b> OpenSea, Rarible, CryptoPunks.</li>
          <li><b>Layer 2:</b> Arbitrum, Optimism, Base.</li>
          <li><b>DAOs:</b> ENS, Gitcoin, Uniswap DAO.</li>
          <li><b>Wallets:</b> MetaMask, Rainbow, Frame.</li>
        </ul>
      `,
      quiz: {
        q: "What is the native token of Ethereum?",
        a: ["ETH", "BTC", "SOL", "AVAX"],
        correct: 0,
      },
    },
    {
      id: "sol-ecosystem",
      icon: "🟣",
      title: "Solana Ecosystem",
      category: "Ecosystem",
      body: `
        Solana is a high-performance blockchain with low fees and fast finality.
        <br><br>
        <b>Key projects:</b>
        <ul>
          <li><b>DEXs:</b> Jupiter, Raydium.</li>
          <li><b>DeFi:</b> Marinade Finance, Orca.</li>
          <li><b>NFTs:</b> Magic Eden, Tensor.</li>
          <li><b>Gaming:</b> Star Atlas, Aurory.</li>
          <li><b>Wallets:</b> Phantom, Solflare.</li>
        </ul>
      `,
      quiz: {
        q: "What consensus mechanism does Solana use?",
        a: [
          "Proof-of-History (PoH)",
          "Proof-of-Work (PoW)",
          "Proof-of-Stake (PoS)",
          "Proof-of-Authority (PoA)",
        ],
        correct: 0,
      },
    },
    {
      id: "btc-ecosystem",
      icon: "₿",
      title: "Bitcoin Ecosystem",
      category: "Ecosystem",
      body: `
        Bitcoin is the first and largest cryptocurrency. Its ecosystem is simpler than Ethereum's but growing.
        <br><br>
        <b>Key players:</b>
        <ul>
          <li><b>Wallets:</b> Electrum, Ledger, Trezor.</li>
          <li><b>Lightning Network:</b> Layer 2 solution for fast, cheap payments.</li>
          <li><b>Mining:</b> The backbone of Bitcoin's security.</li>
          <li><b>Exchanges:</b> Binance, Coinbase, Kraken.</li>
        </ul>
        <br>
        Bitcoin is primarily a store of value and medium of exchange.
      `,
      quiz: {
        q: "What is the Lightning Network?",
        a: [
          "A Layer 2 scaling solution for Bitcoin",
          "A new Bitcoin fork",
          "A hardware wallet",
          "A mining pool",
        ],
        correct: 0,
      },
    },
  ];

  // ── State ───────────────────────────────────────────────
  const KEY = "learn";
  const prog = () => W.store.get(KEY, { done: [], progress: {} });

  function saveProgress(p) {
    W.store.set(KEY, p);
  }

  // ── Helpers ─────────────────────────────────────────────
  function escapeHTML(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function getCategories() {
    const cats = new Set(LESSONS.map((l) => l.category));
    return Array.from(cats);
  }

  function getLessonsByCategory(category) {
    return LESSONS.filter((l) => l.category === category);
  }

  // ── Render Main View ────────────────────────────────────
  function render(view, filter = "all") {
    const p = prog();
    const done = p.done || [];
    const categories = getCategories();

    let filtered = LESSONS;
    if (filter !== "all") {
      filtered = LESSONS.filter((l) => l.category === filter);
    }

    view.innerHTML = `
      <div class="card">
        <div class="watch-head">
          <h3>📚 Learn Crypto & Web3</h3>
          <div class="qa">
            <button class="chip active" data-filter="all">All</button>
            ${categories.map((c) => `<button class="chip" data-filter="${c}">${c}</button>`).join("")}
          </div>
        </div>
        <div class="meter">
          <div class="meter-label">Progress <b>${done.length}/${LESSONS.length}</b></div>
          <div class="meter-bar"><div style="width:${(done.length / LESSONS.length) * 100}%"></div></div>
        </div>
      </div>
      <div class="grid-2" id="learn-grid">
        ${filtered
          .map(
            (l) => `
          <div class="card lesson ${done.includes(l.id) ? "done" : ""}">
            <div class="lesson-ico">${l.icon}</div>
            <h3>${escapeHTML(l.title)}</h3>
            <span class="tag rank">${escapeHTML(l.category)}</span>
            <p class="muted small">${escapeHTML(l.body.replace(/<[^>]+>/g, "").slice(0, 100))}…</p>
            <button class="btn ${done.includes(l.id) ? "" : "primary"}" data-open="${l.id}">
              ${done.includes(l.id) ? "✓ Completed — Review" : "Start Lesson"}
            </button>
          </div>
        `,
          )
          .join("")}
      </div>
    `;

    // ── Filter buttons ──────────────────────────────────
    view.querySelectorAll("[data-filter]").forEach((btn) => {
      btn.onclick = () => {
        view
          .querySelectorAll("[data-filter]")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        render(view, btn.dataset.filter);
      };
    });

    // ── Open lesson buttons ────────────────────────────
    view.querySelectorAll("[data-open]").forEach((btn) => {
      btn.onclick = () => openLesson(btn.dataset.open);
    });
  }

  // ── Open Lesson Modal ──────────────────────────────────
  function openLesson(id) {
    const l = LESSONS.find((x) => x.id === id);
    if (!l) return;

    const p = prog();
    const done = p.done || [];
    const isCompleted = done.includes(l.id);

    const m = W.ui.modal({
      title: `${l.icon} ${escapeHTML(l.title)}`,
      body: `
        <span class="tag rank">${escapeHTML(l.category)}</span>
        <div style="line-height:1.7;margin-top:12px;">${l.body}</div>
        <div class="mt">
          <b>Quiz:</b> ${escapeHTML(l.quiz.q)}
          ${l.quiz.a
            .map(
              (a, i) => `
            <label class="quiz-opt">
              <input type="radio" name="quiz" value="${i}">
              ${escapeHTML(a)}
            </label>
          `,
            )
            .join("")}
        </div>
        <div id="quiz-fb" class="mt"></div>
      `,
      footer: `
        <button class="btn ghost" id="quiz-close">Close</button>
        <button class="btn primary" id="quiz-go">Check Answer</button>
      `,
    });

    m.el.querySelector("#quiz-close").onclick = m.close;

    m.el.querySelector("#quiz-go").onclick = () => {
      const sel = m.el.querySelector("input[name=quiz]:checked");
      const fb = m.el.querySelector("#quiz-fb");
      if (!sel) {
        fb.innerHTML = '<p class="muted">Pick an answer first.</p>';
        return;
      }
      const selected = +sel.value;
      const correct = l.quiz.correct;
      if (selected === correct) {
        const p = prog();
        if (!p.done.includes(l.id)) {
          p.done.push(l.id);
          saveProgress(p);
        }
        fb.innerHTML = '<p class="up"><b>Correct! 🎉 Lesson complete.</b></p>';
        // Unlock achievement
        if (W.achievements) W.achievements.check();
        // Refresh the main view
        const mainView = document.getElementById("view");
        if (mainView && mainView.querySelector("#learn-grid")) {
          render(mainView);
        }
        setTimeout(() => m.close(), 1200);
      } else {
        fb.innerHTML = '<p class="down">Not quite — try again!</p>';
      }
    };
  }

  // ── Exports ─────────────────────────────────────────────
  return {
    render,
    openLesson,
    LESSONS,
    getCategories,
    getLessonsByCategory,
    prog,
  };
})();

console.log("[Learn] Module loaded.");
