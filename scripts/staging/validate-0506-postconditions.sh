#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"
BLOCKED_PRODUCTION_DB_NAME="airtrust-db"
MIGRATION_BASENAME="0506_controle_voos_flight_justifications.sql"
target=""
for arg in "$@"; do
  case "$arg" in
    --target=*) target="${arg#*=}" ;;
    *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;;
  esac
done
[[ "$target" == "$ALLOWED_DB_NAME" && "$target" != "$BLOCKED_PRODUCTION_DB_NAME" ]] || {
  echo "ERROR: staging 0506 validator refused target: $target" >&2
  exit 1
}
query_count(){
  local sql="$1"
  (cd worker-airtrust && npx wrangler d1 execute "$target" --remote --json --command "$sql") |
    node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"
}
assert_count(){
  local label="$1" expected="$2" sql="$3" count
  count="$(query_count "$sql")"
  [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }
  echo "POSTCONDITION_OK=$label"
}
assert_count migration-ledger 1 "SELECT COUNT(*) count FROM d1_migrations WHERE name='$MIGRATION_BASENAME';"
assert_count justification-tables 2 "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name IN ('cv_justificativas_voo','cv_voo_justificativas');"
assert_count justification-indexes 2 "SELECT COUNT(*) count FROM sqlite_master WHERE type='index' AND name IN ('idx_cv_justificativas_voo_empresa_codigo','idx_cv_voo_justificativas_empresa_voo');"
assert_count tenant-triggers 2 "SELECT COUNT(*) count FROM sqlite_master WHERE type='trigger' AND name IN ('trg_cv_voo_justificativas_tenant_insert_0506','trg_cv_voo_justificativas_tenant_update_0506');"
assert_count invalid-minute-rows 0 "SELECT COUNT(*) count FROM cv_voo_justificativas WHERE minutos <= 0 OR minutos > 1440;"
echo CONTROLE_VOOS_FLIGHT_JUSTIFICATIONS_0506_STAGING_POSTCONDITIONS=PASS
