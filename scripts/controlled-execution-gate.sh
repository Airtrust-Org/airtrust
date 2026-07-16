#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"

mode="${AIRTRUST_CONTROLLED_MODE:-}"
target="${AIRTRUST_CONTROLLED_TARGET:-}"
approval="${AIRTRUST_CONTROLLED_APPROVAL:-}"
db_path="${AIRTRUST_DB_PATH:-}"
target_ref="${AIRTRUST_CONTROLLED_TARGET_REF:-}"
snapshot_path="${AIRTRUST_CONTROLLED_SNAPSHOT_PATH:-}"
snapshot_ref="${AIRTRUST_CONTROLLED_SNAPSHOT_REF:-}"
rollback_path="${AIRTRUST_CONTROLLED_ROLLBACK_PATH:-}"
rollback_ref="${AIRTRUST_CONTROLLED_ROLLBACK_REF:-}"
safe_command="${AIRTRUST_CONTROLLED_SAFE_COMMAND:-}"
safe_command_reviewed="${AIRTRUST_CONTROLLED_SAFE_COMMAND_REVIEWED:-}"
allowed_targets="${AIRTRUST_CONTROLLED_ALLOWED_TARGETS:-local-copy,staging,production}"
allow_production="${AIRTRUST_CONTROLLED_PRODUCTION_APPROVED:-}"
allow_remote_d1="${AIRTRUST_CONTROLLED_ALLOW_REMOTE_D1:-NO}"

fail_reasons=()

add_reason() {
  fail_reasons+=("$1")
}

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

has_db_evidence() {
  [[ -n "$target_ref" ]] || [[ -n "$db_path" && -f "$db_path" && -r "$db_path" ]]
}

has_snapshot_evidence() {
  [[ -n "$snapshot_ref" ]] || [[ -n "$snapshot_path" && -f "$snapshot_path" && -r "$snapshot_path" ]]
}

has_rollback_evidence() {
  [[ -n "$rollback_ref" ]] || [[ -n "$rollback_path" && -f "$rollback_path" && -r "$rollback_path" ]]
}

target_is_allowed() {
  local candidate
  IFS=',' read -r -a candidates <<< "$allowed_targets"
  for candidate in "${candidates[@]}"; do
    if [[ "$(trim "$candidate")" == "$target" ]]; then
      return 0
    fi
  done
  return 1
}

contains_pattern() {
  local pattern="$1"
  printf '%s' "$safe_command" | LC_ALL=C grep -Eiq "$pattern"
}

command_matches_mode() {
  case "$mode" in
    dq01-backfill)
      contains_pattern '(^|[^a-z])backfill([^a-z]|$)' || return 1
      ! contains_pattern '(^|[^a-z])rebaseline([^a-z]|$)'
      ;;
    mig01-rebaseline)
      contains_pattern '(^|[^a-z])rebaseline([^a-z]|$)' || return 1
      ! contains_pattern '(^|[^a-z])backfill([^a-z]|$)'
      ;;
    audit-v2-schema)
      contains_pattern '(^|[^a-z])(audit-v2|audit_v2)([^a-z]|$)' || return 1
      contains_pattern '(^|[^a-z])schema([^a-z]|$)' || return 1
      ! contains_pattern '(^|[^a-z])backfill([^a-z]|$)'
      ! contains_pattern '(^|[^a-z])rebaseline([^a-z]|$)'
      ;;
    0389-schema)
      contains_pattern '(^|[^a-z])0389([^a-z]|$)' || return 1
      contains_pattern '(^|[^a-z])schema([^a-z]|$)' || return 1
      ! contains_pattern '(^|[^a-z])backfill([^a-z]|$)'
      ! contains_pattern '(^|[^a-z])rebaseline([^a-z]|$)'
      ;;
    *)
      return 1
      ;;
  esac
}

command_contains_deploy() {
  contains_pattern '(^|[^a-z])(deploy|pages[[:space:]]+deploy|wrangler[[:space:]]+deploy)([^a-z]|$)'
}

command_contains_remote_d1() {
  contains_pattern '(wrangler[[:space:]].*d1[[:space:]].*--remote|d1[[:space:]]+execute[[:space:]].*--remote|d1[[:space:]]+migrations[[:space:]]+apply[[:space:]].*--remote)'
}

target_looks_like_production() {
  local evidence="$db_path $target_ref $safe_command"
  printf '%s' "$evidence" | LC_ALL=C grep -Eiq '(^|[^a-z])(prod|production|live)([^a-z]|$)'
}

# Defense in depth: this gate must not be usable as an alternate path to apply
# a migration explicitly marked NO_GO_MIGRATION_PRODUCAO (or any other file
# under worker-airtrust/migrations/) that the ledger flags as blocked. This
# consults the SAME single source of truth as apply-migration-production.sh
# (scripts/migration-no-go-lib.mjs), regardless of which "mode" is declared.
check_safe_command_for_no_go_migrations() {
  [[ -n "$safe_command" ]] || return 0

  local token candidate resolved verdict found_any=0

  while IFS= read -r token; do
    [[ -n "$token" ]] || continue
    found_any=1

    if [[ "$token" == worker-airtrust/migrations/* || "$token" == /* ]]; then
      candidate="$token"
    else
      candidate="worker-airtrust/migrations/$token"
    fi

    if [[ "$candidate" == /* ]]; then
      resolved="$candidate"
    else
      resolved="$repo_root/$candidate"
    fi

    if [[ ! -f "$resolved" ]]; then
      # Referenced migration file does not exist in this worktree — cannot
      # confirm it is safe. Fail closed rather than silently allowing it.
      add_reason "referenced_migration_file_not_found:$token"
      continue
    fi

    verdict="$(node "$repo_root/scripts/check-single-migration-no-go.mjs" "$resolved" 2>/dev/null || echo "CHECK_FAILED")"
    if [[ "$verdict" == "BLOCKED" ]]; then
      add_reason "no_go_migration_referenced:$token"
    elif [[ "$verdict" != "OK" ]]; then
      add_reason "no_go_migration_check_failed:$token"
    fi
  done < <(printf '%s' "$safe_command" | grep -Eo '([A-Za-z0-9_./-]*/)?[0-9]{4}_[A-Za-z0-9_-]+\.sql' || true)

  return 0
}

[[ -n "$mode" ]] || add_reason "mode_not_declared"

if [[ -z "$target" ]]; then
  add_reason "target_not_declared"
elif ! target_is_allowed; then
  add_reason "target_not_allowed"
fi

[[ -n "$approval" ]] || add_reason "approval_missing"
has_db_evidence || add_reason "db_evidence_missing"
has_snapshot_evidence || add_reason "snapshot_missing"
has_rollback_evidence || add_reason "rollback_missing"

if [[ -z "$safe_command" ]]; then
  add_reason "safe_command_missing"
else
  command_matches_mode || add_reason "mode_command_mismatch"
  command_contains_deploy && add_reason "command_contains_deploy"

  if command_contains_remote_d1 && [[ "$allow_remote_d1" != "YES" ]]; then
    add_reason "remote_d1_not_authorized"
  fi

  check_safe_command_for_no_go_migrations
fi

[[ "$safe_command_reviewed" == "YES" ]] || add_reason "safe_command_not_reviewed"

if [[ "$target" == "production" ]]; then
  [[ "$allow_production" == "YES" ]] || add_reason "production_requires_additional_authorization"
elif [[ -n "$target" ]] && target_looks_like_production; then
  add_reason "target_looks_like_production"
fi

if (( ${#fail_reasons[@]} > 0 )); then
  echo "CONTROLLED_EXECUTION_GATE=BLOCKED_BY_ENVIRONMENT_CONTRACT"
  echo "MODE=${mode:-UNSET}"
  echo "TARGET=${target:-UNSET}"
  echo "APPROVAL=$([[ -n "$approval" ]] && echo DECLARED || echo UNSET)"
  echo "DB_EVIDENCE=$([[ -n "$target_ref" || ( -n "$db_path" && -f "$db_path" && -r "$db_path" ) ]] && echo YES || echo NO)"
  echo "SNAPSHOT_EVIDENCE=$([[ -n "$snapshot_ref" || ( -n "$snapshot_path" && -f "$snapshot_path" && -r "$snapshot_path" ) ]] && echo YES || echo NO)"
  echo "ROLLBACK_EVIDENCE=$([[ -n "$rollback_ref" || ( -n "$rollback_path" && -f "$rollback_path" && -r "$rollback_path" ) ]] && echo YES || echo NO)"
  echo "SAFE_COMMAND=$([[ -n "$safe_command" ]] && echo DECLARED || echo UNSET)"
  echo "REASONS=$(IFS=,; printf '%s' "${fail_reasons[*]}")"
  exit 2
fi

echo "CONTROLLED_EXECUTION_GATE=READY_FOR_MANUAL_CONTROLLED_EXECUTION"
echo "MODE=$mode"
echo "TARGET=$target"
echo "APPROVAL=DECLARED"
echo "DB_EVIDENCE=YES"
echo "SNAPSHOT_EVIDENCE=YES"
echo "ROLLBACK_EVIDENCE=YES"
echo "SAFE_COMMAND=DECLARED"
echo "SAFE_COMMAND_REVIEWED=YES"
echo "REMOTE_D1_ALLOWED=${allow_remote_d1}"
echo "NOTE=Gate passed. No mutation was executed by this script."
