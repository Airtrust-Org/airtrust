#!/usr/bin/env bash
# Read-only staging postconditions for training compliance requirements 0491.
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"
BLOCKED_PRODUCTION_DB_NAME="airtrust-db"
MIGRATION_BASENAME="0491_training_compliance_requirements.sql"
target=""
for arg in "$@"; do
  case "$arg" in
    --target=*) target="${arg#*=}" ;;
    *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;;
  esac
done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: staging 0491 validator refused target: $target" >&2; exit 1; }
[[ "$target" != "$BLOCKED_PRODUCTION_DB_NAME" ]] || { echo "ERROR: production target refused" >&2; exit 1; }
query_count() {
  local sql="$1"
  node - "$target" "$sql" <<'NODE'
const { spawnSync } = require('node:child_process'); const path=require('node:path'); const [,,dbName,sql]=process.argv;
const res=spawnSync('npx',['wrangler','d1','execute',dbName,'--remote','--json','--command',sql],{cwd:path.join(process.cwd(),'worker-airtrust'),encoding:'utf8',env:process.env});
if(res.status!==0){process.stderr.write(res.stderr||res.stdout);process.exit(1)} const s=res.stdout.indexOf('['),e=res.stdout.lastIndexOf(']'); const parsed=JSON.parse(s>=0&&e>s?res.stdout.slice(s,e+1):res.stdout); const row=(Array.isArray(parsed)?parsed[0]?.results:parsed?.results)?.[0]; const count=Number(row?.count??row?.total??row?.['COUNT(*)']??(row?Object.values(row)[0]:NaN)); if(!Number.isInteger(count)||count<0)throw new Error('INVALID_COUNT'); process.stdout.write(String(count));
NODE
}
assert_count(){ local label="$1" expected="$2" sql="$3"; local count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "POSTCONDITION_OK=$label"; }
assert_count "migration-ledger" 1 "SELECT COUNT(*) AS count FROM d1_migrations WHERE name='$MIGRATION_BASENAME';"
assert_count "requirement-table" 1 "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='treinamento_requisitos';"
assert_count "named-indexes" 4 "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='index' AND name IN ('idx_treinamento_requisitos_unique_active','idx_treinamento_requisitos_empresa_escopo','idx_treinamento_requisitos_empresa_tipo','idx_treinamento_requisitos_vigencia');"
assert_count "tenant-triggers" 2 "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='trigger' AND name IN ('trg_treinamento_requisitos_tenant_insert','trg_treinamento_requisitos_tenant_update');"
assert_count "legacy-backfill-missing" 0 "SELECT COUNT(*) AS count FROM matriz_treinamento_funcao m WHERE m.deleted_at IS NULL AND m.ativo=1 AND NOT EXISTS (SELECT 1 FROM treinamento_requisitos r WHERE r.empresa_id=m.empresa_id AND r.qualificacao_tipo_id=m.qualificacao_tipo_id AND r.escopo='FUNCAO' AND r.funcao_id=m.funcao_id AND r.ativo=1 AND r.deleted_at IS NULL);"
echo "TRAINING_COMPLIANCE_0491_STAGING_POSTCONDITIONS=PASS"
