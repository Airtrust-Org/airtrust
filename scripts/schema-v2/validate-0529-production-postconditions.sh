#!/usr/bin/env bash
# HFA 0529 — production read-only postconditions; no data writes.
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
ALLOWED_DB_NAME='airtrust-db'
BASELINE_ID='production-d1-baseline-v2-20260714'
CHANGE_ID='hfa-integration-bridge-0529'
FILE_HASH='09d17ed2551b6d63ccd01677eb47cd7bb758c295784df4f1afaead06e1dc62f4'
PLAN_HASH='2d71bcd602959a320fc3dc223ba127c07f53b3394608f235b4cdf2e0fd9222dd'
target="$ALLOWED_DB_NAME"
for arg in "$@"; do
  case "$arg" in
    --target=*) target="${arg#*=}" ;;
    *) echo 'HFA_0529_UNKNOWN_ARGUMENT' >&2; exit 1 ;;
  esac
done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo 'HFA_0529_PRODUCTION_TARGET_REQUIRED' >&2; exit 1; }
[[ "${EXPECTED_SGSO_RELATOS_BEFORE:-}" =~ ^[0-9]+$ ]] || { echo 'HFA_0529_PRE_APPLY_COUNT_MISSING' >&2; exit 1; }
[[ "${EXPECTED_SHA:-}" =~ ^[a-f0-9]{40}$ ]] || { echo 'HFA_0529_EXACT_RELEASE_SHA_MISSING' >&2; exit 1; }

query_count() {
  local sql="$1"
  (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") |
    node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{const p=JSON.parse(s);const r=p?.[0]?.results?.[0];const n=r&&(r.count??r.total);if(!Number.isSafeInteger(Number(n))||Number(n)<0||n===undefined){throw Error("HFA_0529_READBACK_INVALID");}console.log(Number(n));})'
}
assert_count() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(query_count "$sql")"
  [[ "$actual" == "$expected" ]] || {
    echo "HFA_0529_POSTCONDITION_${label}_MISMATCH expected=$expected actual=$actual" >&2
    exit 1
  }
  echo "HFA_0529_POSTCONDITION_OK=$label"
}

assert_count active_baseline 1 "SELECT COUNT(*) AS count FROM airtrust_schema_baselines_v2 WHERE baseline_id='$BASELINE_ID' AND status='ACTIVE';"
assert_count exact_ledger 1 "SELECT COUNT(*) AS count FROM airtrust_schema_changes_v2 WHERE change_id='$CHANGE_ID' AND baseline_id='$BASELINE_ID' AND file_hash='$FILE_HASH' AND plan_hash='$PLAN_HASH' AND github_sha='$EXPECTED_SHA';"
assert_count target_tables 2 "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('integracoes_hfa_config','integracoes_hfa_eventos');"
assert_count hfa_indexes 3 "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='index' AND name IN ('idx_integracoes_hfa_eventos_empresa_status','idx_integracoes_hfa_eventos_relato','idx_integracoes_hfa_eventos_hfa_event');"
assert_count hfa_tenant_triggers 2 "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='trigger' AND name IN ('trg_integracoes_hfa_eventos_tenant_insert','trg_integracoes_hfa_eventos_tenant_update') AND sql LIKE '%NEW.empresa_id%' AND sql LIKE '%RAISE(ABORT%';"
assert_count hfa_config_tenant_key 1 "SELECT COUNT(*) AS count FROM pragma_table_info('integracoes_hfa_config') WHERE name='empresa_id' AND [notnull]=1;"
assert_count hfa_event_tenant_key 1 "SELECT COUNT(*) AS count FROM pragma_table_info('integracoes_hfa_eventos') WHERE name='empresa_id' AND [notnull]=1;"
assert_count hfa_config_empty 0 'SELECT COUNT(*) AS count FROM integracoes_hfa_config;'
assert_count hfa_events_empty 0 'SELECT COUNT(*) AS count FROM integracoes_hfa_eventos;'
assert_count preserved_sgso_count "$EXPECTED_SGSO_RELATOS_BEFORE" 'SELECT COUNT(*) AS count FROM sgso_relatos;'
echo 'HFA_0529_PRODUCTION_POSTCONDITIONS=PASS'
