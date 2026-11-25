# Weaver Engineering Improvement Master Plan

**Review baseline:** `ibis01/weaver` `main` at commit `ad3d223`
**Review date:** 2026-11-25
**Target:** controlled single-user beta first; broad unattended production only after the evidence gates below pass.

## 1. Executive engineering decision

Weaver is no longer blocked by the basic engineering failures identified in the first review. The current repository has a coherent public deployment topology, a production Compose alternative, a hardened Worker deployment path, blocking dependency review, pinned GitHub Actions, branch-protection controls, release manifests, rollback automation, an external health probe, and clean runtime dependency auditing.

The main remaining risk is not a missing framework or a lack of tests. It is the gap between **built capability, validated behavior, and operational evidence**. The repository itself warns against confusing infrastructure with validation, but its documents currently contain stale and contradictory status statements. The next phase must therefore establish one authoritative evidence ledger and finish the product gates before adding more features.

**Go now:** controlled single-user beta, staged releases, and continued reliability/data-validation work.
**Do not claim yet:** broad unattended production, predictive performance, validated smart-money efficacy, or multi-user SaaS readiness.

## 2. Re-review findings

### Verified healthy

The following checks passed during this review:

- `npm audit --omit=dev --audit-level=high`: **0 vulnerabilities**;

- live `/discovery/health`: `200`, `ok: true`, `methodologyVersion: discovery-v3`;

- live snapshot age during review: approximately **10 minutes**, within the 15-minute probe SLA;

- live `/discovery/snapshot`: `200`;

- live `/meme/alerts?limit=1`: `200`;

- live `/dist/bundle.min.js`: `200`, `738,277` bytes;

- live CORS, empty-payload validation, and fail-closed admin smoke behavior were passing in the previous recheck and remain covered by the current deploy/probe workflows;

- current recorded test baseline: **737 unit, 30 integration, 16 security, and 43 Worker tests passing**;

- local E2E installation/doctor commands exist, and the project records 36/36 hermetic E2E tests green twice in its phase history.

### Major remaining findings

**Evidence and documentation drift.** `docs/deployment-runbook.md` still presents the old assets-only/broken Worker state even though the live Worker is serving script routes. `docs/phase-status.md` says it is current as of 2026-11-11 and references an older HEAD while the repository is at `ad3d223`. This can cause an operator or reviewer to make the wrong release decision.

**Product validation is incomplete.** The phase ledger still marks Phase 1 partial, Phase 2 not passed, Phase 3 partial, Phase 4 blocked, Phase 5 partial, and Phase 6 not started. The 30-day reliability gate has not been completed. The Worker probe supplies a valuable evidence stream but does not establish smart-money efficacy, predictive validity, or user value.

**Observability is incomplete.** The external probe covers health, methodology, freshness, CORS, validation, and read-path availability. Provider-level success rates, alert-delivery latency, durable Worker logs, backup watchdogs, and budget/limiter failure alerts remain incomplete or plan-only.

**Topology parity is incomplete.** Cloudflare Worker is the public authoritative deployment; Docker is self-hostable. Their contract parity is not currently proven by the same automated suite.

**Quota controls are not yet strict under concurrency.** Worker KV rate-limit and budget accounting is eventually consistent/read-then-write. The Node proxy has stronger Redis behavior, but it is not the public authoritative path.

**Governance is beta-grade.** Branch protection now enforces CI, gitleaks, dependency review, administrator enforcement, and conversation resolution. Required approvals remain zero and code-owner enforcement is disabled for the solo-maintainer beta. The deployment environment reviewer/branch policy is not confirmed because the relevant GitHub API endpoints returned 404 on the current account.

**Architecture remains difficult to evolve.** The browser bundle is concatenated in load-order-sensitive sequence, with approximately 88 source files and a minified artifact around 738 KB. The client, Node proxy, Worker, Redis/KV/D1, scheduled workers, and committed snapshots create several state and contract boundaries without one shared typed API contract.

## 3. Engineering principles for the next year

1. **Evidence before claims.** Every production or product claim must point to a reproducible artifact, run, snapshot, or probe history.

1. **One authoritative contract.** Provider schemas, Worker responses, proxy responses, methodology versions, and error semantics should be defined once and tested against every implementation.

1. **Fail honestly.** Unknown, stale, unavailable, rate-limited, and budget-exhausted must remain distinct states. Never convert a missing observation into zero or a successful HTTP response into valid data.

1. **Release immutability.** A release identifies one source commit, one generated bundle digest, one Worker version, one methodology version, and one rollback target.

1. **Small public surface.** Keep the hosted product single-user and non-custodial until there is an explicit decision to add identity, accounts, or managed availability.

1. **Operations must be testable.** Backups, rollback, alert delivery, quota exhaustion, provider outages, and scheduler duplication need fault-injection tests, not only documentation.

1. **No premature signal expansion.** Do not add more intelligence features while the existing validation gates remain partial or blocked.

## 4. Target architecture

### 4.1 Public beta topology

The supported public topology should remain:

```
Browser single-user beta
        |
        | HTTPS, allowlisted origin
        v
Cloudflare Worker: weaver-proxy
        |
        +--> Worker static assets: index.html, dist bundle, styles, service worker
        +--> KV: bounded cache, rate-limit state, provider budgets
        +--> D1: durable snapshots and transactional counters where required
        +--> allowlisted external providers
        +--> scheduled discovery snapshot
        |
        +--> external Production Probe every 15 minutes
```

The Docker/Nginx/Redis topology should be explicitly labelled **self-hosted alternative**, not a second public production implementation, unless contract parity becomes a supported requirement.

### 4.2 State classification

Every stateful feature should be classified as one of these:

- **Browser-local user state:** portfolio, settings, observations, Track Record, encrypted client secrets. It is device/origin-scoped and not operator-recoverable.

- **Worker operational state:** quotas, rate limits, cache, discovery snapshot, short-lived alerts.

- **Durable analytical state:** D1 snapshots or versioned repository artifacts whose recovery and retention are defined.

- **Release evidence:** GitHub Actions artifacts, probe summaries, manifests, trial logs, and gate reports.

For each state, document owner, retention, backup method, restore method, privacy classification, and acceptable loss. This prevents Redis backup documentation from being mistaken for complete product-data recovery.

### 4.3 Contract boundary

Create a versioned contract package or generated schema set shared by the Worker tests, Node proxy tests, browser adapters, and E2E fixtures. It should define:

- health response and freshness metadata;

- discovery snapshot schema;

- proxy success/error envelope;

- rate-limit and budget responses;

- CORS behavior;

- evidence/provenance records;

- methodology and scoring version fields;

- null/unknown semantics.

Use schema validation at external boundaries and contract tests against both Worker and Docker implementations. A contract version change must appear in the release manifest.

## 5. Workstreams and master backlog

### Workstream A — Evidence ledger and documentation integrity

**Priority:** P0. **Owner:** repository maintainer. **Exit:** no contradictory current-state documents.

Tasks:

1. Create `docs/status-ledger.yml` or equivalent machine-readable ledger with:
  - repository commit;
  - deployed Worker Version ID;
  - current methodology version;
  - last successful production probe;
  - current Gate 0–7 status;
  - current trial/window status;
  - last dependency audit;
  - last restore drill;
  - open blockers and evidence links.

1. Add a CI check that rejects a status document claiming an older HEAD unless it is explicitly marked historical.

1. Rewrite `docs/deployment-runbook.md` so the current live state is healthy and the old assets-only incident is moved to a dated incident section.

1. Update `docs/phase-status.md` to the current HEAD, or split it into immutable historical records plus a short current status page.

1. Add a “claim classification” convention:
  - **built** — code/workflow exists;
  - **verified** — automated or manual evidence exists;
  - **passed** — a frozen gate/exit criterion is satisfied;
  - **historical** — preserved but not current.

1. Require every release PR to link the relevant evidence artifacts.

Acceptance criteria:

- A clean checkout identifies the current public topology and current Worker state without reading stale historical text.

- A reviewer can trace every “pass” claim to a commit, workflow run, artifact, or probe sample.

- Historical failures remain immutable and are not silently reinterpreted.

### Workstream B — Release engineering and supply chain

**Priority:** P0. **Owner:** maintainer/release operator. **Exit:** reproducible deploy, rollback, and provenance.

Tasks:

1. Keep all third-party Actions pinned to full SHAs and run a scheduled update bot with PR review.

1. Keep dependency review blocking and required on `main`; verify the check name cannot be bypassed by duplicate workflow names.

1. Add a release job that records:
  - source commit;
  - `package-lock.json` and Worker lockfile hashes;
  - bundle and source-map hashes;
  - Worker Version ID;
  - methodology/config versions;
  - dependency audit result;
  - smoke/probe outcomes;
  - rollback target.

1. Generate an SBOM for Node packages and Worker packages. Retain it with the release manifest.

1. Add build provenance or an equivalent signed attestation for release artifacts. SLSA provenance is a useful format because it records how and from which inputs an artifact was produced [1].

1. Make the deployment environment policy explicit. If required reviewers are unavailable on the current GitHub plan, record the effective fallback control.

1. Add an automated rollback drill at least once per release quarter.

1. Keep the Worker and frontend release atomic; prevent an asset/script methodology mismatch.

Acceptance criteria:

- Given a release manifest, an operator can identify the exact source, Worker version, bundle digest, dependencies, and rollback command.

- A failed smoke test prevents release completion.

- A rollback restores the previous health contract and is recorded with a reason.

- No release depends on a mutable action tag, mutable container tag, or undocumented dashboard setting.

### Workstream C — Runtime reliability and observability

**Priority:** P0. **Owner:** operations owner. **Exit:** Gate 4 evidence complete.

Tasks:

1. Complete the external 15-minute production probe and retain its summaries.

1. Add probe checks for:
  - bundle complete download and expected digest/length;
  - security headers;
  - freshness and methodology;
  - one representative provider refusal path;
  - rate-limit and budget semantics in a safe test route.

1. Add structured Worker events with timestamp, request/cycle ID, route, provider, status, duration, cache result, budget result, and failure reason.

1. Add durable retention or export for Worker logs. `console.*` in ephemeral isolate logs is not enough for post-incident analysis.

1. Add counters/histograms for route latency, provider status, timeouts, retries, cache hit/stale/miss, rate-limit rejections, budget use, and snapshot generation.

1. Add notifications for:
  - two consecutive failed probes;
  - stale discovery snapshot;
  - provider error-rate threshold;
  - budget exhaustion or abnormal consumption slope;
  - backup failure;
  - deploy/rollback smoke failure;
  - alert delivery failure.

1. Add a backup watchdog. A log line saying “backup failed; retrying” is not an alert.

1. Define SLO/SLA language consistent with the product boundary. The current public deployment is best effort; if an availability promise is ever introduced, it requires a product-boundary revision.

1. Run fault injection for provider outage, malformed JSON, timeout, quota exhaustion, duplicate cron invocation, KV/D1 failure, Redis failure, and recovery.

Acceptance criteria:

- A broken public Worker is detected externally within one probe interval.

- A failed backup or missed alert generates an operator-visible event.

- Every scheduled cycle has a success or failure record with a reason.

- Gate 4 passes for 30 consecutive days:
  - cycle completion ≥99%;
  - freshness ≤15 minutes for ≥99% of samples;
  - provider success ≥95% per provider over 24 hours;
  - zero unexplained silent gaps;
  - alert latency ≤60 seconds;
  - bounded cache growth.

OpenTelemetry’s signal model—traces, metrics, logs, and correlated context—is an appropriate long-term direction for the Worker/proxy/provider path [2]. Start with structured logs and metrics before adding a full tracing backend.

### Workstream D — Quota, abuse, and provider-cost control

**Priority:** P0 for public scale; P1 for current beta. **Owner:** Worker maintainer.

Tasks:

1. Replace Worker KV read-then-write daily budgets with an atomic D1 transaction or Durable Object counter.

1. Define whether each route fails open or closed during KV/D1 unavailability. Auth-shaped, write, and cost-bearing paths should default fail-closed.

1. Add per-origin/IP/identity dimensions without trusting spoofable forwarding headers.

1. Add maximum request body, response body, concurrency, retry, and pagination limits per provider.

1. Make provider budgets configurable through versioned operator configuration, not code-only edits.

1. Add cost-slope alerts before exhaustion, not only after exhaustion.

1. Verify all client adapters honor `Retry-After`, 429, 503 budget responses, and stale-cache semantics without retry storms.

1. Test concurrent budget consumption with hundreds of simulated isolates/requests.

Acceptance criteria:

- A concurrency test cannot materially exceed the declared provider budget.

- Provider failure and budget exhaustion produce distinct, user-visible states.

- A provider outage does not cause an unbounded retry loop.

- Quota changes are release-reviewed and appear in the manifest.

### Workstream E — API and data contract quality

**Priority:** P1. **Owner:** application/platform maintainers.

Tasks:

1. Define schemas for all upstream adapters and validate at the boundary.

1. Separate transport success, provider success, schema validity, freshness, and evidence relationship. HTTP 200 must not imply valid evidence.

1. Centralize error envelopes and retryability classification.

1. Add provider contract fixtures for valid, partial, stale, malformed, rate-limited, and oversized responses.

1. Add replayable fixtures for production incidents with secrets and personal data removed.

1. Version every scoring, evidence, snapshot, and methodology change.

1. Add data-quality checks for duplicate IDs, impossible timestamps, negative prices, inconsistent chain/address pairs, and stale snapshots.

1. Keep all historical records append-only or revisioned with explicit reasons. Preserve conflict records.

Acceptance criteria:

- Every external response has a schema/quality result.

- Every missing value remains `null`/unknown and is visible in the relevant UI.

- An incident can be replayed deterministically from sanitized input fixtures.

- A methodology change creates a new version and does not rewrite historical conclusions.

### Workstream F — Intelligence validation and scientific integrity

**Priority:** P0 before predictive or smart-money claims. **Owner:** research maintainer plus independent reviewer.

Current phase state must be respected:

- Phase 0: partial/verification lineage work remains;

- Phase 1: partial;

- Phase 2: not passed; prior windows include aborted/inconclusive/fail evidence;

- Phase 3: partial;

- Phase 4: blocked/no performance claim;

- Phase 5: partial;

- Phase 6: not started.

Tasks:

1. Close Gate 0c with an external-auditor acknowledgment or explicitly document why it cannot be closed.

1. Finish Gate 0b population construction with frozen gold/control populations and independent sample draws.

1. Restart the paper-trial window only after discovery-v3 live verification, 24-hour soak, control-cohort persistence, and frozen configuration confirmation.

1. Preserve the Phase 2 Window 3 FAIL and prior aborted windows as historical evidence.

1. Complete predictive validation with:
  - pre-registered baseline;
  - walk-forward evaluation;
  - negative-outcome accounting;
  - retry-safe outcome ledger;
  - frozen price inputs for historical reproduction;
  - confidence intervals and sample-coverage report.

1. Add a formal “no claim” outcome when the sample is insufficient.

1. Require independent review for any claim about predictive power, smart-money skill, or efficacy.

1. Add UI and export labels containing methodology version, sample size, freshness, unknowns, and limitations.

1. Do not add new signals or monetization before the existing gate exits are met.

Acceptance criteria:

- Every performance statement can be reproduced from committed data, code, and a frozen protocol.

- No holdout leakage or post-hoc threshold adjustment exists.

- Treatment/control cohorts are identifiable in persisted records.

- A failed or inconclusive result is visible and retained rather than replaced.

### Workstream G — Frontend architecture and security

**Priority:** P1. **Owner:** frontend maintainer.

Tasks:

1. Replace implicit concat load order with an explicit module graph over time. Begin with the highest-risk shared modules and preserve a generated bundle during migration.

1. Introduce TypeScript or JSDoc type checking for canonical models, API responses, evidence records, and route state.

1. Add lint, format, complexity, dead-code, and bundle-size gates.

1. Split the 738 KB minified bundle by route or feature where practical; enable Brotli/Gzip and immutable content-hashed assets.

1. Continue the XSS audit with context-specific escaping for text, attribute, URL, and HTML contexts. Avoid public helpers that fail open when an escaper is unavailable.

1. Keep CSP strict and test it in E2E; ensure third-party CDN dependencies are pinned or self-hosted where possible.

1. Add accessibility checks for keyboard navigation, focus visibility, labels, target sizes, reduced motion, and screen-reader semantics.

1. Ensure service-worker cache invalidation is tied to release digest, not only a manual version bump.

1. Add privacy tests confirming browser secrets, addresses, and notes do not enter telemetry or logs.

Acceptance criteria:

- A source change cannot silently ship a stale bundle.

- Type/schema checks catch malformed canonical models before runtime.

- Bundle size and route performance have explicit budgets.

- E2E runs hermetically in CI and locally after `npm run test:e2e:install`.

### Workstream H — Proxy/Worker convergence

**Priority:** P1. **Owner:** platform maintainer.

Tasks:

1. Decide whether `proxy-server.js` is a supported production implementation or only self-host reference code.

1. If supported, run the same contract/smoke suite against Worker and Docker.

1. Centralize allowlists, timeout policies, size limits, and error semantics in a generated/shared configuration source.

1. Ensure redirect validation and DNS pinning behavior are equivalent.

1. Ensure Redis fail-closed behavior and Worker KV/D1 behavior are documented as intentionally different where they cannot be identical.

1. Add a Docker Compose CI job that starts the production topology, runs health/readiness, API contract tests, backup verification, and teardown.

Acceptance criteria:

- The release matrix clearly states which implementation is authoritative.

- A supported self-host deployment passes the same minimum contract suite.

- Security policy and runbook do not imply stronger guarantees than the implementation provides.

### Workstream I — Data durability, backup, and recovery

**Priority:** P1. **Owner:** operations owner.

Tasks:

1. Run and record Redis backup/restore drills with RPO/RTO.

1. Define D1 and KV recovery limits separately; Redis backup does not back up Worker KV/D1 state.

1. Store backups outside ephemeral container volumes or synchronize them to durable object storage.

1. Add checksum verification, retention policy, encryption-at-rest policy, and access audit.

1. Test a clean-host restore from only documented artifacts.

1. Decide whether historical analytical snapshots are repository artifacts, D1 records, or object-storage records; do not split authority silently.

1. Add disaster scenarios: lost host, corrupt snapshot, wrong schema, expired provider key, and rollback after schema change.

Acceptance criteria:

- A new operator can restore the documented critical state without tribal knowledge.

- RPO/RTO are measured rather than assumed.

- Restore verification checks semantic data, not only file integrity.

### Workstream J — Governance, privacy, and incident response

**Priority:** P1. **Owner:** maintainer/operator.

Tasks:

1. Keep administrator enforcement, conversation resolution, gitleaks, CodeQL, dependency review, and strict branch freshness enabled.

1. Move to one approval plus CODEOWNERS review when a second reviewer exists or before broad public production.

1. Verify `deploy-production` environment reviewers/branch policy in the GitHub UI or document account-plan limitations as an accepted control gap.

1. Create `CODEOWNERS` entries by risk area: Worker, deployment, security, data methodology, and frontend secrets/storage.

1. Define incident severity, communication, rollback, provider-key rotation, and post-incident review procedures.

1. Review personal-data handling for IP-derived rate-limit identities, wallet addresses, provider payloads, logs, backups, and user-entered notes.

1. Add retention/deletion documentation consistent with the single-user boundary.

1. Add a security release checklist and private vulnerability response drill. NIST SSDF recommends making secure development practices part of the development lifecycle rather than treating them as a one-time audit [3].

Acceptance criteria:

- A simulated vulnerability report reaches the maintainer privately and receives a tracked response.

- A compromised provider key can be revoked and replaced without code changes.

- An incident has one owner, one timeline, one rollback path, and one post-incident record.

## 6. Phased delivery roadmap

### Phase 0 — Establish truth and freeze scope

**Duration:** 3–5 working days. **Release:** no feature expansion.

Deliverables:

- current status ledger;

- corrected deployment and phase-status documents;

- current release matrix with commit `ad3d223` or newer;

- explicit single-user beta boundary;

- list of open gates and evidence owners;

- current branch/environment-control capture.

Exit gate: an independent reviewer can determine current system state from the repository without relying on stale documents.

### Phase 1 — Production-control minimum

**Duration:** 1–2 weeks. **Release:** beta only.

Deliverables:

- blocking dependency review and pinned Actions confirmed;

- release manifest with SBOM and bundle digests;

- external probe notifications;

- structured Worker logs and provider outcome summaries;

- backup watchdog;

- Docker CI smoke/contract job or explicit self-host-only designation;

- local E2E install/doctor documentation.

Exit gate: failed deploy, stale probe, failed backup, and provider-budget anomaly are all externally visible and actionable.

### Phase 2 — Reliability and recovery

**Duration:** 30 days plus setup. **Release:** no claim of unattended production until complete.

Deliverables:

- Gate 4 probe history;

- alert latency evidence;

- provider success-rate evidence;

- backup/restore drill;

- quota/concurrency fault-injection report;

- rollback drill;

- incident annotations for every interruption.

Exit gate: all Gate 4 SLOs pass for 30 consecutive days with no unexplained silent failure.

### Phase 3 — Data and intelligence validation

**Duration:** parallel, typically 4–8 weeks per frozen protocol.

Deliverables:

- Gate 0b/0c evidence;

- new frozen Phase 2 window with control cohort;

- Gate 0d predictive validation with negative outcomes and walk-forward evaluation;

- independent review and signed methodology report;

- user-facing no-claim/refusal states.

Exit gate: only the claims that survive the protocol are published; inconclusive/failed results remain visible.

### Phase 4 — Architecture modernization

**Duration:** 6–10 weeks, incremental.

Deliverables:

- shared API contracts;

- typed canonical models;

- Worker/Docker parity tests;

- atomic quota coordination;

- frontend module/type/lint migration;

- route-based bundle splitting and asset integrity.

Exit gate: a new feature can be implemented without duplicating provider schemas, confidence formulas, risk thresholds, or error semantics.

### Phase 5 — Broad public production decision

**Duration:** 1–2 weeks after all prior gates.

Deliverables:

- one required human approval and CODEOWNERS review;

- verified protected deployment environment or documented compensating controls;

- completed security/privacy review;

- completed restore and rollback drills;

- published limitations and methodology report;

- on-call/incident ownership decision;

- production release PR containing all evidence.

Exit gate: Gate 0–4 requirements relevant to the claims are passed, operational controls are exercised, and the release is approved as either public beta or production with exact scope.

## 7. Suggested issue breakdown

Create issues or tickets in this order:

1. `docs: establish current status ledger and remove stale production claims` — P0.

1. `ops: add probe failure notifications and backup watchdog` — P0.

1. `ops: add Worker structured logs and provider outcome summaries` — P0.

1. `release: publish SBOM and signed/provenance release manifest` — P0.

1. `ops: start Gate 4 and record 30-day evidence` — P0.

1. `security: verify deploy-production environment protection` — P0.

1. `test: run Docker and Worker contract parity suite` — P1.

1. `security: replace Worker read-then-write budgets with atomic coordination` — P1.

1. `data: define D1/KV/Redis backup and restore matrix` — P1.

1. `frontend: introduce typed canonical API/evidence models` — P1.

1. `frontend: add lint/typecheck/bundle budget and service-worker digest gate` — P1.

1. `research: close Gate 0b/0c and restart frozen validation windows` — P0 for any intelligence claim.

1. `research: complete predictive validation with walk-forward and negative outcomes` — P0 for any predictive claim.

1. `governance: move to one approval and CODEOWNERS review before broad production` — P1.

1. `product: make multi-user decision explicit before adding accounts or managed availability` — P1.

## 8. Release checklist

Before each public release, verify:

- [ ] Source commit and generated bundle are identical to the release manifest.

- [ ] `npm ci`, build, minify, unit, integration, security, Worker, and hermetic E2E checks pass.

- [ ] Runtime dependency audit is clean or has an approved exception.

- [ ] Dependency review, gitleaks, CodeQL, and branch-protection checks are green.

- [ ] Worker dry-run, deployment, four smoke tests, and asset integrity checks pass.

- [ ] External probe is green and snapshot freshness is within SLA.

- [ ] Methodology, scoring, quota, and schema versions are recorded.

- [ ] Rollback target is known and rollback command has been tested.

- [ ] Backup status and latest restore-drill evidence are available.

- [ ] Open incidents and known gaps are listed.

- [ ] Release scope says explicitly: beta, production, or self-hosted-only.

- [ ] No predictive or efficacy claim is published without the corresponding frozen validation evidence.

## 9. Definition of production readiness

Weaver is ready for **controlled single-user beta** when the current deployment contract is green, dependency and security gates are blocking, rollback works, the operator knows the best-effort boundary, and external probe failures notify the operator.

Weaver is ready for **broad unattended production** only when the 30-day reliability gate passes, provider/backup observability is durable, recovery and rollback are exercised, the release evidence is complete, and the current documentation is consistent with the deployed system.

Weaver is ready for **multi-user SaaS** only after authentication, object/function authorization, tenant isolation, durable user state, deletion/export controls, cost isolation, and disaster recovery are implemented. That is a new product boundary, not an incremental production polish task.

## References

[1]: https://slsa.dev/spec/draft/build-provenance "SLSA Build Provenance"

[2]: https://opentelemetry.io/docs/concepts/signals/ "OpenTelemetry signals"

[3]: https://csrc.nist.gov/pubs/sp/800/218/final "NIST SP 800-218 Secure Software Development Framework"

[4]: https://api-security.owasp.org/editions/2023/en/0x11-t10/ "OWASP Top 10 API Security Risks – 2023"

[5]: https://docs.github.com/en/actions/reference/security/secure-use "GitHub Actions secure use reference"