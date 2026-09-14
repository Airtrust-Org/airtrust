#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"; BLOCKED_PRODUCTION_DB_NAME="airtrust-db"; MIGRATION_BASENAME="0494_training_enrollment_reconciliation.sql"
target=""
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" && "$target" != "$BLOCKED_PRODUCTION_DB_NAME" ]] || { echo "ERROR: staging 0494 validator refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; node - "$target" "$sql" <<'NODE'
const {spawnSync}=require('node:child_process'),path=require('node:path');const[,,db,sql]=process.argv;const r=spawnSync('npx',['wrangler','d1','execute',db,'--remote','--json','--command',sql],{cwd:path.join(process.cwd(),'worker-airtrust'),encoding:'utf8',env:process.env});if(r.status!==0){process.stderr.write(r.stderr||r.stdout);process.exit(1)}const s=r.stdout.indexOf('['),e=r.stdout.lastIndexOf(']'),p=JSON.parse(s>=0&&e>s?r.stdout.slice(s,e+1):r.stdout),row=(Array.isArray(p)?p[0]?.results:p?.results)?.[0],n=Number(row?.count??row?.total??row?.['COUNT(*)']??(row?Object.values(row)[0]:NaN));if(!Number.isInteger(n)||n<0)throw new Error('INVALID_COUNT');process.stdout.write(String(n));
NODE
}
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "POSTCONDITION_OK=$label"; }
assert_count migration-ledger 1 "SELECT COUNT(*) count FROM d1_migrations WHERE name='$MIGRATION_BASENAME';"
assert_count reconciliation-table 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='treinamento_matricula_reconciliacoes';"
assert_count named-indexes 2 "SELECT COUNT(*) count FROM sqlite_master WHERE type='index' AND name IN ('idx_treinamento_matricula_reconciliacoes_active','idx_treinamento_matricula_reconciliacoes_empresa');"
assert_count tenant-triggers 2 "SELECT COUNT(*) count FROM sqlite_master WHERE type='trigger' AND name IN ('trg_treinamento_matricula_reconciliacoes_tenant_insert','trg_treinamento_matricula_reconciliacoes_tenant_update');"
assert_count cross-tenant-enrollment 0 "SELECT COUNT(*) count FROM treinamento_matricula_reconciliacoes r LEFT JOIN lms_matriculas m ON m.id=r.matricula_id AND m.empresa_id=r.empresa_id WHERE r.deleted_at IS NULL AND m.id IS NULL;"
echo TRAINING_ENROLLMENT_RECONCILIATION_0494_STAGING_POSTCONDITIONS=PASS
