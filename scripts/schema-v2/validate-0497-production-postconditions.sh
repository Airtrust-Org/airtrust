#!/usr/bin/env bash
# Read-only production postconditions for Schema V2 change 0497.
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db"; BASELINE_ID="production-d1-baseline-v2-20260714"; CHANGE_ID="training-compliance-aircraft-scope-0497"
target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: 0497 production postconditions refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; node - "$target" "$sql" <<'NODE'
const {spawnSync}=require('node:child_process'),path=require('node:path');const[,,db,sql]=process.argv;const r=spawnSync('npx',['wrangler','d1','execute',db,'--env','production','--remote','--json','--command',sql],{cwd:path.join(process.cwd(),'worker-airtrust'),encoding:'utf8',env:process.env});if(r.status!==0){process.stderr.write(r.stderr||r.stdout);process.exit(1)}let p;try{p=JSON.parse(r.stdout)}catch{const s=r.stdout.indexOf('['),e=r.stdout.lastIndexOf(']');if(s<0||e<=s)throw new Error('D1_JSON_NOT_FOUND');p=JSON.parse(r.stdout.slice(s,e+1))}const row=(Array.isArray(p)?p[0]?.results:p?.results)?.[0],n=Number(row?.count??row?.total??row?.['COUNT(*)']??(row?Object.values(row)[0]:NaN));if(!Number.isInteger(n)||n<0)throw new Error('INVALID_COUNT');process.stdout.write(String(n));
NODE
}
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "POSTCONDITION_OK=$label"; }
assert_count active-baseline 1 "SELECT COUNT(*) count FROM airtrust_schema_baselines_v2 WHERE baseline_id='$BASELINE_ID' AND status='ACTIVE';"
assert_count schema-v2-change 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='$CHANGE_ID';"
assert_count aircraft-model-column 1 "SELECT COUNT(*) count FROM pragma_table_info('treinamento_requisitos') WHERE name='aeronave_modelo' AND UPPER(type)='TEXT';"
assert_count unique-active-index 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='index' AND name='idx_treinamento_requisitos_unique_active' AND sql LIKE '%UPPER(TRIM(aeronave_modelo))%';"
assert_count aircraft-lookup-index 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='index' AND name='idx_treinamento_requisitos_empresa_aeronave' AND sql LIKE '%empresa_id, aeronave_modelo%';"
echo TRAINING_COMPLIANCE_AIRCRAFT_SCOPE_0497_PRODUCTION_POSTCONDITIONS=PASS
