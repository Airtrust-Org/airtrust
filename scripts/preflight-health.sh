#!/usr/bin/env bash
set -euo pipefail

printf '\n=== AIRTRUST PRE-FLIGHT HEALTH CHECK ===\n'
printf 'Timestamp: %s\n\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"

printf '[1/4] git status --short\n'
git status --short --untracked-files=all || true
printf '\n'

printf '[2/4] TypeScript check\n'
npx tsc --noEmit
printf '\n'

printf '[3/4] Production build\n'
npm run build
printf '\n'

printf '[4/4] Worker tests\n'
npm run test:worker
printf '\n'

printf '=== PRE-FLIGHT RESULT: PASS ===\n'
