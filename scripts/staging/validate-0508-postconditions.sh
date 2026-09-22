#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"
target=""
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: staging 0508 validator refused target: $target" >&2; exit 1; }
query_count(){
 local sql="$1"
 (cd worker-airtrust && npx wrangler d1 execute "$target" --remote --json --command "$sql") |
   node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"
}
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "POSTCONDITION_OK=$label"; }
assert_count migration-ledger 1 "SELECT COUNT(*) count FROM d1_migrations WHERE name='0508_training_compliance_daily_snapshots.sql';"
assert_count snapshots-table 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='training_compliance_daily_snapshots';"
assert_count tenant-column 1 "SELECT COUNT(*) count FROM pragma_table_info('training_compliance_daily_snapshots') WHERE name='empresa_id' AND notnull=1;"
assert_count sector-column 1 "SELECT COUNT(*) count FROM pragma_table_info('training_compliance_daily_snapshots') WHERE name='setor_id' AND notnull=1;"
assert_count role-column 1 "SELECT COUNT(*) count FROM pragma_table_info('training_compliance_daily_snapshots') WHERE name='funcao_id' AND notnull=1;"
assert_count snapshot-date-column 1 "SELECT COUNT(*) count FROM pragma_table_info('training_compliance_daily_snapshots') WHERE name='snapshot_date' AND notnull=1;"
assert_count company-date-index 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='index' AND name='idx_training_compliance_snapshots_empresa_date';"
assert_count scope-date-index 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='index' AND name='idx_training_compliance_snapshots_empresa_setor_date';"
assert_count pii-columns 0 "SELECT COUNT(*) count FROM pragma_table_info('training_compliance_daily_snapshots') WHERE lower(name) IN ('nome','cpf','email','telefone','matricula');"
echo TRAINING_COMPLIANCE_DAILY_SNAPSHOTS_0508_STAGING_POSTCONDITIONS=PASS
