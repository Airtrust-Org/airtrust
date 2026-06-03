#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOCAL_STATE_DIR="$ROOT_DIR/worker-airtrust/.wrangler/state/v3/d1/miniflare-D1DatabaseObject"

skip() {
  echo "STATUS=$1"
  echo "REASON=$2"
  if [[ -n "${3:-}" ]]; then
    echo "TARGET=$3"
  fi
  exit 0
}

fail() {
  echo "STATUS=FAIL"
  echo "REASON=$1"
  if [[ -n "${2:-}" ]]; then
    echo "TARGET=$2"
  fi
  exit 1
}

require_authorization() {
  if [[ "${AIRTRUST_ALLOW_SCHEMA_PROBE:-}" != "YES" ]]; then
    skip "SKIPPED_SCHEMA_PROBE_NOT_AUTHORIZED" "AIRTRUST_ALLOW_SCHEMA_PROBE_not_set"
  fi

  TARGET="${AIRTRUST_SCHEMA_PROBE_TARGET:-}"
  case "$TARGET" in
    local|staging|production) ;;
    "")
      skip "SKIPPED_SCHEMA_PROBE_NOT_AUTHORIZED" "AIRTRUST_SCHEMA_PROBE_TARGET_unset"
      ;;
    *)
      skip "SKIPPED_SCHEMA_PROBE_NOT_AUTHORIZED" "AIRTRUST_SCHEMA_PROBE_TARGET_invalid"
      ;;
  esac

  if [[ "${AIRTRUST_CONFIRM_READ_ONLY_SCHEMA_PROBE:-}" != "YES" ]]; then
    skip "SKIPPED_SCHEMA_PROBE_NOT_AUTHORIZED" "AIRTRUST_CONFIRM_READ_ONLY_SCHEMA_PROBE_not_set" "$TARGET"
  fi

  if [[ "$TARGET" == "production" && "${AIRTRUST_CONFIRM_PRODUCTION_READ_ONLY:-}" != "YES" ]]; then
    skip "SKIPPED_SCHEMA_PROBE_NOT_AUTHORIZED" "AIRTRUST_CONFIRM_PRODUCTION_READ_ONLY_not_set" "$TARGET"
  fi
}

validate_readonly_sql() {
  local sql="$1"

  if [[ ! "$sql" =~ ^[[:space:]]*(PRAGMA|SELECT)([[:space:]]|\() ]]; then
    fail "non_readonly_sql_detected" "${TARGET:-}"
  fi

  if grep -Eiq '\b(ALTER|CREATE|DROP|INSERT|UPDATE|DELETE|REINDEX|VACUUM|ATTACH|DETACH|REPLACE|TRUNCATE)\b' <<<"$sql"; then
    fail "destructive_or_ddl_sql_detected" "${TARGET:-}"
  fi
}

discover_local_db() {
  local best_file=""
  local best_size="-1"
  local file size table_name

  [[ -d "$LOCAL_STATE_DIR" ]] || return 1

  while IFS= read -r -d '' file; do
    table_name="$(sqlite3 "$file" "SELECT name FROM sqlite_master WHERE type='table' AND name='solicitacoes_treinamento';" 2>/dev/null || true)"
    if [[ "$table_name" != "solicitacoes_treinamento" ]]; then
      continue
    fi

    size="$(stat -f '%z' "$file" 2>/dev/null || echo 0)"
    if [[ "$size" -gt "$best_size" ]]; then
      best_size="$size"
      best_file="$file"
    fi
  done < <(find "$LOCAL_STATE_DIR" -maxdepth 1 -type f -name '*.sqlite' ! -name 'metadata.sqlite' -print0)

  [[ -n "$best_file" ]] || return 1
  printf '%s\n' "$best_file"
}

run_local_probe() {
  command -v sqlite3 >/dev/null 2>&1 || skip "SKIPPED_LOCAL_DB_NOT_CONFIGURED" "sqlite3_not_available" "local"

  local db_path="${AIRTRUST_SCHEMA_PROBE_DB_PATH:-}"
  if [[ -z "$db_path" ]]; then
    db_path="$(discover_local_db || true)"
  fi

  [[ -n "$db_path" && -f "$db_path" ]] || skip "SKIPPED_LOCAL_DB_NOT_CONFIGURED" "local_database_not_found" "local"

  local pragma_table="PRAGMA table_info(solicitacoes_treinamento);"
  local pragma_index_list="PRAGMA index_list(solicitacoes_treinamento);"
  local pragma_index_info="PRAGMA index_info(idx_solicitacoes_treinamento_planejado);"

  validate_readonly_sql "$pragma_table"
  validate_readonly_sql "$pragma_index_list"
  validate_readonly_sql "$pragma_index_info"

  local tmp_dir snapshot table_exists columns index_list
  tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/airtrust-schema-probe.XXXXXX")"
  trap 'if [[ -n "${tmp_dir:-}" ]]; then rm -rf "$tmp_dir"; fi' EXIT

  snapshot="$tmp_dir/solicitacoes-treinamento.sqlite"
  cp "$db_path" "$snapshot"

  table_exists="$(sqlite3 "$snapshot" "SELECT name FROM sqlite_master WHERE type='table' AND name='solicitacoes_treinamento';" 2>/dev/null || true)"
  if [[ "$table_exists" == "solicitacoes_treinamento" ]]; then
    table_exists="yes"
    columns="$(sqlite3 "$snapshot" "$pragma_table" 2>/dev/null || true)"
    index_list="$(sqlite3 "$snapshot" "$pragma_index_list" 2>/dev/null || true)"
  else
    table_exists="no"
    columns=""
    index_list=""
  fi

  local treinamento_planejado_exists="no"
  local status_pre_agendamento_exists="no"
  local idx_planejado_exists="no"

  if grep -Eq '^[0-9]+\|treinamento_planejado_id\|' <<<"$columns"; then
    treinamento_planejado_exists="yes"
  fi

  if grep -Eq '^[0-9]+\|status_pre_agendamento\|' <<<"$columns"; then
    status_pre_agendamento_exists="yes"
  fi

  if grep -Eq '^[0-9]+\|idx_solicitacoes_treinamento_planejado\|' <<<"$index_list"; then
    idx_planejado_exists="yes"
  fi

  echo "STATUS=PASS"
  echo "TARGET=local"
  echo "TABLE_EXISTS=$table_exists"
  echo "TREINAMENTO_PLANEJADO_ID_EXISTS=$treinamento_planejado_exists"
  echo "STATUS_PRE_AGENDAMENTO_EXISTS=$status_pre_agendamento_exists"
  echo "IDX_SOLICITACOES_TREINAMENTO_PLANEJADO_EXISTS=$idx_planejado_exists"
}

require_authorization

case "$TARGET" in
  local)
    run_local_probe
    ;;
  staging|production)
    skip "SKIPPED_NO_APPROVED_SCHEMA_PROBE_RUNNER" "remote_probe_requires_non_remote_approved_runner" "$TARGET"
    ;;
esac
