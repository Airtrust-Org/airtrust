#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

fail=0
warn_count=0

print_block() {
  local title="$1"
  local body="$2"
  echo ""
  echo "ERROR: $title"
  echo "$body"
}

print_warn() {
  local title="$1"
  local body="$2"
  echo ""
  echo "WARNING: $title"
  echo "$body"
}

# ── Guard 1: --commit-dirty=true ──────────────────────────────────────────

commit_dirty_hits="$(
  rg -n --fixed-strings -- '--commit-dirty=true' package.json scripts .github \
    --glob '!audit-dangerous-ops.sh' 2>/dev/null | grep -v '^scripts/audit-dangerous-ops\.sh:' || true
)"

if [[ -n "$commit_dirty_hits" ]]; then
  print_block "dirty deploy bypass found" "$commit_dirty_hits"
  fail=1
fi

# ── Guard 2: git add . / git add -A in operational scripts ─────────────────

git_add_dangerous="$(
  rg -n --regexp '\bgit add (\.|-A)\b' scripts \
    --glob '!scripts/legacy/**' \
    --glob '!scripts/audit-dangerous-ops.sh' 2>/dev/null | \
    grep -vE '^\s*#|echo\s|printf\s|^\s*//' || true
)"

if [[ -n "$git_add_dangerous" ]]; then
  print_warn "git add . / git add -A found in scripts (review: these may be dev utility scripts)" "$git_add_dangerous"
  warn_count=$((warn_count + 1))
fi

# ── Allowlists ─────────────────────────────────────────────────────────────

# Scripts read-only/diagnóstico que usam --remote de forma segura
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
  "scripts/run-audit-rbac-v2-staging-readonly.sh"
  "scripts/run-validate-ssot-final.sh"
  "scripts/run-0389-staging-schema-readonly.sh"
  "scripts/setup_local_dev_mirror.sh"
  "scripts/smoke-view-historico.sh"
  "scripts/sync-core-qualificacoes.sh"
  "scripts/sync-prod-to-local.sh"
  "scripts/sync-production-clean.sh"
  "scripts/sync-production-to-local.sh"
  "scripts/test-performance-diagnostic.sh"
  "scripts/validate-data-consistency.sh"
  "scripts/validate-schema-parity.py"
  "scripts/validation/probe-solicitacoes-treinamento-schema-readonly.sh"
  # Reviewed 2026-07-18 (AIRTRUST_PRODUCTION_READINESS_20260718): both scripts
  # issue only SELECT/PRAGMA queries against sqlite_master/pragma_table_list/
  # d1_migrations and write results to local files — no DDL/DML, no --file
  # apply, no d1 migrations apply.
  "scripts/export-d1-schema-only.sh"
  "scripts/schema-v2/export-production-baseline-backup.sh"
)

# Scripts com proteção própria forte (env var obrigatória + confirmação)
self_protected_files=(
  "scripts/sync-d1-production-sanitized.sh"
  "scripts/run-audit-v2-staging-schema-apply.sh"
  "scripts/run-dq01-staging-backfill-apply.sh"
  "scripts/run-0389-staging-schema-apply.sh"
  "scripts/staging/seed-frms-sigvoos-comparable-from-cv.mjs"
  "scripts/staging/resolve-sigvoos-artificial-conflict-09999.mjs"
  "scripts/staging/reconcile-sigvoos-synthetic-staff-conflict-8899.mjs"
  # Official staging release workflow (ops/official-staging-release-workflow):
  # each of these hard-blocks production database IDs/names before any query,
  # requires an explicit confirmation env var for --apply, defaults to
  # dry-run, and is itself covered by
  # worker-airtrust/src/__tests__/ops/staging-release-workflow.test.ts.
  "scripts/staging/migration-ledger-preflight.mjs"
  "scripts/staging/apply-approved-migrations.sh"
  "scripts/staging/validate-0424-postconditions.sh"
  "scripts/staging/seed-qa-examiner-training.mjs"
  # Reviewed 2026-07-18 (AIRTRUST_PRODUCTION_READINESS_20260718):
  # - .github/workflows/apply-schema-change-v2.yml: manual workflow_dispatch
  #   only, environment: production (GitHub environment protection), requires
  #   exact confirm_production text + expected_sha match + file_hash match +
  #   active-baseline check before any write, takes a governance backup
  #   immediately before applying, and re-validates the schema contract after.
  # - scripts/apply-migration-production.sh: hard-blocks any migration marked
  #   NO_GO_MIGRATION_PRODUCAO with no override flag, requires
  #   AIRTRUST_ALLOW_PROD_DB_WRITE=YES + an exact confirmation string, requires
  #   a clean worktree on main with HEAD==origin/main. This is the reviewed
  #   wrapper CLAUDE.md documents as the only sanctioned path to apply a
  #   production migration.
  # - scripts/schema-v2/apply-schema-bootstrap-v2.sh: requires
  #   AIRTRUST_ALLOW_PROD_SCHEMA_BASELINE_V2=YES + an exact confirmation
  #   string, verifies the schema contract hash before and after applying.
  # - scripts/maintenance/recover-lms-emergencias-gerais.mjs: defaults to
  #   dry-run; --apply requires --confirm-emergencias-gerais-recovery or
  #   CONFIRM_EMERGENCIAS_GERAIS_RECOVERY=YES; not referenced by any npm
  #   script, CI workflow, or other automation — manual CLI tool only.
  # - scripts/seed-staging-smoke-user.mjs: validateD1Target() hard-rejects any
  #   database name containing "prod"/"production" or matching a known
  #   production/legacy-staging name, and only proceeds for the exact rebuilt
  #   staging D1 name; --apply requires an explicit confirmation flag/env var.
  # - scripts/staging/reconcile-approved-migration-ledger-lib.mjs:
  #   assertAllowedStagingTarget() hard-rejects known production/dev DB
  #   names/IDs and only proceeds for the exact staging D1 name+ID; its sole
  #   consumer (scripts/staging/reconcile-approved-migration-ledger.mjs) calls
  #   that assertion before any write and requires
  #   CONFIRM_STAGING_LEDGER_RECONCILIATION to match exactly, against a
  #   closed allowlist of 3 pre-approved migration files by SHA-256.
  ".github/workflows/apply-schema-change-v2.yml"
  "scripts/apply-migration-production.sh"
  "scripts/schema-v2/apply-schema-bootstrap-v2.sh"
  "scripts/maintenance/recover-lms-emergencias-gerais.mjs"
  "scripts/seed-staging-smoke-user.mjs"
  "scripts/staging/reconcile-approved-migration-ledger-lib.mjs"
)

# Scripts legados já bloqueados com banner + exit 1 (verificação relaxada)
known_blocked_legacy=(
  "scripts/purge-qualificacoes-cascade.sh"
  "scripts/aplicar-correcoes-db.sh"
  "scripts/apply-seed-data.sh"
  "scripts/cleanup-backup-tables.sh"
  "scripts/limpar_duplicatas.sh"
  "scripts/reset-manobras-completo.sh"
  "scripts/apply-migration-documentos.sh"
  "scripts/apply-migrations-production.sh"
  "scripts/apply-ssot-migrations.sh"
  "scripts/cleanup_old_backups.sh"
  "scripts/backfill-qualificacoes-sessoes-mes.sh"
  "scripts/backup_d1_to_r2.sh"
)

is_readonly_remote_file() {
  local file="$1"
  local allowed
  for allowed in "${readonly_remote_files[@]}"; do
    [[ "$file" == "$allowed" ]] && return 0
  done
  return 1
}

is_self_protected_file() {
  local file="$1"
  local allowed
  for allowed in "${self_protected_files[@]}"; do
    [[ "$file" == "$allowed" ]] && return 0
  done
  return 1
}

is_known_blocked_legacy() {
  local file="$1"
  local allowed
  for allowed in "${known_blocked_legacy[@]}"; do
    [[ "$file" == "$allowed" ]] && return 0
  done
  return 1
}

# ── Guard 3: direct remote D1 execution outside wrapper/allowlist ──────────

# Standard wrangler detection
remote_files_std="$(
  rg -l "wrangler d1 execute|npx wrangler d1 execute|\\['d1', 'execute'|\\[\"d1\", \"execute\"" \
    package.json scripts .github \
    --glob '!scripts/legacy/**' \
    --glob '!*.sql' 2>/dev/null | grep -v '^scripts/audit-dangerous-ops\.sh$' || true
)"

# Variable-based wrangler detection (e.g. ${WRANGLER[@]} d1 execute)
remote_files_var="$(
  rg -l '\$\{?WRANGLER.?\[?[@*]\]?\}?\s+d1\s+execute' \
    scripts --glob '!scripts/legacy/**' 2>/dev/null || true
)"

# Merge and deduplicate
remote_files="$(
  { echo "$remote_files_std"; echo "$remote_files_var"; } | sort -u | sed '/^$/d'
)"

while IFS= read -r file; do
  [[ -z "$file" ]] && continue
  [[ "$file" == "scripts/run-production-db-script.sh" ]] && continue
  [[ "$file" == "scripts/audit-dangerous-ops.sh" ]] && continue

  if ! rg -q -- '--remote' "$file"; then
    continue
  fi

  if is_readonly_remote_file "$file"; then
    continue
  fi

  if is_self_protected_file "$file"; then
    continue
  fi

  hits="$(rg -n "wrangler d1 execute|npx wrangler d1 execute|\\['d1', 'execute'|\\[\"d1\", \"execute\"|--remote|d1 execute" "$file" || true)"
  print_block "direct remote D1 execution outside approved wrapper/read-only allowlist: $file" "$hits"
  fail=1
done <<< "$remote_files"

# ── Guard 4: DDL/DML patterns colocated with --remote in scripts ───────────

ddl_dml_patterns='\b(DROP\s+(TABLE|VIEW|INDEX)|DELETE\s+FROM|INSERT\s+INTO|UPDATE\s+\S+\s+SET|ALTER\s+TABLE|CREATE\s+(TABLE|INDEX|VIEW))\b'

# Find lines containing BOTH a DDL/DML pattern AND --remote (and NOT --local)
# Exclude: comments, echo/printf/print, JS/Python files, sqlite3, string generation,
# local DB variable references, and self-protected scripts
ddl_remote_hits="$(
  rg -n -i "$ddl_dml_patterns" scripts \
    --glob '!scripts/legacy/**' \
    --glob '!scripts/audit-dangerous-ops.sh' \
    --glob '!scripts/run-production-db-script.sh' \
    --glob '!scripts/sync-d1-production-sanitized.sh' \
    --glob '!*.sql' \
    --glob '!*.mjs' \
    --glob '!*.py' \
    --glob '!*.js' 2>/dev/null | grep -vE ':(#|\s*#|.*\b(?:echo|printf|print\(|sed|awk|sqlite3|DB_LOCAL|append_sql)\b)' | while IFS=: read -r f l rest; do
    # Only flag if the line does NOT contain --local and the file DOES use --remote
    if ! echo "$rest" | grep -q -- '--local'; then
      if rg -q -- '--remote' "$f" 2>/dev/null; then
        echo "$f:$l:$rest"
      fi
    fi
  done || true
)"

if [[ -n "$ddl_remote_hits" ]]; then
  print_warn "scripts with both --remote access and DDL/DML patterns (verify remote usage is read-only)" "$ddl_remote_hits"
  warn_count=$((warn_count + 1))
fi

# ── Guard 4b: remote production migrations apply must be explicitly gated ───

remote_migration_apply_files="$(
  rg -l 'd1[[:space:]]+migrations[[:space:]]+apply.*--remote' scripts package.json \
    --glob '!scripts/legacy/**' 2>/dev/null | grep -v '^scripts/audit-dangerous-ops\.sh$' || true
)"

while IFS= read -r file; do
  [[ -z "$file" ]] && continue

  if [[ "$file" == "scripts/deploy-worker-only.sh" ]]; then
    if rg -q 'AIRTRUST_ALLOW_PROD_MIGRATIONS_APPLY' "$file" && \
      rg -q 'AIRTRUST_CONFIRM_PROD_MIGRATIONS_APPLY' "$file"; then
      continue
    fi
  fi

  # Reviewed 2026-07-18 (AIRTRUST_PRODUCTION_READINESS_20260718): false
  # positive. This is a read-only inventory script (see its own --help text:
  # "Does not run deploys, migrations, restore, or remote writes"); the
  # matched string is an `rg -e 'd1 migrations apply .*--remote'` SEARCH
  # PATTERN argument used to flag *other* risky scripts, not an invocation of
  # that command itself.
  if [[ "$file" == "scripts/audit-observability-dr-readiness.sh" ]]; then
    continue
  fi

  hits="$(rg -n 'd1[[:space:]]+migrations[[:space:]]+apply|AIRTRUST_ALLOW_PROD_MIGRATIONS_APPLY|AIRTRUST_CONFIRM_PROD_MIGRATIONS_APPLY' "$file" || true)"
  print_block "remote D1 migrations apply without explicit env gate: $file" "$hits"
  fail=1
done <<< "$remote_migration_apply_files"

# ── Guard 5: legacy directory audit ────────────────────────────────────────

legacy_sh_files="$(find scripts/legacy -name '*.sh' -type f 2>/dev/null || true)"

if [[ -n "$legacy_sh_files" ]]; then
  legacy_unprotected=""
  while IFS= read -r lf; do
    [[ -z "$lf" ]] && continue
    # Check for banner protection: must contain LEGACY and exit 1
    if head -10 "$lf" | rg -q "LEGACY.*(DO NOT RUN|BLOCKED|PROTECTED|disabled|ERROR)" 2>/dev/null; then
      continue
    fi
    if head -10 "$lf" | rg -q "exit 1" 2>/dev/null && head -10 "$lf" | rg -q "ERROR.*legacy|legacy.*ERROR|blocked|BLOCKED" 2>/dev/null; then
      continue
    fi
    # Check if it uses D1 remote - only flag unblocked scripts with remote access
    if rg -q "wrangler d1 execute" "$lf" 2>/dev/null && rg -q -- '--remote' "$lf" 2>/dev/null; then
      legacy_unprotected+="$lf"$'\n'
    fi
  done <<< "$legacy_sh_files"

  if [[ -n "$legacy_unprotected" ]]; then
    print_warn "legacy scripts with remote D1 access and no visible protection banner" "$legacy_unprotected"
    warn_count=$((warn_count + 1))
  fi
fi

# ── Result ─────────────────────────────────────────────────────────────────

if [[ "$fail" -ne 0 ]]; then
  echo ""
  echo "RESULT: FAIL"
  exit 1
fi

echo "OK: no --commit-dirty=true occurrences found"
echo "OK: no dangerous git add . / git add -A in operational scripts"
echo "OK: no unsafe direct remote D1 execute paths found"
if [[ "$warn_count" -gt 0 ]]; then
  echo "OK: guard passed ($warn_count warning(s) — review above)"
else
  echo "OK: no legacy/allowlist warnings"
fi
echo "RESULT: PASS"
