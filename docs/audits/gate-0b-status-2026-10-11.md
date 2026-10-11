# Gate 0b — Status Note

**Date:** 2026-10-11
**Status:** Blocked on provider rate limits

## Where things stand

- **Attempt 1 (single-event gold-standard):** Complete. Result at
  `docs/audits/gate-0b-attempt-1-result.md`. Gold-standard scored
  lower than control. Test was invalid because it selected on the
  dependent variable.

- **Gate 0b v2 (pattern-based test):** Specified in
  `docs/designs/production-roadmap-v1.md` §Gate 0b.

- **Population construction:** Control-2 complete (50 wallets,
  `data/wallet-pool-control-2-v1.json`). Control-1 pending —
  requires resolving the sample-matching design problem first
  (see §Next actions). Gold-standard v2 pending — requires
  pattern verification across ≥3 tokens per wallet.

- **Pattern check:** Attempted 2026-10-11. Blocked by Blockscout
  429 after 1 of 7 tokens (SHIB). Deferred pending IP cooldown.
  The check is re-runnable; the script is archived at
  `scripts/oneoff/pattern-check-v1.py` once copied.

## Provider reality

Blockscout has no published rate limit and no SLA. Under sustained
query load (pool construction, pattern checks, worker cycles), the
IP-level throttle triggers and persists for hours. Multiple
independent runs today were blocked at different stages.

This is an operational constraint, not a design flaw. It affects
how the roadmap's population construction is scoped:
- A 7-token pattern scan takes 2–3 days of intermittent querying,
  not 1 day, if competing with the worker.
- Alternatively, pause the worker during population construction.

Neither option is chosen in this note. Both are recorded so the
next session does not rediscover the constraint.

## Next actions (not scheduled)

1. **Resolve control-1 sample-matching.** Three options were
   proposed: pair matching (A), distribution matching (B), or drop
   the matching requirement and stratify (C). No decision recorded.

2. **Complete pattern check.** Re-run against a cooled-down IP,
   or pause the worker for a day and run it clean.

3. **Rebuild gold-standard v2.** Depends on outcome of (2).

The metric remains untested. It is not broken and not validated.
