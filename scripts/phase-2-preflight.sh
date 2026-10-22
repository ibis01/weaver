#!/usr/bin/env bash
# Phase 2 pre-flight — records machine-readable evidence of the three
# roadmap-required checks. Does NOT modify code. Output is committed.
set -uo pipefail
cd "$(dirname "$0")/.."

OUT="docs/phase-2/preflight-$(date -u +%Y%m%dT%H%M%SZ).md"
{
  echo "# Phase 2 Pre-flight — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo ""
  echo "Baseline code: \`$(git rev-parse --short HEAD)\` — $(git log -1 --pretty=%s)"
  echo ""

  # ── Check 1: REJECTED attribution state ──────────────────────
  echo "## Check 1 — REJECTED attribution state"
  if grep -q '"REJECTED"\|REJECTED:' js/intelligence/smart-money/wallet-history.js; then
    echo "**Result: PASS** — REJECTED present in wallet-history.js"
    echo '```'
    grep -n "REJECTED" js/intelligence/smart-money/wallet-history.js
    echo '```'
  else
    echo "**Result: BLOCKED** — REJECTED not found in wallet-history.js"
    echo "Roadmap Phase 3 lists six attribution states; only five are defined."
    echo "Must be fixed in Phase 2 (in-phase) before trial start."
  fi
  echo ""

  # ── Check 2: silent provider catches ─────────────────────────
  echo "## Check 2 — Silent provider catches (manual review required)"
  echo ""
  echo "Each silent \`catch {}\` below must return an explicit error state,"
  echo "not \`null\`/\`[]\`/\`0\` that downstream code treats as 'no signal'."
  echo ""
  for f in js/intelligence/smart-money/solana-adapter.js \
           js/intelligence/smart-money/wallet-history.js \
           js/intelligence/deployer-graph.js \
           js/intelligence/evaluation/predictive-validator.js; do
    echo "### \`$f\`"
    echo '```'
    grep -nE "catch *\([^)]*\) *\{ *\}|catch *\([^)]*\) *\{ *_[^}]*\}" "$f" 2>/dev/null | head -40
    echo '```'
  done
  echo ""

  # ── Check 3: /meme/alert payload ─────────────────────────────
  echo "## Check 3 — /meme/alert reconstructability"
  echo ""
  echo "The payload must contain enough to replay the assessment:"
  echo "token + chain + assessment fields used for score + market snapshot + timestamp."
  echo ""
  echo '```js'
  grep -n -A50 'parts\[1\] === "alert"\|"meme".*"alert"\|meme/alert' cf-worker/index.js \
    | head -80
  echo '```'
  echo ""

  # ── Decision ─────────────────────────────────────────────────
  echo "## Decision"
  echo ""
  echo "Mark **START** only if:"
  echo "- Check 1 = PASS"
  echo "- Check 2 shows no silent zero/empty returns on failure paths"
  echo "- Check 3 payload contains token, chain, assessment, market, timestamp"
  echo ""
  echo "Otherwise mark **BLOCKED** with the specific failing check."
} > "$OUT"

echo "Wrote $OUT"
