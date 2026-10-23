#!/usr/bin/env bash
# Passive check — has any alert with a cohort field landed since verification?
set -euo pipefail

VERIFIED_MS=1792775127260
WORKER="https://weaver-proxy.ibis01-weaver.workers.dev"

RESPONSE=$(curl -sS --retry 2 --max-time 30 \
  "${WORKER}/meme/alerts?since=${VERIFIED_MS}&limit=100")

echo "$RESPONSE" | python3 -c "
import sys, json
from collections import Counter
from datetime import datetime, timezone

try:
    d = json.load(sys.stdin)
except Exception as e:
    print('❌ Parse error:', e)
    sys.exit(1)

alerts = d.get('alerts', [])
verified = $VERIFIED_MS

new = [a for a in alerts if (a.get('assessment',{}).get('observedAtMs') or 0) >= verified]
cohorts = Counter(a.get('assessment',{}).get('cohort', 'MISSING') for a in new)

print(f'checked at: {datetime.now(timezone.utc).isoformat()}')
print(f'alerts since verification ({verified}): {len(new)}')
print(f'cohort breakdown: {dict(cohorts)}')
if new:
    print()
    for a in new[:10]:
        a_ = a.get('assessment', {})
        print(f\"  {a_.get('identity',{}).get('chain')} | cohort={a_.get('cohort','MISSING')} | {a.get('symbol')} | score={a_.get('opportunityScore')} | {datetime.fromtimestamp((a_.get('observedAtMs') or 0)/1000, tz=timezone.utc).isoformat()}\")
    if 'MISSING' not in cohorts:
        print()
        print('✅ FIRST VALID TRIAL OBSERVATIONS')
"
