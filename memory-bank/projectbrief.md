# Weaver Project Brief

## What Weaver Is
Weaver is an **evidence-driven crypto intelligence and safety platform** that helps users:
- Discover opportunities
- Verify risks
- Understand available evidence
- Make their own decisions
- Track outcomes
- Learn from results

**Core Product Loop:** DISCOVER → VERIFY → UNDERSTAND → DECIDE → TRACK → LEARN

## What Weaver Is Not
- Not a custodial wallet or fund holder
- Not an automated trading system
- Not a financial advice provider
- Not a hype/engagement-optimized platform
- Not a paid promotion marketplace

## Major Capabilities

### Discovery
- **Gem Agent**: Scans for interesting assets based on evidence (liquidity, volume, momentum, holder distribution)
- **Market Context**: Global market cap, BTC dominance, Fear & Greed Index
- **Token Unlocks**: Upcoming token unlock calendar

### Verification
- **Token Shield**: Contract security auditing via GoPlus API (honeypot, mintable, proxy, LP locked, taxes, owner renounced)
- **Deployer Graph**: Tracks deployer wallet clusters and serial rugger patterns
- **Owner Associations**: Links tokens to owner wallets across chains

### Intelligence
- **Decision Engine**: Unified pipeline (Signal → Evidence → PersonalContext → Assessment → DecisionPriority)
- **Thesis Health**: Evaluates active investment theses against price action and regime
- **Market Regime Detection**: RISK-ON / TRANSITION / RISK-OFF classification
- **Technical Analysis**: OHLCV, ATR, RSI, BOS/CHOCH, SMC patterns

### Tracking
- **Track Record**: Immutable historical decision records with outcome tracking
- **Decision Replay**: Evaluates past decisions against actual outcomes
- **Portfolio**: Weighted-average cost basis, P/L tracking, allocation visualization

### Safety
- **Privacy-First**: All user data local by default, encrypted sync optional
- **Non-Custodial**: Never holds keys, never auto-signs, never executes trades
- **Transparency**: Every score includes reasoning, confidence, and evidence provenance

## Permanent Product Boundaries

### Constitutional Constraints (v1.0 §2)
1. **Non-Custodial** (§2.1): Never holds funds, keys, or signing authority
2. **Transparency Over Hype** (§2.2): Every score must show reasoning
3. **Track Record Includes Losses** (§2.3): No survivorship bias
4. **Never Financial Advice** (§2.4): No directive language ("buy now", "guaranteed")
5. **No Conflicts of Interest** (§2.5): Money cannot buy better scores
6. **Privacy First** (§2.6): Local storage default, encrypted sync optional
7. **Evidence Provenance** (§2.7): All claims traceable to sources
8. **AI Is Interpreter, Not Authority** (§2.8): Deterministic checks take precedence
9. **No False Precision** (§2.9): Confidence values must be defensible
10. **Safety Before Engagement** (§2.10): Clarity > virality

### Technical Constraints (v1.0 §3)
- **No Required Build Step**: Must run via `open index.html`
- **Module Contract**: `window.W = window.W || {}; W.<feature> = (() => { ... })();`
- **Chain Parity**: DISCOVERABLE_CHAINS ⊆ VERIFIED_CHAINS
- **Graceful Degradation**: API failures never crash UI
- **No Hard Dependency on Paid Keys**: Free path must work
- **Cache Before Repeated Calls**: TTL caching required
- **Deterministic Safety Logic**: Security checks cannot depend solely on LLM
- **Versioned Scoring**: Score versions must be distinguishable

## Version
- Constitution: v1.0 (Foundational)
- Global Readiness Verification: v2.0