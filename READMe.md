# Weaver

**Evidence‑Driven Crypto Decision Intelligence**

Weaver collects on‑chain and market signals, builds verifiable evidence, scores confidence, and explains what matters before you make a trade.

🔗 **Live demo:** [https://ibis01.github.io/weaver/](https://ibis01.github.io/weaver/)

---

## Architecture

Weaver is **local‑first**: your portfolio and decision data remain primarily in your browser.

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