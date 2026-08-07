# 🚀 Weaver

**Crypto portfolio tracker with AI insights — private by design. No build step, no backend required.**

![version](https://img.shields.io/badge/version-1.0.0-7c5cff) ![license](https://img.shields.io/badge/license-MIT-2ee6a8) ![build](https://img.shields.io/badge/build-none%20required-ff5c7a) ![demo](https://img.shields.io/badge/demo-GitHub%20Pages-5cd6ff)

> **Live demo:** https://ibis01.github.io/weaver/

<p align="center"><img src="assets/logo.png" width="96" alt="Weaver logo"></p>

## ✨ Features

**Core**
- 📊 Dashboard — total balance, 24h/7d/all-time P/L, allocation chart
- 💼 Portfolio — holdings CRUD, buy/sell transactions, history
- ⭐ Watchlist · 🔍 Coin Explorer (charts, stats, contract addresses)
- 🚨 Alerts — price, % move, volume spikes (+ browser notifications)
- 📰 News with AI brief & sentiment · 📈 Fear & Greed, BTC dominance, heatmap, alt-season
- 🤖 AI — portfolio review, risk analysis, market summary, Ask Weaver (optional LLM key)
- 🌐 Web3 — MetaMask + Phantom connect · 💰 DeFi tracker · 🎯 Airdrop Hunter
- 📚 Learn (quizzes, streaks) · 👤 Profile & achievements

**Pro suite (included free in this build)**
- 🐋 Whale wallet tracker (live BTC/ETH on-chain feeds)
- 🧠 Smart Money tracker (top holders ranked by reconstructed P/L)
- 🔓 Token unlock calendar with sell-pressure scoring
- 🧮 Portfolio optimizer (target allocations → exact trade plan)
- ⚡ AI Trading Assistant (RSI/SMA/momentum signal engine)
- 🧾 Tax report CSV export
- ☁️ Multi-device sync — **zero-knowledge E2E encryption** (AES-256-GCM over Firebase)
- 📱 Installable PWA with offline cache

## 🏁 Quick start

```bash
# run locally — no build, no dependencies
open index.html          # or: npx serve / python3 -m http.server

# deploy
git push   # GitHub Pages: Settings → Pages → main / (root)
```

## 📁 Architecture

```
index.html            shell + nav + view router (hash-based)
style.css             full design system (dark, glass, gradient)
js/app.js             router, boot, auto-refresh loop, sync hook
js/api/prices.js      CoinGecko / news / fear-greed (cached)
js/storage/           localStorage abstraction (weaver:* keys)
js/ui/                modals, toasts, coin picker, dashboard
js/features/          portfolio · watchlist · explorer · alerts · news
                      market · ai · learn · web3 · misc · whales
                      smart · unlocks · optimizer · trader · sync
js/utils/             formatters + debounce
```

## 🔐 Privacy model

- All data lives in `localStorage` by default — nothing leaves the browser.
- Optional sync is **zero-knowledge**: PBKDF2(120k) → AES-256-GCM client-side; Firebase stores only ciphertext under SHA-256-hashed IDs.
- On-chain analytics use public CORS-open APIs — no keys, no accounts.

## 🌐 Data sources (free, no keys)

CoinGecko · CryptoCompare News · alternative.me · mempool.space · Blockscout

## ⚠️ Disclaimer

Educational tool. **Not financial advice.**

## 📄 License

MIT © 2026 ibis01