#!/usr/bin/env bash
# HFA 0529 — production D1 read-only physical preflight. Never applies schema.
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
ALLOWED_DB_NAME='airtrust-db'
BASELINE_ID='production-d1-baseline-v2-20260714'
CHANGE_ID='hfa-integration-bridge-0529'
target="$ALLOWED_DB_NAME"
for arg in "$@"; do
  case "$arg" in
    --target=*) target="${arg#*=}" ;;
    *) echo "HFA_0529_UNKNOWN_ARGUMENT" >&2; exit 1 ;;
  esac
done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo 'HFA_0529_PRODUCTION_TARGET_REQUIRED' >&2; exit 1; }

query_count() {
  local sql="$1"
  (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") |
    node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{const p=JSON.parse(s);const r=p?.[0]?.results?.[0];const n=r&&(r.count??r.total);if(!Number.isSafeInteger(Number(n))||Number(n)<0||n===undefined){throw Error("HFA_0529_READBACK_INVALID");}console.log(Number(n));})'
}
assert_count() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(query_count "$sql")"
  [[ "$actual" == "$expected" ]] || {
    echo "HFA_0529_PREFLIGHT_${label}_MISMATCH expected=$expected actual=$actual" >&2
    exit 1
  }
  echo "HFA_0529_PREFLIGHT_OK=$label"
}

assert_count active_baseline 1 "SELECT COUNT(*) AS count FROM airtrust_schema_baselines_v2 WHERE baseline_id='$BASELINE_ID' AND status='ACTIVE';"
assert_count unapplied_change 0 "SELECT COUNT(*) AS count FROM airtrust_schema_changes_v2 WHERE change_id='$CHANGE_ID';"
assert_count source_tables 2 "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('empresas','sgso_relatos');"
assert_count source_company_key 1 "SELECT COUNT(*) AS count FROM pragma_table_info('empresas') WHERE name='id';"
assert_count source_tenant_columns 3 "SELECT COUNT(*) AS count FROM pragma_table_info('sgso_relatos') WHERE name IN ('id','empresa_id','deleted_at');"
assert_count hfa_tables_absent 0 "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('integracoes_hfa_config','integracoes_hfa_eventos');"
assert_count hfa_indexes_absent 0 "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='index' AND name IN ('idx_integracoes_hfa_eventos_empresa_status','idx_integracoes_hfa_eventos_relato','idx_integracoes_hfa_eventos_hfa_event');"
assert_count hfa_triggers_absent 0 "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='trigger' AND name IN ('trg_integracoes_hfa_eventos_tenant_insert','trg_integracoes_hfa_eventos_tenant_update');"

# Preserve a non-sensitive cardinality witness across the governed apply.
before="$(query_count 'SELECT COUNT(*) AS count FROM sgso_relatos;')"
[[ "$before" =~ ^[0-9]+$ ]] || { echo 'HFA_0529_SGSO_COUNT_INVALID' >&2; exit 1; }
[[ -n "${GITHUB_OUTPUT:-}" ]] || { echo 'HFA_0529_GITHUB_OUTPUT_REQUIRED' >&2; exit 1; }
printf 'sgso_relatos_before=%s\n' "$before" >> "$GITHUB_OUTPUT"
echo 'HFA_0529_PRODUCTION_PREFLIGHT=PASS'
