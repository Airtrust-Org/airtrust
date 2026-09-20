#!/usr/bin/env bash
# source_reference: worker-airtrust/schema-v2/controle-voos-flight-justifications-0506.json
# operational_decision: read-only production Schema V2 postconditions; no writes
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db"
BASELINE_ID="production-d1-baseline-v2-20260714"
CHANGE_ID="controle-voos-flight-justifications-0506"
target="$ALLOWED_DB_NAME"
for arg in "$@"; do
  case "$arg" in
    --target=*) target="${arg#*=}" ;;
    *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;;
  esac
done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: 0506 production postconditions refused target: $target" >&2; exit 1; }
query_count() {
  local sql="$1"
  (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") |
    node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"
}
assert_count() {
  local label="$1" expected="$2" sql="$3" count
  count="$(query_count "$sql")"
  [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }
  echo "POSTCONDITION_OK=$label"
}
assert_count active-baseline 1 "SELECT COUNT(*) count FROM airtrust_schema_baselines_v2 WHERE baseline_id='$BASELINE_ID' AND status='ACTIVE';"
assert_count applied-change 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='$CHANGE_ID';"
assert_count catalog-table-present 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='cv_justificativas_voo';"
assert_count link-table-present 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='cv_voo_justificativas';"
assert_count catalog-index-present 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='index' AND name='idx_cv_justificativas_voo_empresa_codigo';"
assert_count flight-index-present 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='index' AND name='idx_cv_voo_justificativas_empresa_voo';"
assert_count tenant-triggers-present 2 "SELECT COUNT(*) count FROM sqlite_master WHERE type='trigger' AND name IN ('trg_cv_voo_justificativas_tenant_insert_0506','trg_cv_voo_justificativas_tenant_update_0506');"
assert_count invalid-minute-rows 0 "SELECT COUNT(*) count FROM cv_voo_justificativas WHERE minutos <= 0 OR minutos > 1440;"
echo CONTROLE_VOOS_FLIGHT_JUSTIFICATIONS_0506_PRODUCTION_POSTCONDITIONS=PASS
