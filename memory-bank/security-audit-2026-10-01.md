# Security Audit — 2026-10-01

> Session record. Audited state: `a8c71a5` → `29a9d24` → `8390daf` →
> `84a47ce` → `ed1afda` → `7543dbe` → dedup commit. CI green on
> current HEAD.

## Scope

Four areas, worked in the order the earlier handoff named, then
extended:

- **A — HTTP security headers** (deployment-layer verification)
- **B — raw `fetch()` audit** (application + Worker)
- **C — `innerHTML` audit** (XSS sinks)
- **D — deployer terminology** (owner vs creator vs deployer)

Plus a supplementary pass on five files identified mid-audit:
`ai.js`, `smart.js`, `sw.js`, `request-guard.js`, `prices.js`.

## Method

File-by-file, one window at a time. No batch patches. Every fix
landed after the audit for its file was complete. The session
adopted a strict "audit first, patch second" discipline — the same
discipline the handoff's git rules encode.

## Results by area

### A — HTTP security headers

**Closed. No code change possible.**

`curl -sSI https://ibis01.github.io/weaver/` confirms GitHub Pages
sends only:

- `strict-transport-security: max-age=31556952` (github.io is on the
  HSTS preload list, so subdomain inclusion is enforced by the browser
  regardless of the header)
- `content-type: text/html; charset=utf-8`

No `X-Frame-Options`, no `X-Content-Type-Options`, no `Referrer-Policy`,
no `Permissions-Policy`, no COOP/CORP/COEP, no `Content-Security-Policy`
header.

GitHub Pages does not permit custom response headers. The only
mechanism available to the app is `<meta http-equiv="...">`, and the
HTML spec only honours CSP, `Content-Type`, `default-style`, `refresh`,
and `X-UA-Compatible` from meta. HSTS, `X-Frame-Options`,
`Referrer-Policy`, and `Permissions-Policy` cannot be set from meta.

The constraint and the recommended HTTP-layer header block for a
future host are documented in `index.html:7–38`. The one meta-level
mitigation available — `<meta name="referrer">` — is present at
`index.html:70` with `strict-origin-when-cross-origin`.

`<meta http-equiv="Content-Security-Policy">` at `index.html:121–161`
is comprehensive. No ignored directives (no `frame-ancestors`,
`report-uri`, `report-to`, or `sandbox` — all correctly absent from
the meta-delivered policy). `connect-src` includes
`https://weaver-proxy.ibis01-weaver.workers.dev`.

**Verdict: accepted constraint. No fix.**

### B — raw `fetch()` audit

**21 sites audited. 2 real Fixes landed. 8 Minors catalogued.**

#### Application code — 18 sites

| File | Line | Verdict |
|---|---|---|
| `js/api/snapshot.js` | 125–127 | Justified (same-origin static) |
| `js/features/shield.js` | 171 | Justified |
| `js/features/shield.js` | 238 | Justified + Minor (dead `proxies` array) |
| `js/features/shield.js` | 293 | Justified + Minor (same, plus missing `encodeURIComponent`) |
| `js/features/web3.js` | 84 | **Fix — landed** |
| `js/features/telegram.js` | 343 | Justified |
| `js/features/gems.js` | 412 | Justified |
| `js/features/gems.js` | 1388 | Justified + Minor (dead `PROXIES` array) |
| `js/features/track-record.js` | 828 | Justified |
| `js/features/track-record.js` | 889 | Justified |
| `js/intelligence/deployer-graph.js` | 606 | Justified + Minor (no timeout) |
| `js/api/prices.js` | 517 | Justified |
| `js/features/ai.js` | 607 | Minor+ (no timeout on guard path) |
| `js/features/news.js` | 69, 119 | Justified |
| `js/features/smart.js` | 115 | Justified |
| `js/features/walletsync.js` | 98 | Justified |
| `js/ai/providers.js` | 40 | Minor (no timeout) |
| `js/features/ai.js` (fetchOnChainJSON) | — | Minor+ (no timeout) |

#### Worker code — 3 sites

| File | Line | Verdict |
|---|---|---|
| `cf-worker/index.js` | 293 | Justified + Minor (no size cap, no `redirect:manual`) — **Fix landed** |
| `cf-worker/index.js` | 377 | Justified + Minor (error leak, no size cap) — **Fix landed** |
| `cf-worker/index.js` | 560 | **Fix — `redirect:manual` landed** |

#### Fixes landed

**`8390daf` — Worker hardening.**

- `redirect: "manual"` on all three upstream fetches (GoPlus, Bitquery,
  `/proxy`). Closes a cache-poisoning vector: an allowlisted host with
  an open redirect could redirect to a non-allowlisted target, and the
  response would be cached under the original URL key. The header
  comment at `cf-worker/index.js:81–85` already claimed "no redirects
  followed implicitly"; the code did not implement that until this
  commit.
- `MAX_UPSTREAM_BYTES = 5 * 1024 * 1024` + `readTextWithCap()` helper
  applied to every upstream response read. Bounds Worker memory
  against a misbehaving allowlisted host.
- GoPlus relay catch block no longer echoes `e.message` to the client;
  logs server-side, returns a generic message.
- Bitquery catch block same.

**`84a47ce` — Solana routing.**

- `getSolBalance` in `js/features/web3.js` previously fell back to a
  browser-direct POST to `https://api.mainnet-beta.solana.com`. That
  endpoint is (a) blocked from Cloudflare Worker egress per the
  `cf-worker/index.js` header, (b) not on the Worker's
  `ALLOWED_PROXY_HOSTS` list, and (c) leaked the user's IP to a public
  RPC. The fallback now routes through
  `W.walletsync.solanaRpcCall`, which points at
  `mainnet.helius-rpc.com` with a placeholder key the Worker swaps for
  `HELIUS_KEY`.
- **`ed1afda`/`7543dbe` — export follow-up.** The original commit
  referenced `W.walletsync.solanaRpcCall`, but the function was not in
  the module's return object. A follow-up commit added the export.
  A duplicate line from a re-application was cleaned up in a third
  commit.

**`29a9d24` — XSS sinks.**

Four `e.message` interpolations into `innerHTML`, wrapped with the
file's escaper:

- `js/features/sync.js:430` and `:442` → `W.fmt.escapeHTML(e.message)`
- `js/features/watchlist.js:100` → `W.fmt.escapeHTML(e.message)`
- `js/ui/ui.js:270` → `esc(e.message)` (local escaper, already in
  scope from the `coinPicker` closure)

`e.message` is often derived from upstream API responses
(`shield.js` passes GoPlus's `data.message` into `new Error()`;
`ai/providers.js` passes the LLM endpoint's error message). It is an
untrusted input stream.

#### Minors — catalogued, not yet fixed

- `shield.js:238, 293` — dead `proxies` identity arrays; missing
  `encodeURIComponent(address)` on the Solana direct path;
  `User-Agent` header that browsers ignore
- `gems.js:1388` — dead `PROXIES` identity array
- `deployer-graph.js:606` — no `AbortController` timeout
- `ai.js:607` (`fetchOnChainJSON`) — no timeout on either the guarded
  or raw path; the guard init is `{}`
- `ai/providers.js:40` — no timeout
- `snapshot.js` — no timeout on the three same-origin fetches
- `sw.js` — no timeout on the service-worker network fetch

#### Supplement — five files reviewed at session end

- `ai.js` — AES-GCM "Encrypted Memory Store" keeps its key in
  localStorage plaintext. This is obfuscation, not a confidentiality
  boundary; an XSS attacker reads both. `systemPatterns.md` should
  describe it accurately.
- `smart.js` — **model file.** All hardening present: URL allowlist
  (`startsWith(BLOCKSCOUT_API + "/")`), `AbortController`,
  `credentials: "omit"`, `mode: "cors"`, `cache: "no-store"`,
  `referrerPolicy: "no-referrer"`, size caps, advisory schema
  validation, attribute-safe `esc()`.
- `sw.js` — clean. Origin check, method check, bundle pruning, honest
  fallback chain.
- `request-guard.js` — the circuit breaker is not a classic three-state
  breaker. After cooldown it deletes the failure count rather than
  entering HALF_OPEN. This is closer to "retry with cooldown" than a
  true circuit breaker. Not exploitable; a comment would help.
- `prices.js` — the two-proxy array is `[Worker, identity]`; the
  refusal-detection by string match on `e.message` is fragile but
  internal-consistent. `source` is a mutable module global that can
  race under concurrent calls.

### C — `innerHTML` audit

**Partial. Four sinks fixed. Seven concrete sites + 70 multiline
templates remain.**

The `grep -v "esc("` filter initially returned 190 sites, but most
multiline template literals call `esc()` on an interior line, so
same-line filtering cannot see them. The 190 figure is not a
meaningful audit number.

Working buckets:

- **Bucket 1** — `.innerHTML = ""` or `.innerHTML = '<literal>'` (no
  `${}`). Safe.
- **Bucket 2** — `.innerHTML = renderX(...)` or helper-mediated.
  Audit the helper once and every call site closes. Helper set
  visible in the first-pass grep: `renderKpiStrip`, `renderSignals`,
  `tapeHTML`, `renderFearGreed`, `renderEvidencePreview`,
  `renderQuickActions`, `renderInsights`, `holdingsTable`,
  `_renderGemCard`.
- **Bucket 3** — Direct interpolation. The four `e.message` sinks
  were in this bucket. Remaining sites:

  | Site | What to check |
  |---|---|
  | `js/ui/ui.js:19` (`toast(msg)`) | Where does `msg` come from? Caller audit. If any caller passes raw `e.message`, same Fix class. |
  | `js/ui/ui.js.modal` | Same shape as `toast` — public API, no internal escaping. Caller audit. |
  | `js/ui/intelligence-feed.js:286` | Trace `html` variable upward. |
  | `js/features/timemachine.js:236` | Same. |
  | `js/features/intelligenceFeed.js:392` | Same. |
  | `js/features/shield.js:823` (`chainKey` interpolation) | Where does `chainKey` originate? If from a route fragment, potentially a Fix. |
  | `js/features/gems.js:1889` (`_renderGemCard`) | Verify the helper escapes internally. |

- **70 multiline templates** — deferred. `grep -v "esc("` cannot
  filter them usefully. Audit file-by-file when needed.

#### Convention drift — `W.fmt?.escapeHTML || ((s) => s)`

`js/ui/ui.js:89` defines the local escaper as a fail-open chain. If
`W.fmt` is ever absent, `esc` becomes an identity function and escapes
nothing silently. This is not currently exploitable — `W.fmt` loads
early — but it is a latent regression. Correct shape: a real fallback
that escapes `& < > " '`.

#### `W.fmt.escapeHTML` in attribute context

`W.fmt.escapeHTML` (the `textContent → innerHTML` trick) escapes
`& < >` only. It is safe in text position, unsafe in any attribute
position. Three sites were found using it in text position
(`intelligence/behavior.js:124`, `features/token-analysis.js:741`,
`:1181`) — safe today, but inconsistent with the stated convention
(every module has a local attribute-safe `esc()`). Swap to local
`esc()` if the files are touched.

### D — deployer terminology

**Verified clean. No fix.**

`js/ui/evidence-drawer.js` renders `renderOwnerLine(ownerSummary)` and
`renderDeployerLine(deployerSummary)` as distinct lines (lines 487,
488). The two summaries come from distinct modules:

- `ownerSummary` ← `W.ownerAssociations.get()` +
  `W.ownerAssociations.summarise()`
- `deployerSummary` ← `W.deployerGraph.get()` +
  `W.deployerGraph.summarise()`

`deployer-graph.js` header (lines 15–17) explicitly distinguishes:
