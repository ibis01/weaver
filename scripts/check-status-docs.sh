#!/usr/bin/env bash
# Status-ledger freshness check (master plan Workstream A / Phase 0).
#
# The ledger (docs/status-ledger.yml) is the single authoritative
# current-state record. This script fails when:
#   1. The ledger is missing or lacks required schema keys.
#   2. The recorded repositoryCommit is not a reachable commit on the
#      current history (fabricated or from a squash-merged branch that is
#      not on main).
#   3. System code paths drifted past the ledger without a ledger bump:
#      the most recent commit in repositoryCommit..HEAD that touches a
#      system path must be the same commit that most recently touched the
#      ledger. Docs-only drift is tolerated; code drift forces a ledger
#      update in the same commit (docs/status-ledger.yml + verifiedAt).
#
# Historical sections (e.g. docs/phase-status.md below its current
# header) are NOT parsed; only the ledger is checked.
set -euo pipefail

LEDGER=docs/status-ledger.yml
fail() { echo "::error::$1"; exit 1; }

[ -f "$LEDGER" ] || fail "docs/status-ledger.yml missing - it is the authoritative current-state record"

for key in schema repositoryCommit verifiedAt deployment evidence gates trialWindows openBlockers evidenceLinks; do
  grep -qE "^${key}:" "$LEDGER" || fail "ledger schema key missing: $key"
done
grep -q '^schema: weaver-status-ledger/v1' "$LEDGER" || fail "unknown ledger schema line"
grep -q '^  methodologyVersion:' "$LEDGER" || fail "ledger missing deployment.methodologyVersion"

RECORDED=$(awk '/^repositoryCommit:/ {print $2; exit}' "$LEDGER")
[ -n "$RECORDED" ] || fail "repositoryCommit not set"

git cat-file -e "${RECORDED}^{commit}" 2>/dev/null \
  || fail "repositoryCommit $RECORDED is not present in this checkout history"
git merge-base --is-ancestor "$RECORDED" HEAD \
  || fail "repositoryCommit $RECORDED is not an ancestor of HEAD - ledger records a non-main commit"

# System paths whose changes require a ledger bump in the same commit.
SYSTEM_PATHS=(cf-worker/ js/ dist/ scripts/ .github/workflows/ index.html wrangler.jsonc _headers .assetsignore docker-compose.prod.yml package-lock.json concat.js)

last_code="$(git log -1 --format=%H "$RECORDED..HEAD" -- "${SYSTEM_PATHS[@]}" || true)"
last_ledger="$(git log -1 --format=%H "$RECORDED..HEAD" -- "$LEDGER" || true)"

if [ -n "$last_code" ]; then
  if [ -z "$last_ledger" ]; then
    echo "::error::system paths changed after the ledger without a ledger bump"
    echo "  last system-path commit: $(git log -1 --format='%h %s' "$last_code")"
    echo "  Fix: update docs/status-ledger.yml (verifiedAt + relevant fields) in the same commit/PR."
    exit 1
  fi
  if [ "$last_code" != "$last_ledger" ]; then
    echo "::error::system paths changed after the ledger's last bump without a new bump"
    echo "  last system-path commit: $(git log -1 --format='%h %s' "$last_code")"
    echo "  last ledger bump commit: $(git log -1 --format='%h %s' "$last_ledger")"
    echo "  Fix: update docs/status-ledger.yml (verifiedAt + relevant fields) in the same commit/PR."
    exit 1
  fi
fi

echo "status ledger OK: repositoryCommit=$RECORDED, system paths in sync with ledger"
