#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOCAL_STATE_DIR="$ROOT_DIR/worker-airtrust/.wrangler/state/v3/d1/miniflare-D1DatabaseObject"
WRANGLER_CONFIG="$ROOT_DIR/worker-airtrust/wrangler.toml"

# ─── D1 database name mappings ───
# These must match the `database_name` field in wrangler.toml [[env.XXX.d1_databases]].

d1_db_name_for_target() {
  case "$1" in
    staging)    echo "airtrust-db-staging" ;;
    production) echo "airtrust-db" ;;
    *)          echo "" ;;
  esac
}

# ─── Output helpers ───

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

# ─── Authorization ───

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

# ─── SQL validation ───

validate_readonly_sql() {
  local sql="$1"

  # Must start with PRAGMA or SELECT (whitespace-tolerant)
  if [[ ! "$sql" =~ ^[[:space:]]*(PRAGMA|SELECT)([[:space:]]|\() ]]; then
    fail "non_readonly_sql_detected" "${TARGET:-}"
  fi

  # Must NOT contain destructive or DDL keywords
  if grep -Eiq '\b(ALTER|CREATE|DROP|INSERT|UPDATE|DELETE|REINDEX|VACUUM|ATTACH|DETACH|REPLACE|TRUNCATE)\b' <<<"$sql"; then
    fail "destructive_or_ddl_sql_detected" "${TARGET:-}"
  fi

  # Must NOT contain SELECT * (row data retrieval)
  if grep -Eiq 'SELECT[[:space:]]+\*' <<<"$sql"; then
    fail "select_star_detected" "${TARGET:-}"
  fi

  # Must NOT contain FROM clauses that could read row data
  if grep -Eiq '\bFROM\b' <<<"$sql"; then
    # Allow only sqlite_master (structural metadata, not tenant data)
    if ! grep -Eiq '\bFROM\s+sqlite_master\b' <<<"$sql"; then
      fail "from_clause_on_user_table_detected" "${TARGET:-}"
    fi
  fi
}

# ─── Local probe ───

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
  echo "REMOTE_RUNNER_USED=no"
}

# ─── Remote probe (staging / production) ───

run_remote_probe() {
  local target="$1"
  local wrangler_env="$target"
  local db_name
  db_name="$(d1_db_name_for_target "$target")"

  if [[ -z "$db_name" ]]; then
    skip "SKIPPED_NO_APPROVED_SCHEMA_PROBE_RUNNER" "no_d1_database_mapping_for_target" "$target"
  fi

  # Verify wrangler and config are available
  if [[ ! -f "$WRANGLER_CONFIG" ]]; then
    skip "SKIPPED_NO_APPROVED_SCHEMA_PROBE_RUNNER" "wrangler_config_not_found" "$target"
  fi

  # Verify npx is available (wrangler is a project dev dependency)
  command -v npx >/dev/null 2>&1 || skip "SKIPPED_REMOTE_PROBE_NOT_CONFIGURED" "npx_not_available" "$target"

  # ── PRAGMA statements (validated before execution) ──

  local pragma_table="PRAGMA table_info(solicitacoes_treinamento);"
  local pragma_index_list="PRAGMA index_list(solicitacoes_treinamento);"
  local pragma_index_info="PRAGMA index_info(idx_solicitacoes_treinamento_planejado);"

  validate_readonly_sql "$pragma_table"
  validate_readonly_sql "$pragma_index_list"
  validate_readonly_sql "$pragma_index_info"

  # ── Build wrangler base arguments ──
  # --json: machine-parseable output, no ASCII table borders
  # --remote: execute against the remote D1 database (not local)
  # --config: explicit path to the wrangler.toml
  # --env: which environment to use (staging | production)

  local wrangler_base=(npx wrangler d1 execute "$db_name"
    --config "$WRANGLER_CONFIG"
    --env "$wrangler_env"
    --remote
    --json)

  # ── Execute PRAGMA table_info ──

  local table_info_json table_info_rc
  set +e
  table_info_json="$("${wrangler_base[@]}" --command="$pragma_table" 2>&1)"
  table_info_rc=$?
  set -e

  if [[ $table_info_rc -ne 0 ]]; then
    # Check if the error is about missing table (which means table doesn't exist)
    if grep -qi "no such table" <<<"$table_info_json"; then
      echo "STATUS=PASS"
      echo "TARGET=$target"
      echo "TABLE_EXISTS=no"
      echo "TREINAMENTO_PLANEJADO_ID_EXISTS=no"
      echo "STATUS_PRE_AGENDAMENTO_EXISTS=no"
      echo "IDX_SOLICITACOES_TREINAMENTO_PLANEJADO_EXISTS=no"
      echo "REMOTE_RUNNER_USED=yes"
      return 0
    fi

    # Classify common failure modes for operator guidance
    # Error output is NOT printed — only structural metadata is emitted.
    # The fail reason tells the operator what to fix (auth, network, other).
    if echo "$table_info_json" | grep -qi "not.*authenticated\|login\|you must be logged in"; then
      fail "remote_wrangler_not_authenticated__run_wrangler_login" "$target"
    elif echo "$table_info_json" | grep -qi "network\|ENOTFOUND\|ETIMEDOUT\|ECONNREFUSED\|could not reach"; then
      fail "remote_wrangler_network_error" "$target"
    else
      fail "remote_wrangler_error" "$target"
    fi
  fi

  # ── Parse table_info output ──
  # PRAGMA table_info returns column metadata (cid, name, type, notnull, dflt_value, pk).
  # This is structural metadata — no row data, no PII.
  # We check for the presence of specific column names.

  local table_exists="yes"
  local treinamento_planejado_exists="no"
  local status_pre_agendamento_exists="no"

  if echo "$table_info_json" | grep -q '"treinamento_planejado_id"'; then
    treinamento_planejado_exists="yes"
  fi

  if echo "$table_info_json" | grep -q '"status_pre_agendamento"'; then
    status_pre_agendamento_exists="yes"
  fi

  # ── Execute PRAGMA index_list ──

  local index_list_json index_list_rc
  set +e
  index_list_json="$("${wrangler_base[@]}" --command="$pragma_index_list" 2>&1)"
  index_list_rc=$?
  set -e

  if [[ $index_list_rc -ne 0 ]]; then
    fail "remote_wrangler_error_index_list" "$target"
  fi

  local idx_planejado_exists="no"
  if echo "$index_list_json" | grep -q '"idx_solicitacoes_treinamento_planejado"'; then
    idx_planejado_exists="yes"
  fi

  # ── Output sanitized summary ──
  # Only structural yes/no answers. No table data, no column values, no PII.

  echo "STATUS=PASS"
  echo "TARGET=$target"
  echo "TABLE_EXISTS=$table_exists"
  echo "TREINAMENTO_PLANEJADO_ID_EXISTS=$treinamento_planejado_exists"
  echo "STATUS_PRE_AGENDAMENTO_EXISTS=$status_pre_agendamento_exists"
  echo "IDX_SOLICITACOES_TREINAMENTO_PLANEJADO_EXISTS=$idx_planejado_exists"
  echo "REMOTE_RUNNER_USED=yes"
}

# ═══════════════════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════════════════

require_authorization

case "$TARGET" in
  local)
    run_local_probe
    ;;
  staging|production)
    run_remote_probe "$TARGET"
    ;;
  *)
    # This should never be reached (require_authorization validates TARGET)
    skip "SKIPPED_SCHEMA_PROBE_NOT_AUTHORIZED" "unexpected_target" "$TARGET"
    ;;
esac
