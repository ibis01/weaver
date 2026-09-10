# Weaver

**Evidence‑Driven Crypto Decision Intelligence**

Weaver collects on‑chain and market signals, builds verifiable evidence, scores confidence, and explains what matters before you make a trade.

🔗 **Live demo:** [https://ibis01.github.io/weaver/](https://ibis01.github.io/weaver/)

---

## Architecture

**Local-first architecture** — Portfolio data, credentials, and decision intelligence remain primarily in the user's browser. An optional, hardened local proxy (`proxy-server.js`) is provided to securely route selected external data requests and mitigate CORS restrictions.

An optional **hardened proxy** (`proxy-server.js`) can be run locally or on a server to securely fetch external data (e.g., RSS news feeds) and bypass CORS when needed. The proxy is **not required** for core features like portfolio tracking, the Decision Engine, or Token Analysis.

| Component | Responsibility |
|-----------|----------------|
| **Client** | All UI, portfolio logic, evidence builder, decision engine, local storage |
| **Optional Proxy** | Secure, rate‑limited, allow‑listed fetching of external sources |
| **External APIs** | Market data, on‑chain data, news (used via proxy if available) |

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



---

## 🗺️ Roadmap

- [x] Token-specific decision analysis ("Should I buy this token?")
- [ ] Calibrate confidence scores using historical decision outcomes
- [ ] Improve contradictory evidence detection in assessments
- [ ] Expand source reliability evaluation (Evidence Strength metrics)