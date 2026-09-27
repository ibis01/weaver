# Weaver Product Context

## User-Facing Principles

### Evidence-First Philosophy
- Every material claim must be traceable to evidence
- Distinguish: Observed Data → Derived Metrics → Inference → Estimation → AI Interpretation → User-Provided
- Missing evidence is preferable to invented evidence
- AI explains; it does not override deterministic checks

### Unknown/Missing Data Semantics
- **§6.3 Missing Data Must Reduce Confidence**: Never silently become a positive assumption
- **§2.9 No False Precision**: Unknown = null/"—", never 0 or fabricated value
- **§3.4 Graceful Degradation**: Failed dependencies show honest error states, not blank screens

**Examples:**
- Price unavailable → display "—", not "$0.00"
- Cost basis unknown → P/L shows "—", not fake "+100%"
- Holder data missing → "Holder analysis unavailable. Confidence reduced."
- Shield check failed → "Verification unavailable. No safety conclusion being made."

### Non-Custodial Boundaries
- All wallet actions occur through user's own wallet (Phantom, MetaMask)
- Weaver may: display info, prepare unsigned transactions, open wallet for signing
- Weaver must never: sign transactions, execute trades, take custody, store keys/seeds

### Track Record Principles (§2.3, §4.4, §6.4)
- **Losses Visible**: Winning calls cannot be selectively displayed
- **Immutable**: Historical records cannot be edited post-outcome
- **Auditable**: Preserve score version, evidence, timestamp, methodology
- **No Survivorship Bias**: "Weaver identified 20 winners" must also show unsuccessful calls
- **Methodology Documented**: Performance stats include time window and calculation method

Summary → Why? → Risks → Evidence → Sources → Technical Details


#### Calm Visual Language (§5.3)
- Serious intelligence product, not casino/cyberpunk terminal
- Clear hierarchy, strong typography, calm surfaces
- Color communicates meaning: Neutral=info, Green=positive, Yellow=caution, Red=risk, Accent=action
- Avoid: neon overload, excessive gradients, glassmorphism, constant animations, FOMO UI

#### No FOMO Design (§4.3)
- No fake countdowns, "LAST CHANCE", artificial scarcity
- No guaranteed-upside language
- No excessive flashing price movement
- Real market urgency may be displayed when factual and contextualized

#### Accessibility (§5.4)
- Keyboard navigation, visible focus states
- Semantic headings, accessible labels
- Sufficient contrast, screen-reader compatibility
- Reduced-motion preferences respected
- Touch targets ~44×44px minimum

## Important Behavioral Rules

### Score Presentation (§2.2)
Every user-facing score must include:
- Score value
- Confidence/uncertainty
- Positive factors
- Negative factors
- Risk factors
- Supporting evidence
- Data timestamp
- Methodology/version


### AI Usage (§2.8)
**AI May:**
- Summarize evidence
- Explain deterministic analysis
- Classify information
- Identify relationships between verified signals

**AI Must Not:**
- Invent evidence or sources
- Fabricate market data or historical outcomes
- Override deterministic security checks
- Secretly modify scoring weights
- Turn uncertainty into certainty
- Present speculation as verified fact


Raw Data → Deterministic Analysis → Security/Risk Checks → Evidence → AI Explanation → User

Raw Data → AI Guess → Trading Conclusion

### Community Features (§4.1, §4.2, §4.5)
- Auto-posting is opt-in with user-controlled thresholds
- Dashboard shows both gains and losses from historical alerts
- Outcome learning preserves historical versions, avoids hindsight contamination
- Distinguish correlation from causation, never claim predictive certainty

## Constitutional Compliance Checklist
Every feature must satisfy (from v1.0 §8):
- [ ] Works with zero API keys (or documents optional key requirement)
- [ ] External failures degrade gracefully
- [ ] No blank screens from failed dependencies
- [ ] Repeated API calls use TTL caching
- [ ] User-facing scores show reasoning
- [ ] Material claims traceable to evidence
- [ ] AI does not fabricate evidence
- [ ] Scoring methodology versioned
- [ ] Never takes custody of funds
- [ ] No directive/guaranteed language
- [ ] User data local by default
- [ ] External data transmission requires explicit opt-in
- [ ] Chain parity maintained (discovery ⊆ verification)
- [ ] Mobile layouts work
- [ ] Accessibility requirements satisfied
- [ ] Reduced-motion preferences respected