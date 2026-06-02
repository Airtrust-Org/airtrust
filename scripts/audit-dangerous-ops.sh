#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

fail=0

print_block() {
  local title="$1"
  local body="$2"
  echo ""
  echo "ERROR: $title"
  echo "$body"
}

commit_dirty_hits="$(
  rg -n --fixed-strings -- '--commit-dirty=true' package.json scripts .github \
    --glob '!audit-dangerous-ops.sh' 2>/dev/null | grep -v '^scripts/audit-dangerous-ops\.sh:' || true
)"

if [[ -n "$commit_dirty_hits" ]]; then
  print_block "dirty deploy bypass found" "$commit_dirty_hits"
  fail=1
fi

readonly_remote_files=(
  "scripts/apply-refactor-migrations.sh"
  "scripts/audit-prod-simple.sh"
  "scripts/audit-prod-tables.sh"
  "scripts/backup-database.sh"
  "scripts/check-integridade-qualificacoes.sh"
  "scripts/clone-prod-REAL.sh"
  "scripts/clone-prod-data.sh"
  "scripts/clone-prod-to-local-COMPLETO.sh"
  "scripts/create-test-user.sh"
  "scripts/diagnose-rubens-instrutor-role.sh"
  "scripts/extract-essencial.sh"
  "scripts/fase31_diagnostico.sh"
  "scripts/inspect_ssot.sh"
  "scripts/run-validate-ssot-final.sh"
  "scripts/setup_local_dev_mirror.sh"
  "scripts/smoke-view-historico.sh"
  "scripts/sync-core-qualificacoes.sh"
  "scripts/sync-prod-to-local.sh"
  "scripts/sync-production-clean.sh"
  "scripts/sync-production-to-local.sh"
  "scripts/test-performance-diagnostic.sh"
  "scripts/validate-data-consistency.sh"
  "scripts/validate-schema-parity.py"
)

is_readonly_remote_file() {
  local file="$1"
  local allowed
  for allowed in "${readonly_remote_files[@]}"; do
    [[ "$file" == "$allowed" ]] && return 0
  done
  return 1
}

remote_files="$(
  rg -l "wrangler d1 execute|npx wrangler d1 execute|\\['d1', 'execute'|\\[\"d1\", \"execute\"" \
    package.json scripts .github \
    --glob '!scripts/legacy/**' \
    --glob '!*.sql' 2>/dev/null | grep -v '^scripts/audit-dangerous-ops\.sh$' || true
)"

while IFS= read -r file; do
  [[ -z "$file" ]] && continue
  [[ "$file" == "scripts/run-production-db-script.sh" ]] && continue

  if ! rg -q -- '--remote' "$file"; then
    continue
  fi

  if is_readonly_remote_file "$file"; then
    continue
  fi

  hits="$(rg -n "wrangler d1 execute|npx wrangler d1 execute|\\['d1', 'execute'|\\[\"d1\", \"execute\"|--remote" "$file" || true)"
  print_block "direct remote D1 execution outside approved wrapper/read-only allowlist: $file" "$hits"
  fail=1
done <<< "$remote_files"

if [[ "$fail" -ne 0 ]]; then
  echo ""
  echo "RESULT: FAIL"
  exit 1
fi

echo "OK: no --commit-dirty=true occurrences found"
echo "OK: no unsafe direct remote D1 execute paths found"
echo "RESULT: PASS"
