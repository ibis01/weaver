# Weaver Constitution

**Version:** 1.0
**Status:** Foundational
**Applies to:** Every feature, module, scoring system, AI system, API, UI surface, automation, integration, pull request, and future extension of Weaver.

---

# Preamble

This document governs how Weaver is built, what it prioritizes, and what it must never become.

Every feature, module, architectural change, automated workflow, and pull request must be checked against this constitution before merge.

If a feature conflicts with this constitution, **the feature does not ship** unless the constitution itself is formally changed according to the process defined in Section 7.

Weaver exists to make meme-coin research:

* Faster
* Clearer
* More evidence-driven
* Safer

for its users and community.

Weaver does **not** exist to manufacture trading confidence, maximize engagement at the expense of decision quality, or profit from users' losses.

> **If a feature increases engagement but degrades decision quality, it does not ship.**

---

# 1. Purpose

Weaver is an **evidence-driven crypto intelligence and safety platform**.

Its job is to help users:

1. Discover opportunities.
2. Verify risks.
3. Understand the available evidence.
4. Make their own decisions.
5. Track outcomes.
6. Learn from historical results.

The core Weaver loop is:

```text
DISCOVER
    ↓
VERIFY
    ↓
UNDERSTAND
    ↓
DECIDE
    ↓
TRACK
    ↓
LEARN
```

Weaver provides information, analysis, evidence, and tools.

**The user remains responsible for the final decision.**

---

# 2. Non-Negotiable Principles

## 2.1 Non-Custodial, Always

Weaver never holds:

* User funds
* Private keys
* Seed phrases
* Recovery phrases
* Signing authority

All wallet actions occur through the user's own wallet, such as Phantom or MetaMask.

Weaver may:

* Display wallet information.
* Prepare transaction information.
* Prepare an unsigned transaction where technically appropriate.
* Open the user's wallet for signing.

Weaver must never:

* Sign transactions on behalf of the user.
* Execute trades without explicit user authorization.
* Take custody of funds.
* Store private keys or seed phrases.
* Become a custodial trading service.
* Become a managed portfolio service.

Features such as:

* Auto-trading
* Autonomous buying/selling
* Managed portfolios
* Custodial vaults
* Automated signing

would require a **new constitution**, not an ordinary feature amendment.

---

## 2.2 Transparency Over Hype

Every user-facing score, ranking, alert, or verdict produced by Weaver must include understandable reasoning.

This applies to:

* Gem Agent
* Token Shield
* Token Analysis
* Alerts
* AI-generated conclusions
* Future scoring systems

A score without visible reasoning must not reach a user-facing surface.

Where applicable, Weaver should expose:

* Score
* Confidence or uncertainty
* Positive factors
* Negative factors
* Risk factors
* Supporting evidence
* Data timestamp
* Scoring methodology/version

Example:

```text
WEAVER SCORE
82 / 100

Why:
+ Strong liquidity
+ Healthy volume/liquidity ratio
+ Positive momentum
− High holder concentration
− Very young token

Risk:
Elevated
```

A score must communicate evidence, not manufacture confidence.

---

## 2.3 Track Record Includes Losses

Any public:

* Leaderboard
* Called It feature
* Track record
* Performance statistic
* Published call history
* Telegram/X performance feed

must show unsuccessful calls with the same visibility as successful calls.

Winning calls may not be selectively displayed while losing calls are:

* Hidden
* Deleted
* Excluded
* Visually minimized
* Reclassified after the outcome

Performance statistics must define:

* Measurement period
* Sample size
* Methodology
* Outcome definition

**Survivorship-biased performance reporting is prohibited.**

Historical results must never be presented as guarantees of future performance.

---

## 2.4 Never Financial Advice

Weaver does not present analysis as guaranteed financial advice or a command to trade.

Prohibited framing includes:

* “Buy now.”
* “Sell now.”
* “Guaranteed profit.”
* “Cannot lose.”
* “100% safe.”
* “Guaranteed moon.”
* “You should buy this.”
* Artificial urgency intended to pressure a decision.

Preferred framing describes evidence and uncertainty:

> “Liquidity is healthy, momentum is strong, but holder concentration is elevated.”

> “Opportunity signals are strong; contract risk remains elevated.”

> “The available evidence is mixed.”

The decision remains with the user.

The disclaimer:

> **Educational tool. Not financial advice.**

must remain visible on every meme-coin-facing view.

### No Directive Laundering

Displaying a disclaimer does not permit Weaver to issue an otherwise prohibited trading directive.

The product must remain evidence-oriented even when a disclaimer is present.

---

## 2.5 No Conflicts of Interest

Weaver must never accept payment or incentives to:

* Increase a token's score.
* Decrease a token's risk rating.
* Promote a token in organic discovery.
* Suppress a risk flag.
* Alter organic rankings.
* Hide negative evidence.

If sponsored content is introduced, it must be:

1. Structurally separated from the scoring engine.
2. Clearly labeled.
3. Unable to modify organic scores or risk flags.

> **Money must never buy a better Weaver score.**

---

## 2.6 Privacy First

User data should remain local by default where technically appropriate.

This includes:

* Holdings
* Watchlists
* Journal entries
* Portfolio activity
* User preferences

Optional synchronization must remain zero-knowledge end-to-end encrypted as designed.

Weaver must not send:

* Holdings
* Watchlists
* Wallet addresses
* Portfolio activity
* Sensitive user activity

to third parties without an **explicit, separate opt-in**.

A general terms-of-service acceptance does not constitute consent for such data sharing.

Third-party integrations must receive only the minimum information required for their function.

---

## 2.7 Evidence Provenance

Every material factual claim, score component, risk flag, and analytical conclusion must be traceable to its underlying evidence whenever technically possible.

Weaver must distinguish between:

* **Observed data**
* **Derived metrics**
* **Inference**
* **Estimation**
* **AI interpretation**
* **User-provided information**

Where practical, evidence should include:

* Source
* Timestamp
* Relevant metric
* Calculation/methodology
* Data freshness

Weaver must never fabricate:

* Market data
* Liquidity
* Holder information
* Transactions
* Wallet activity
* Security findings
* Historical outcomes
* Sources
* Citations
* Community activity

If required evidence is unavailable, Weaver must say so.

> **Missing evidence is preferable to invented evidence.**

---

## 2.8 AI Is an Interpreter, Not an Authority

AI may:

* Summarize evidence.
* Explain deterministic analysis.
* Classify information.
* Identify relationships between verified signals.
* Help users understand complex data.

AI must never:

* Invent evidence.
* Invent sources.
* Invent market data.
* Fabricate historical outcomes.
* Override deterministic security checks.
* Secretly modify scoring weights.
* Turn uncertainty into certainty.
* Present speculation as verified fact.

The preferred architecture is:

```text
RAW DATA
   ↓
DETERMINISTIC ANALYSIS
   ↓
SECURITY / RISK CHECKS
   ↓
EVIDENCE
   ↓
AI EXPLANATION
   ↓
USER
```

Not:

```text
RAW DATA
   ↓
AI GUESS
   ↓
TRADING CONCLUSION
```

Deterministic security and risk controls take precedence over AI interpretation.

---

## 2.9 No False Precision

Scores, confidence values, probabilities, rankings, and performance statistics must not imply more certainty than the underlying methodology supports.

Avoid meaningless precision such as:

```text
Confidence: 97.83%
```

unless the methodology genuinely supports that level of precision.

Users must be able to understand:

* What a score means.
* How it is produced.
* What its limitations are.

A number should communicate information, not manufacture authority.

---

## 2.10 Safety Before Engagement

Weaver must never optimize engagement at the expense of decision quality.

The following are not valid reasons to ship a feature:

* “It keeps users scrolling.”
* “It makes tokens more exciting.”
* “It creates FOMO.”
* “It increases clicks” while reducing clarity.
* “Competitors do it.”

Product decisions should prioritize:

```text
CLARITY
   ↓
EVIDENCE
   ↓
SAFETY
   ↓
USEFULNESS
```

before:

```text
ENGAGEMENT
   ↓
VIRALITY
   ↓
RETENTION
```

---

## 2.11 User Control

Users must remain in control of actions that materially affect:

* Funds
* Wallets
* Data sharing
* Notifications
* Publishing
* External integrations

Weaver should not make irreversible or consequential decisions on behalf of users without explicit authorization.

---

# 3. Technical Conventions

## 3.1 No Required Build Step

Weaver must remain runnable locally without a build system.

The baseline application must continue to support:

```text
open index.html
```

Vanilla JavaScript remains the default architecture.

A build/bundle system such as:

```text
build.js
dist/
```

may exist as an optional optimization.

It must never become a requirement for baseline local functionality.

---

## 3.2 Module Contract

Feature modules should follow the established Weaver pattern:

```js
window.W = window.W || {};

W.<feature> = (() => {
  async function render(view) {
    // ...
  }

  return { render };
})();
```

New modules should follow this contract unless there is a documented, team-agreed technical reason to diverge.

Genuine use of ES modules or another architecture is acceptable when technically justified.

Unnecessary architectural churn is not.

---

## 3.3 Chain Parity Requirement

Any blockchain supported by Gem Agent discovery must also have a corresponding Token Shield verification path **before discovery of that chain is enabled by default.**

Formally:

```text
DISCOVERABLE_CHAINS ⊆ VERIFIED_CHAINS
```

Discovery without matching verification does not ship as a default experience.

The intended flow is:

```text
DISCOVER
   ↓
VERIFY
   ↓
UNDERSTAND
   ↓
DECIDE
```

Adding a new chain requires consideration of:

* Discovery
* Verification
* Data sources
* Risk coverage
* Failure handling
* UI coverage

---

## 3.4 Graceful Degradation

External API failures must never crash a user-facing view.

Every fetch wrapper must handle its own failures and provide a useful UI state.

Example:

```text
Market data unavailable

We couldn't reach this data source.
Your saved portfolio is still available.

[ Retry ]
```

For security data:

```text
Security provider unavailable

We couldn't complete verification.

No safety conclusion is being made from
missing data.

[ Retry ]
```

Failures must never result in:

* Blank screens
* Unhandled promise rejections
* Broken navigation
* Silent failure
* Fabricated fallback data

---

## 3.5 No Hard Dependency on Paid Keys

The default free path should work without paid API keys wherever technically possible.

Paid providers may provide:

* Higher limits
* Better data
* Additional chain coverage
* Premium analytics

but remain additive enhancements.

A paid provider must not silently become a hard requirement for baseline Weaver functionality.

---

## 3.6 Cache Before Repeated API Calls

Repeated external requests must use an appropriate TTL cache.

Reuse established caching patterns where possible.

Caching exists to:

* Respect rate limits.
* Reduce network traffic.
* Improve responsiveness.
* Reduce dependence on flaky providers.
* Improve degraded/offline behavior.

No feature should repeatedly call an external endpoint without a justified reason.

---

## 3.7 Deterministic Safety Logic

Security-critical calculations must not depend solely on an LLM.

This includes:

* Contract risk checks
* Holder concentration
* Liquidity calculations
* Known exploit indicators
* Wallet verification
* Transaction verification
* Risk thresholds

AI may explain deterministic results.

AI must not silently replace them.

---

## 3.8 Versioned Scoring

Every scoring algorithm must have an identifiable version.

When scoring weights or logic change:

```text
Score v1
Score v2
Score v3
```

must remain distinguishable.

Historical alerts retain:

* Original score
* Original score version
* Original timestamp
* Relevant historical evidence where available

Past results must never be silently recalculated using a newer model in a way that improves historical performance presentation.

---

## 3.9 No Silent Methodology Changes

Any material change to:

* Scoring
* Risk thresholds
* Ranking
* Performance calculations
* Security methodology

must be documented.

Users must not unknowingly compare results generated under incompatible methodologies.

---

# 4. Community & Content Principles

## 4.1 Auto-Posting Is Opt-In

Telegram/X automation must never spam users or communities.

Users control:

* Score threshold
* Alert categories
* Frequency
* Destination
* Enable/disable state

Example:

```text
Publish when:

Weaver Score ≥ 80
AND
Risk ≤ Moderate

Maximum: 5 alerts/day
```

Weaver must not automatically publish everything it scans.

---

## 4.2 Safety Visibility

The dashboard should show both potential gains and losses associated with historical alert behavior where sufficient data exists.

Example:

> “Alerts below score 50 historically produced an average X% outcome.”

Such metrics must:

* Include losing outcomes.
* Define the period.
* Explain methodology.
* State sample size where meaningful.
* Avoid cherry-picking.
* Never imply future performance.

---

## 4.3 No FOMO Design

Weaver must not deliberately manufacture urgency around speculative assets.

Avoid:

* Fake countdowns.
* Artificial scarcity.
* “LAST CHANCE” messaging.
* Guaranteed-upside language.
* Excessive flashing.
* Reward mechanisms encouraging reckless scanning.

Real market urgency may be displayed when factually justified, but must be contextualized.

---

## 4.4 Community Claims Must Be Verifiable

Community features such as:

* Called It
* Leaderboards
* Published Calls
* Track Record

must use auditable historical data.

Users must not be able to improve their record by:

* Deleting losing calls.
* Editing timestamps.
* Changing original predictions.
* Rewriting historical scores.
* Hiding failed calls.

Corrections must preserve the original historical record.

---

## 4.5 Outcome Learning

Where sufficient historical data exists, Weaver may analyze which signals correlated with outcomes.

The system must:

* Preserve historical versions.
* Avoid hindsight contamination.
* Distinguish correlation from causation.
* Avoid claiming predictive certainty.
* Document methodology.

Past outcomes may inform future research.

They must never be presented as guarantees.

---

# 5. User Experience Principles

## 5.1 Complexity Must Be Hidden, Not Deleted

Weaver may contain sophisticated systems.

The UI should make them understandable without removing their underlying capability.

A user should be able to answer:

```text
What is this?

What does Weaver think?

Why?

What could go wrong?

What evidence supports this?
```

without needing to understand the underlying implementation.

---

## 5.2 Progressive Disclosure

Primary information should appear immediately.

Advanced information should remain available without overwhelming new users.

Preferred hierarchy:

```text
SUMMARY
   ↓
WHY?
   ↓
RISKS
   ↓
EVIDENCE
   ↓
SOURCES
   ↓
TECHNICAL DETAILS
```

---

## 5.3 Core Navigation

Weaver's primary navigation should prioritize the main user journey.

Recommended hierarchy:

```text
CORE
├── Home
├── Discover
├── Analyze
└── Portfolio

MONITOR
├── Watchlist
├── Signals
└── Alerts

INTELLIGENCE
├── News
├── Whale Tracker
├── Smart Money
├── Sectors
└── Time Machine

TOOLS
├── DeFi
├── Airdrop Hunter
├── Optimizer
├── Tax
├── Journal
└── AI Assistant
```

The exact implementation may differ where existing routes require compatibility.

The principle is:

> **Do not expose every capability with equal visual weight.**

---

## 5.4 Discover → Verify UX

Gem Agent and Token Shield should feel like one connected workflow.

Preferred flow:

```text
Gem Detected
     ↓
Automatic Verification
     ↓
Evidence Aggregation
     ↓
Merged Verdict
```

Users should not need to manually cross-reference multiple tools to understand a discovery.

---

## 5.5 Merged Verdict

Where Gem Agent, Token Shield, and Token Analysis have sufficient data, the UI should present a coherent summary containing:

* Opportunity
* Risk
* Confidence/uncertainty
* Why
* Supporting evidence
* Contradictory evidence

Example:

```text
WEAVER VERDICT

Opportunity
High

Risk
Moderate

Confidence
Medium

Why:
✓ Liquidity improving
✓ Volume accelerating
✓ Momentum strengthening
⚠ Holder concentration elevated
⚠ Contract risk indicators detected

[ View Evidence ]
```

The merged verdict must not conceal individual risk signals.

---

## 5.6 Calm Professional Visual Language

Weaver should feel like a serious intelligence product.

It should not feel like:

* A casino.
* A meme-token casino.
* A cyberpunk trading game.
* A FOMO machine.

Prefer:

* Clear hierarchy.
* Strong typography.
* Calm surfaces.
* Meaningful color.
* Consistent spacing.
* Minimal decorative effects.

Avoid unnecessary:

* Neon overload.
* Excessive gradients.
* Excessive glassmorphism.
* Constant animations.
* Visual noise.

---

## 5.7 Meaningful Color

Use color primarily to communicate meaning:

```text
Neutral → Information
Green   → Positive signal
Yellow  → Caution
Red     → Risk
Accent  → Action / Weaver identity
```

Color must not be the only method of communicating meaning.

---

## 5.8 Accessibility

User-facing features should support:

* Keyboard navigation.
* Visible focus states.
* Semantic headings.
* Accessible labels.
* Sufficient contrast.
* Screen-reader compatibility.
* Clear dynamic status messages.
* Reduced-motion preferences.
* Touch targets approximately 44×44px or larger.

Accessibility defects are usability defects.

---

## 5.9 Empty States

Every empty state should answer:

1. What happened?
2. Why does it matter?
3. What should the user do next?

Example:

```text
Your watchlist is empty.

Save tokens here to monitor them over time.

[ Add Token ]
```

---

## 5.10 Error States

Normal users must not see raw technical errors.

Prefer:

```text
We couldn't complete the analysis.

The market data source isn't responding right now.

[ Try Again ]
```

Technical details may be available separately for debugging.

---

# 6. Product Integrity

## 6.1 Discovery Must Not Become Promotion

Gem Agent exists to identify interesting assets according to defined evidence.

It must never become a paid promotion marketplace disguised as organic discovery.

---

## 6.2 Security Must Not Become a Marketing Badge

Token Shield results describe what was checked and what was found.

A low-risk result must not be translated into:

> “This token is safe.”

Instead:

> “No identified risk indicators were detected within the checks performed.”

Security analysis has defined limits.

---

## 6.3 Missing Data Must Reduce Confidence

When important evidence is unavailable, Weaver must communicate that limitation.

Example:

```text
Holder analysis unavailable.

Confidence reduced because holder concentration
could not be verified.
```

Missing information must never silently become a positive assumption.

---

## 6.4 Weaver Must Be Auditable

Important system decisions should be explainable after the fact.

Where practical, preserve:

* Score version.
* Evidence used.
* Timestamp.
* Data source.
* Relevant configuration.
* Outcome.

The system should be able to answer:

> **“Why did Weaver say this at that time?”**

---

## 6.5 User Data Must Not Become a Hidden Revenue Stream

Weaver must not monetize private user activity by silently selling or sharing:

* Portfolio data
* Wallet addresses
* Holdings
* Watchlists
* Trading behavior
* User research activity

with third parties.

Any future data-sharing product must follow the explicit privacy requirements of Section 2.6.

---

# 7. Change Process

## 7.1 Constitutional Changes

Any change affecting **Section 2 — Non-Negotiable Principles** requires:

1. Explicit written justification.
2. Identification of the affected principle.
3. Security and product impact analysis.
4. Explanation of why the current constitution is insufficient.
5. More than one review before acceptance.

A Section 2 principle cannot be changed casually inside an ordinary feature PR.

A proposal to introduce custody, autonomous trading, or equivalent control over user funds requires a **new constitution**.

---

## 7.2 Technical Convention Changes

Any change affecting Section 3 must explain:

* Existing pattern.
* Why it is insufficient.
* Proposed alternative.
* Trade-offs.
* Migration impact, where applicable.

---

## 7.3 Community Changes

Changes to Section 4 must be checked against:

* Transparency.
* No-conflict principles.
* Financial safety.
* Loss visibility.
* User safety.

---

## 7.4 Constitution Check Before Merge

Every significant PR must complete the following:

```text
WEAVER CONSTITUTION CHECK

NON-CUSTODIAL
[ ] Does this custody funds?
[ ] Does this handle private keys or seed phrases?
[ ] Does this introduce automated signing?
[ ] Does this introduce autonomous execution?

TRANSPARENCY
[ ] Does this introduce a score or verdict?
[ ] If yes, is reasoning visible?

EVIDENCE
[ ] Can material claims be traced to evidence?
[ ] Is data distinguished from inference?
[ ] Does AI generate factual claims?
[ ] If yes, can those claims be verified?

FINANCIAL SAFETY
[ ] Does this introduce directive language?
[ ] Does it imply guaranteed returns?
[ ] Does it create unnecessary FOMO?

CONFLICTS
[ ] Can payment influence a score?
[ ] Can payment suppress a risk flag?
[ ] Is sponsored content clearly separated?

PRIVACY
[ ] Does this transmit user data externally?
[ ] If yes, is there explicit separate opt-in?

CHAIN PARITY
[ ] Does this add/enable a chain?
[ ] If yes, does Token Shield support verification?

RELIABILITY
[ ] Does every external dependency fail gracefully?
[ ] Are repeated API calls cached?
[ ] Does the zero-key path remain functional?

SCORING
[ ] Does this change scoring?
[ ] If yes, is the scoring version updated?
[ ] Are historical results preserved?

COMMUNITY
[ ] Does this affect public calls or performance?
[ ] Are losses equally visible?
[ ] Can historical results be manipulated?

UX
[ ] Is the primary workflow clearer?
[ ] Are risks easy to find?
[ ] Does mobile work?
[ ] Is accessibility preserved?
```

If a question cannot be answered confidently, the PR is **not ready to merge**.

---

# 8. Definition of Done

A feature is not complete until all applicable requirements are satisfied.

## Reliability

* [ ] Works with zero API keys, or clearly documents the optional key requirement and why it is necessary.
* [ ] External failures degrade gracefully.
* [ ] No blank screens caused by failed dependencies.
* [ ] No unhandled errors on normal failure paths.
* [ ] Repeated API calls use appropriate TTL caching.

## Evidence & Intelligence

* [ ] Every user-facing score/verdict shows reasoning.
* [ ] Material claims are traceable to evidence where technically possible.
* [ ] Observed data is distinguished from inference/speculation.
* [ ] Missing evidence is clearly communicated.
* [ ] AI does not fabricate evidence, sources, market data, or outcomes.
* [ ] AI does not override deterministic security controls.
* [ ] Scoring methodology is versioned where applicable.
* [ ] No unsupported false precision is introduced.

## Safety

* [ ] Weaver never takes custody of funds.
* [ ] Weaver never stores private keys or seed phrases.
* [ ] Weaver never silently executes trades.
* [ ] User wallet actions require user authorization.
* [ ] No guarantees or directive trading language are introduced.
* [ ] “Educational tool. Not financial advice.” remains visible on relevant meme-coin-facing views.

## Privacy

* [ ] User data remains local by default where appropriate.
* [ ] External transmission of sensitive user data requires explicit opt-in.
* [ ] Third-party integrations receive only necessary data.

## Chain Support

* [ ] Any newly discoverable chain has a corresponding verification path.
* [ ] Discovery/verification parity is maintained.
* [ ] Chain-specific failures degrade gracefully.

## UX

* [ ] The primary user goal is obvious.
* [ ] Complex information is progressively disclosed.
* [ ] Important risks are easy to find.
* [ ] Mobile layouts work.
* [ ] Keyboard navigation works.
* [ ] Accessibility requirements are satisfied.
* [ ] Reduced-motion preferences are respected.

## Community

* [ ] Auto-posting is opt-in.
* [ ] Thresholds and frequency are user-controlled.
* [ ] Historical losses cannot be hidden.
* [ ] Historical calls cannot be rewritten to improve performance.
* [ ] Published statistics include methodology and relevant time windows.

---

# 9. Final Standard

Before Weaver ships a feature, ask:

> **Does this make the user better informed, or merely more excited?**

If it makes the user better informed, continue.

If it increases excitement while reducing decision quality, reject it.

If it hides risk, reject it.

If it invents evidence, reject it.

If it requires custody, reject it.

If it profits from manipulating user decisions, reject it.

If it cannot explain itself, improve it.

If it cannot fail safely, fix it.

If it cannot preserve user control, do not ship it.

---

# 10. Weaver's Core Promise

**Weaver does not tell users what to buy.**

**Weaver helps them understand what they are looking at.**

It:

* Discovers.
* Verifies.
* Explains.
* Exposes uncertainty.
* Preserves evidence.
* Records outcomes.
* Learns from mistakes.
* Protects user control.
* Keeps the user's funds and keys outside Weaver.

> **The user keeps the keys.
> The evidence stays visible.
> The losses stay visible.
> The decision stays with the user.**
