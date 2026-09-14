#!/usr/bin/env bash
# Read-only production postconditions for Schema V2 change 0491.
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db"
BASELINE_ID="production-d1-baseline-v2-20260714"
CHANGE_ID="training-compliance-requirements-0491"
target="$ALLOWED_DB_NAME"
for arg in "$@"; do
  case "$arg" in
    --target=*) target="${arg#*=}" ;;
    *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;;
  esac
done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: 0491 production postconditions refused target: $target" >&2; exit 1; }
query_count() {
  local sql="$1"
  node - "$target" "$sql" <<'NODE'
const { spawnSync } = require('node:child_process'); const path=require('node:path'); const [,,dbName,sql]=process.argv;
const res=spawnSync('npx',['wrangler','d1','execute',dbName,'--env','production','--remote','--json','--command',sql],{cwd:path.join(process.cwd(),'worker-airtrust'),encoding:'utf8',env:process.env});
if(res.status!==0){process.stderr.write(res.stderr||res.stdout);process.exit(1)} let parsed;try{parsed=JSON.parse(res.stdout)}catch{const s=res.stdout.indexOf('['),e=res.stdout.lastIndexOf(']');if(s<0||e<=s)throw new Error('D1_JSON_NOT_FOUND');parsed=JSON.parse(res.stdout.slice(s,e+1))} const row=(Array.isArray(parsed)?parsed[0]?.results:parsed?.results)?.[0]; const value=row?.count??row?.total??row?.['COUNT(*)']??(row?Object.values(row)[0]:NaN); const count=Number(value);if(!Number.isInteger(count)||count<0)throw new Error(`INVALID_COUNT:${JSON.stringify(parsed)}`);process.stdout.write(String(count));
NODE
}
assert_count(){ local label="$1" expected="$2" sql="$3"; local count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "POSTCONDITION_OK=$label"; }
assert_count "active-baseline" 1 "SELECT COUNT(*) AS count FROM airtrust_schema_baselines_v2 WHERE baseline_id='$BASELINE_ID' AND status='ACTIVE';"
assert_count "schema-v2-change" 1 "SELECT COUNT(*) AS count FROM airtrust_schema_changes_v2 WHERE change_id='$CHANGE_ID';"
assert_count "requirement-table" 1 "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='treinamento_requisitos';"
assert_count "named-indexes" 4 "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='index' AND name IN ('idx_treinamento_requisitos_unique_active','idx_treinamento_requisitos_empresa_escopo','idx_treinamento_requisitos_empresa_tipo','idx_treinamento_requisitos_vigencia');"
assert_count "tenant-triggers" 2 "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='trigger' AND name IN ('trg_treinamento_requisitos_tenant_insert','trg_treinamento_requisitos_tenant_update');"
assert_count "legacy-backfill-missing" 0 "SELECT COUNT(*) AS count FROM matriz_treinamento_funcao m WHERE m.deleted_at IS NULL AND m.ativo=1 AND NOT EXISTS (SELECT 1 FROM treinamento_requisitos r WHERE r.empresa_id=m.empresa_id AND r.qualificacao_tipo_id=m.qualificacao_tipo_id AND r.escopo='FUNCAO' AND r.funcao_id=m.funcao_id AND r.ativo=1 AND r.deleted_at IS NULL);"
assert_count "cross-tenant-qualification" 0 "SELECT COUNT(*) AS count FROM treinamento_requisitos r LEFT JOIN qualificacoes_tipos qt ON qt.id=r.qualificacao_tipo_id AND qt.empresa_id=r.empresa_id WHERE r.deleted_at IS NULL AND qt.id IS NULL;"
assert_count "cross-tenant-sector" 0 "SELECT COUNT(*) AS count FROM treinamento_requisitos r LEFT JOIN setores s ON s.id=r.setor_id AND s.empresa_id=r.empresa_id WHERE r.deleted_at IS NULL AND r.setor_id IS NOT NULL AND s.id IS NULL;"
assert_count "cross-tenant-function" 0 "SELECT COUNT(*) AS count FROM treinamento_requisitos r LEFT JOIN funcoes f ON f.id=r.funcao_id AND f.empresa_id=r.empresa_id WHERE r.deleted_at IS NULL AND r.funcao_id IS NOT NULL AND f.id IS NULL;"
assert_count "cross-tenant-employee" 0 "SELECT COUNT(*) AS count FROM treinamento_requisitos r LEFT JOIN funcionarios f ON f.id=r.funcionario_id AND f.empresa_id=r.empresa_id WHERE r.deleted_at IS NULL AND r.funcionario_id IS NOT NULL AND f.id IS NULL;"
echo "TRAINING_COMPLIANCE_0491_PRODUCTION_POSTCONDITIONS=PASS"
