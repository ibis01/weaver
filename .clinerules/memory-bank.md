# Weaver Memory Bank — Agent Instructions

## Purpose
This Memory Bank provides project context for coding agents working on the Weaver repository. It is NOT a substitute for inspecting the actual codebase.

## Mandatory Workflow

### Before Starting Work
1. **Read this Memory Bank** to understand project context
2. **Inspect the actual repository** — code is truth, Memory Bank is context
3. **Verify assumptions** against current implementation
4. **Check git status** for uncommitted changes

### During Work
- Treat source code as implementation truth
- Treat Memory Bank as project context, not proof something exists
- If Memory Bank conflicts with repository: inspect repo → determine actual implementation → update Memory Bank if repo intentionally changed
- Never fabricate completed work
- Never turn unknown/missing data into zero (Constitution §2.9, §6.3)
- Preserve Weaver's non-custodial/security boundaries (Constitution §2.1)
- Preserve Track Record immutability (Constitution §2.3, §4.4)

### After Significant Work
- Update `activeContext.md` with current state
- Update `progress.md` with completion status
- Record important architectural decisions in `systemPatterns.md`
- Record environment/tooling changes in `techContext.md`

## Workflow Pattern
AUDIT → PLAN → IMPLEMENT → TEST → VERIFY → MEMORY UPDATE → COMMIT

## Critical Constraints
- Avoid unrelated changes
- One commit per logical change
- Follow Weaver Constitution v1.0 and Global Engineering Constitution v2.0
- Maintain CSP compliance (no inline styles)
- Preserve evidence provenance
- Keep scoring versioned
- Use deterministic code for financial calculations; AI interprets evidence, not truth

## File Purposes
- `projectbrief.md` — Stable identity and purpose
- `productContext.md` — User-facing principles and behavior
- `activeContext.md` — Current development state
- `systemPatterns.md` — Architectural rules and boundaries
- `techContext.md` — Tooling, dependencies, deployment
- `progress.md` — Implementation status tracking

## Conflict Resolution
If Memory Bank conflicts with the current repository:
1. Inspect the repository
2. Determine the actual implementation
3. Do not blindly follow the Memory Bank
4. Update the Memory Bank if the repository intentionally changed

## Quality Rules
- Keep files concise
- Do not copy entire source files
- Do not duplicate README documentation unnecessarily
- Do not store secrets, API keys, tokens, private keys, seed phrases, or credentials
- Clearly distinguish IMPLEMENTED / PARTIAL / PLANNED / UNKNOWN
- Use exact filenames and module names when verified
- Do not claim something exists without finding it