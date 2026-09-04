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
  "scripts/schema-v2/validate-ead-category-reconciliation-executor-0453.sh"
  "scripts/staging/validate-0453-postconditions.sh"
  "scripts/staging/validate-0475-postconditions.sh"
  "scripts/staging/validate-0476-postconditions.sh"
  "scripts/staging/validate-edb-0477-0480-postconditions.sh"
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
  "scripts/staging/seed-qa-simulator-planning.mjs"
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
  "scripts/production/apply-simuladores-matriz-remote-migration.sh"
  "scripts/production/reconcile-simuladores-0440-ledger.mjs"
  "scripts/production/lib/executors.mjs"
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

# ── Self-protected invariant validation ────────────────────────────────────
#
# The self_protected_files allowlist above exempts each listed file from
# Guard 3 (direct remote D1 execution) purely by PATH. That is not resilient:
# if a future PR edits one of those files and REMOVES the real protection
# (the env-var gate, the exact confirmation string, the NO_GO hard block, the
# production-target rejection, the clean-main/origin-SHA parity check, …), the
# path is still in the allowlist and the guard would keep passing silently.
#
# To close that gap, every self-protected file must STILL structurally contain
# its expected protections. `self_protected_invariants <canonical-path>` lists,
# one per line, the literal anchors that MUST all be present. If any anchor is
# missing (protection removed), the guard FAILS — it does not just warn — and
# the file also loses its Guard 3 exemption for that run (defense in depth).
#
# In addition to the presence check (approach A: structural invariants), each
# file is pinned by a fingerprint over its protection-bearing lines (approach
# B: hash pinning) so that an edit which weakens a gate WITHOUT removing an
# anchor literal — e.g. flipping `!=` to `==`, or changing a confirmation
# constant's value while keeping its name — is still caught. The exemption is
# evaluated per file, not blanket (approach C: per-operation allowlist).
#
# When a protection is *intentionally* changed in a reviewed PR, regenerate the
# pins with:  bash scripts/audit-dangerous-ops.sh --print-self-protected-pins
# and paste the new value into self_protected_pin() below (that PR is the
# deliberate, auditable authorization — exactly like lifting a NO_GO marker).

sha256_of_stdin() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum | awk '{print $1}'
  else
    shasum -a 256 | awk '{print $1}'
  fi
}

# Literal anchors (fixed strings) that MUST be present in each self-protected
# file. Removing any of these from the target file fails the guard.
self_protected_invariants() {
  case "$1" in
    "scripts/sync-d1-production-sanitized.sh")
      cat <<'EOF'
AIRTRUST_ALLOW_PROD_SYNC
AIRTRUST_CONFIRM_PROD_SYNC
I understand this exports production D1 and writes only to the selected non-production target
EOF
      ;;
    "scripts/run-audit-v2-staging-schema-apply.sh"|"scripts/run-dq01-staging-backfill-apply.sh"|"scripts/run-0389-staging-schema-apply.sh")
      cat <<'EOF'
AIRTRUST_CONTROLLED_TARGET
AIRTRUST_CONTROLLED_APPROVAL
AIRTRUST_CONTROLLED_ALLOW_REMOTE_D1
target_evidence_looks_like_production
*prod*|*production*|*live*
EOF
      ;;
    "scripts/staging/seed-frms-sigvoos-comparable-from-cv.mjs")
      cat <<'EOF'
YES_SEED_STAGING_SIGVOOS_FRMS_906
--confirm-apply must be exactly
--dry-run
const TARGET_ENV = 'staging'
EOF
      ;;
    "scripts/staging/resolve-sigvoos-artificial-conflict-09999.mjs")
      cat <<'EOF'
YES_RESOLVE_STAGING_SIGVOOS_CONFLICT_09999
--confirm-apply must be exactly
--dry-run
const TARGET_ENV = 'staging'
EOF
      ;;
    "scripts/staging/reconcile-sigvoos-synthetic-staff-conflict-8899.mjs")
      cat <<'EOF'
YES_RECONCILE_STAGING_SIGVOOS_SYNTHETIC_CONFLICT_8899
--confirm-apply must be exactly
--dry-run
const TARGET_ENV = 'staging'
EOF
      ;;
    "scripts/staging/migration-ledger-preflight.mjs")
      cat <<'EOF'
BLOCKED_DB_NAMES
7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae
preflight bloqueado
EOF
      ;;
    "scripts/staging/apply-approved-migrations.sh")
      cat <<'EOF'
AIRTRUST_STAGING_MIGRATION_APPLY
CONFIRM_STAGING_MIGRATION
DRY_RUN
EOF
      ;;
    "scripts/staging/validate-0424-postconditions.sh")
      cat <<'EOF'
ALLOWED_DB_NAME
airtrust-db-staging-baseline-20260701
--target=
EOF
      ;;
    "scripts/staging/seed-qa-examiner-training.mjs")
      cat <<'EOF'
BLOCKED_D1_NAMES
validateD1Target
AIRTRUST_STAGING_QA_SEED
CONFIRM_STAGING_QA_SEED
EOF
      ;;
    "scripts/staging/seed-qa-simulator-planning.mjs")
      cat <<'EOF'
BLOCKED_D1_NAMES
validateD1Target
AIRTRUST_STAGING_SIMULATOR_PLANNING_QA_SEED
CONFIRM_STAGING_SIMULATOR_PLANNING_QA_SEED
airtrust-db-staging-baseline-20260701
EOF
      ;;
    ".github/workflows/apply-schema-change-v2.yml")
      cat <<'EOF'
PRODUCTION_CONFIRMATION: AIRTRUST_PRODUCTION
expected_sha
file_hash
environment: production
confirm_production
EOF
      ;;
    "scripts/apply-migration-production.sh")
      cat <<'EOF'
NO_GO_MIGRATION_PRODUCAO
AIRTRUST_ALLOW_PROD_DB_WRITE
AIRTRUST_CONFIRM_PROD_DB_WRITE
I understand this may modify production data
origin/main
There is no override flag
EOF
      ;;
    "scripts/production/apply-simuladores-matriz-remote-migration.sh")
      cat <<'EOF'
AIRTRUST_ALLOW_PROD_DB_WRITE
AIRTRUST_CONFIRM_PROD_DB_WRITE
AIRTRUST_BACKUP_PATH
AIRTRUST_BACKUP_BYTES
AIRTRUST_BACKUP_SHA256
EXPECTED_DB_ID="7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae"
ALLOWED_0441="0441_simuladores_matriz_manobra_resolution.sql"
ALLOWED_0442="0442_simuladores_matriz_guia_relink.sql"
HEAD ($head_sha) != origin/main ($origin_sha)
EOF
      ;;
    "scripts/production/reconcile-simuladores-0440-ledger.mjs")
      cat <<'EOF'
assertProductionTarget
assertCleanMain
validateBackup
validateMigrationHash
CONFIRM_TEXT_RECONCILE
--fk-baseline é obrigatório
EOF
      ;;
    "scripts/production/lib/executors.mjs")
      cat <<'EOF'
allowWrites = false
executor em modo somente-leitura: escrita bloqueada (dry-run). Nenhuma escrita foi feita.
baseArgs.push(remote ? '--remote' : '--local');
EOF
      ;;
    "scripts/schema-v2/apply-schema-bootstrap-v2.sh")
      cat <<'EOF'
AIRTRUST_ALLOW_PROD_SCHEMA_BASELINE_V2
AIRTRUST_CONFIRM_PROD_SCHEMA_BASELINE_V2
AIRTRUST_SCHEMA_BASELINE_V2
check-schema-contract
EOF
      ;;
    "scripts/maintenance/recover-lms-emergencias-gerais.mjs")
      cat <<'EOF'
--confirm-emergencias-gerais-recovery
CONFIRM_EMERGENCIAS_GERAIS_RECOVERY
dry-run
EOF
      ;;
    "scripts/seed-staging-smoke-user.mjs")
      cat <<'EOF'
validateD1Target
CONFIRM_STAGING_D1
airtrust-db-production
EOF
      ;;
    "scripts/staging/reconcile-approved-migration-ledger-lib.mjs")
      cat <<'EOF'
BLOCKED_DB_NAMES
assertAllowedStagingTarget
AIRTRUST_STAGING_LEDGER_RECONCILIATION
EOF
      ;;
    *)
      return 1
      ;;
  esac
}

# Literal bypass tokens that must NOT appear in each self-protected file.
# Their presence signals a smuggled-in override for a hard block and FAILS.
self_protected_forbidden() {
  case "$1" in
    "scripts/apply-migration-production.sh")
      cat <<'EOF'
SKIP_NO_GO
FORCE_NO_GO
ALLOW_NO_GO
OVERRIDE_NO_GO
BYPASS_NO_GO
EOF
      ;;
    *)
      return 0
      ;;
  esac
}

# Minimum required occurrence count for anchors where a single hit is not
# enough (e.g. the schema-v2 bootstrap must re-check the contract both BEFORE
# and AFTER the write, i.e. at least two `check-schema-contract` invocations).
self_protected_min_count() {
  # echoes: <anchor>\t<min-count> lines
  case "$1" in
    "scripts/schema-v2/apply-schema-bootstrap-v2.sh")
      printf 'check-schema-contract\t2\n'
      ;;
    *)
      : # none
      ;;
  esac
}

# Fingerprint of the protection-bearing lines (approach B: hash pinning).
# Content-only (no line numbers), order-independent (sort -u) so unrelated
# edits elsewhere in the file do not move it, but any edit to a line that
# carries a protection anchor does.
compute_protection_fingerprint() {
  local canonical="$1" file="$2"
  local anchor
  self_protected_invariants "$canonical" | while IFS= read -r anchor; do
    [[ -z "$anchor" ]] && continue
    grep -F -- "$anchor" "$file" 2>/dev/null || true
  done | sort -u | sha256_of_stdin
}

# Pinned fingerprints. Regenerate with --print-self-protected-pins after an
# intentional, reviewed protection change.
self_protected_pin() {
  case "$1" in
    "scripts/sync-d1-production-sanitized.sh")
      echo "a4fc0a8c5e1244ea394a72a25d586019bc835e7b616d0835b6c6f6727cdcd669"
      ;;
    "scripts/run-audit-v2-staging-schema-apply.sh")
      echo "3d703b7136182511026e8e64d57d9a85ae43f50d6869065f9e5169743554d624"
      ;;
    "scripts/run-dq01-staging-backfill-apply.sh")
      echo "3d703b7136182511026e8e64d57d9a85ae43f50d6869065f9e5169743554d624"
      ;;
    "scripts/run-0389-staging-schema-apply.sh")
      echo "3d703b7136182511026e8e64d57d9a85ae43f50d6869065f9e5169743554d624"
      ;;
    "scripts/staging/seed-frms-sigvoos-comparable-from-cv.mjs")
      echo "0f0f43cf9a44e8776b045a60c83c7909267b4a22d5e3ed299c161472b90a309a"
      ;;
    "scripts/staging/resolve-sigvoos-artificial-conflict-09999.mjs")
      echo "0e07ff06908d60bfe0c0f9f729f7d5145268f105673d65a84bef38e316e26e6a"
      ;;
    "scripts/staging/reconcile-sigvoos-synthetic-staff-conflict-8899.mjs")
      echo "b9d4e6ca7f90b27f83e3d68429cdc1ce0ed57c786309d1920cf6a428a63d0c99"
      ;;
    "scripts/staging/migration-ledger-preflight.mjs")
      echo "f8529dc17720594b68a0f62df29173193eff31e3025511a8397976a35b4cc67c"
      ;;
    "scripts/staging/apply-approved-migrations.sh")
      echo "fe1abded7b0b4a008ac696630706601cb1d1c406fdab7ac4c9c68ca1ea81f8f1"
      ;;
    "scripts/staging/validate-0424-postconditions.sh")
      echo "c66b23135529479079ce18cc5e318ed0a18f87b2761df73dd538d9307c1bcd2e"
      ;;
    "scripts/staging/seed-qa-examiner-training.mjs")
      echo "2ded4dd62b005f00d0ff9b69a4e2632ef3a9f250226e797535629e5a51bf54e6"
      ;;
    "scripts/staging/seed-qa-simulator-planning.mjs")
      echo "202d8f5fa26fef461f695c45a43495c79b31c5ace2a9caa2af43c651a10b03ee"
      ;;
    ".github/workflows/apply-schema-change-v2.yml")
      echo "21c520eb487e6b9142b3c7508ab5aaaa529652ea01be62b10778bc73803e4b59"
      ;;
    "scripts/apply-migration-production.sh")
      echo "6b73a2c46202b21d618c8ad4263acb5bb5dfbb73be87013ce33780ae520e22f6"
      ;;
    "scripts/production/apply-simuladores-matriz-remote-migration.sh")
      echo "ffa129b0e4530a548d70e493a658eea572ee35c1239e85bcbad34b04dd8c0e9d"
      ;;
    "scripts/production/reconcile-simuladores-0440-ledger.mjs")
      echo "6265d441a6dec2e950e01cd009584adba82ebff27d76864f0344bc5f5aaa9363"
      ;;
    "scripts/production/lib/executors.mjs")
      echo "294343f2e52e3030b671dff453b545e76eb5a2a21e9e8572cb71405ed89227b5"
      ;;
    "scripts/schema-v2/apply-schema-bootstrap-v2.sh")
      echo "93bbb6872641c1219cd98acb4abd4d07c4c1524df0042d2b3f3cd2eca64163a1"
      ;;
    "scripts/maintenance/recover-lms-emergencias-gerais.mjs")
      echo "75f5e9322af3b3d6ef5de2fa3c9567cc1c4e048214ea37c20130bc292c377079"
      ;;
    "scripts/seed-staging-smoke-user.mjs")
      echo "cae26e268ddd7d71307c32728cd6ecd0ba347c84e4356bfee096bdfbab0647be"
      ;;
    "scripts/staging/reconcile-approved-migration-ledger-lib.mjs")
      echo "dbf7b1c8a4a7e30bf46bf13fb92262e08ff7587aa625b394ba294c5221964966"
      ;;
    *)
      return 1
      ;;
  esac
}

# Validate one self-protected file. $1 = canonical path (selects the invariant
# set), $2 = file to actually read (defaults to $1; a fixture in tests).
# Returns 0 when all invariants hold, 1 otherwise (printing an ERROR block).
validate_self_protected_file() {
  local canonical="$1"
  local file="${2:-$1}"
  local local_fail=0
  local anchor missing="" forbidden_hit="" pattern count min

  if [[ ! -f "$file" ]]; then
    print_block "self-protected file missing: $canonical" "expected at: $file"
    return 1
  fi

  if ! self_protected_invariants "$canonical" >/dev/null 2>&1; then
    print_block "self-protected file has no declared invariants: $canonical" \
      "Every entry in self_protected_files must declare its expected protections in self_protected_invariants(). Add them before allowlisting this file."
    return 1
  fi

  # (A) required literal anchors must all be present
  while IFS= read -r anchor; do
    [[ -z "$anchor" ]] && continue
    if ! grep -qF -- "$anchor" "$file"; then
      missing+="  - $anchor"$'\n'
    fi
  done < <(self_protected_invariants "$canonical")

  if [[ -n "$missing" ]]; then
    print_block "self-protected file lost a required protection: $canonical" \
      "Missing expected invariant(s):"$'\n'"$missing""If this protection was intentionally changed, update self_protected_invariants() and the pin in a reviewed PR."
    local_fail=1
  fi

  # Minimum-occurrence anchors (e.g. contract re-check before AND after)
  while IFS=$'\t' read -r pattern min; do
    [[ -z "$pattern" ]] && continue
    count="$(grep -cF -- "$pattern" "$file" 2>/dev/null || echo 0)"
    if [[ "$count" -lt "$min" ]]; then
      print_block "self-protected file weakened a repeated protection: $canonical" \
        "Expected at least $min occurrence(s) of '$pattern', found $count."
      local_fail=1
    fi
  done < <(self_protected_min_count "$canonical")

  # (C-adjacent) forbidden bypass tokens must be absent
  while IFS= read -r pattern; do
    [[ -z "$pattern" ]] && continue
    if grep -qF -- "$pattern" "$file"; then
      forbidden_hit+="  - $pattern"$'\n'
    fi
  done < <(self_protected_forbidden "$canonical")

  if [[ -n "$forbidden_hit" ]]; then
    print_block "self-protected file introduced a bypass token: $canonical" \
      "Forbidden bypass token(s) present:"$'\n'"$forbidden_hit"
    local_fail=1
  fi

  # (B) hash pinning of protection-bearing lines
  local pinned actual
  pinned="$(self_protected_pin "$canonical" 2>/dev/null || true)"
  if [[ -n "$pinned" ]]; then
    actual="$(compute_protection_fingerprint "$canonical" "$file")"
    if [[ "$actual" != "$pinned" ]]; then
      print_block "self-protected protection block changed (pin mismatch): $canonical" \
        "expected fingerprint: $pinned"$'\n'"actual fingerprint:   $actual"$'\n'"A protection-bearing line was edited. If intentional and reviewed, regenerate with: bash scripts/audit-dangerous-ops.sh --print-self-protected-pins"
      local_fail=1
    fi
  fi

  return "$local_fail"
}

# ── CLI modes for the self-protected checks ────────────────────────────────

if [[ "${1:-}" == "--list-self-protected-files" ]]; then
  for spf in "${self_protected_files[@]}"; do
    printf '%s\n' "$spf"
  done
  exit 0
fi

if [[ "${1:-}" == "--print-self-protected-invariants" ]]; then
  if [[ -z "${2:-}" ]]; then
    echo "usage: $0 --print-self-protected-invariants <canonical-path>" >&2
    exit 2
  fi
  self_protected_invariants "$2"
  exit 0
fi

if [[ "${1:-}" == "--print-self-protected-pins" ]]; then
  for spf in "${self_protected_files[@]}"; do
    printf '    "%s")\n      echo "%s"\n      ;;\n' \
      "$spf" "$(compute_protection_fingerprint "$spf" "$spf")"
  done
  exit 0
fi

if [[ "${1:-}" == "--check-self-protected" ]]; then
  # --check-self-protected <canonical-path> [<file-to-read>]
  if [[ -z "${2:-}" ]]; then
    echo "usage: $0 --check-self-protected <canonical-path> [<file-to-read>]" >&2
    exit 2
  fi
  if validate_self_protected_file "$2" "${3:-$2}"; then
    echo "OK: $2 self-protection invariants present"
    exit 0
  fi
  echo "RESULT: FAIL"
  exit 1
fi

# ── Guard 6: self-protected files still carry their protections ────────────
#
# Runs BEFORE Guard 3 so that any file which lost its protections is both
# reported here AND stripped of its Guard 3 exemption below.

self_protected_failed=""
for spf in "${self_protected_files[@]}"; do
  if ! validate_self_protected_file "$spf" "$spf"; then
    self_protected_failed+="$spf"$'\n'
    fail=1
  fi
done

is_self_protected_ok() {
  local file="$1"
  is_self_protected_file "$file" || return 1
  # Exemption only holds if the file passed its invariant validation.
  case $'\n'"$self_protected_failed" in
    *$'\n'"$file"$'\n'*) return 1 ;;
  esac
  return 0
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

  # Exempt only if the file is self-protected AND still passed Guard 6's
  # invariant validation (a de-protected file forfeits its exemption).
  if is_self_protected_ok "$file"; then
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

  if is_self_protected_ok "$file"; then
    continue
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
