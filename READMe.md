# Weaver

**Evidence‑Driven Crypto Decision Intelligence**

Weaver collects on‑chain and market signals, builds verifiable evidence, scores confidence, and explains what matters before you make a trade.

🔗 **Live demo:** [https://ibis01.github.io/weaver/](https://ibis01.github.io/weaver/)

---

## What is Weaver?

Weaver is not a dashboard. It is a **decision‑intelligence layer** for crypto traders and investors.

Instead of showing raw data, Weaver:

1. **Collects signals** (price moves, on‑chain activity, unlocks, sentiment).
2. **Builds evidence** (source reliability, freshness, corroboration).
3. **Detects contradictions** (bullish vs. bearish evidence).
4. **Scores confidence** (calibrated from evidence strength).
5. **Generates explainable intelligence** (personalized context, risks, and recommended actions).

---

## How It Works

```text
DATA SOURCES
   ↓
NORMALIZATION
   ↓
SIGNALS
   ↓
EVIDENCE BUILDER
   ↓
PERSONAL CONTEXT
   ↓
ASSESSMENT
   ↓
DECISION ENGINE
   ↓
WHAT MATTERS NOW?
```

### Core Modules

| Module | Purpose |
|--------|---------|
| **Evidence Builder** | Converts raw signals into structured evidence with source reliability, freshness, and corroboration. |
| **Decision Engine** | Orchestrates evidence → context → assessment → priority. |
| **Thesis Health** | Evaluates investment theses against evidence, not just price. |
| **Decision Replay** | Evaluates past decisions using absolute, benchmark, risk, and calibration metrics. |
| **Token Risk Intelligence** | Audits contract security, honeypots, liquidity, and concentration risks. |

---

## Features (Tier 1)

- **Portfolio Tracking** – Weighted‑average cost basis, UNKNOWN cost basis, wallet sync.
- **Watchlist & Alerts** – Price, volume, and move alerts with browser notifications.
- **Coin Explorer** – Search, charts, on‑chain data, contract addresses.
- **Token Shield** – Contract security auditor (honeypot, mintable, proxy, tax detection).
- **Smart Money / Whale Tracker** – Multi‑chain wallet tracking with P/L reconstruction.
- **Gem Agent** – Autonomous new‑token hunter with evidence‑based scoring.
- **Unlock Calendar** – Upcoming vesting cliffs and emission schedules.
- **Decision Journal** – Log decisions, link theses, and replay outcomes.
- **Encrypted Sync** – Zero‑knowledge end‑to‑end encryption (PBKDF2 + AES‑256‑GCM).

---

## Security Model

- **No backend** – all data stays in your browser.
- **Credential encryption** – API keys and Telegram tokens are encrypted with a user‑defined passphrase.
- **Sync codes** – 128‑bit entropy, stored only as salted SHA‑256 hashes.
- **Hardened proxy** – domain allow‑list, private IP blocking, rate limiting, DNS rebinding prevention.

---

## Getting Started

```bash
git clone https://github.com/ibis01/weaver.git
cd weaver
npm install
node proxy-server.js           # optional, for RSS/news fallback
python3 -m http.server 8000     # or npx serve
```

Open `http://localhost:8000`.

---

## Testing

```bash
npm test
```

All 110+ tests pass (unit, integration, security, E2E).

---

## Roadmap

- [ ] Token‑specific decision analysis ("Should I buy this token?")
- [ ] Calibrated confidence scores with historical performance
- [ ] Integration with more on‑chain data sources (Etherscan, Solana)
- [ ] Portfolio stress testing and scenario analysis

---

## License

MIT

---

*Built with ❤️ by ibis01*