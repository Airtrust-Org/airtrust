#!/usr/bin/env bash
# Read-only production postconditions for Schema V2 change 0492.
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db"
BASELINE_ID="production-d1-baseline-v2-20260714"
CHANGE_ID="organizational-structure-normalization-0492"
target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: 0492 production postconditions refused target: $target" >&2; exit 1; }
query_count() {
  local sql="$1"
  node - "$target" "$sql" <<'NODE'
const {spawnSync}=require('node:child_process'); const path=require('node:path'); const [,,dbName,sql]=process.argv;
const res=spawnSync('npx',['wrangler','d1','execute',dbName,'--env','production','--remote','--json','--command',sql],{cwd:path.join(process.cwd(),'worker-airtrust'),encoding:'utf8',env:process.env});
if(res.status!==0){process.stderr.write(res.stderr||res.stdout);process.exit(1)} let parsed;try{parsed=JSON.parse(res.stdout)}catch{const s=res.stdout.indexOf('['),e=res.stdout.lastIndexOf(']');if(s<0||e<=s)throw new Error('D1_JSON_NOT_FOUND');parsed=JSON.parse(res.stdout.slice(s,e+1))} const row=(Array.isArray(parsed)?parsed[0]?.results:parsed?.results)?.[0]; const value=row?.count??row?.total??row?.['COUNT(*)']??(row?Object.values(row)[0]:NaN); const count=Number(value);if(!Number.isInteger(count)||count<0)throw new Error(`INVALID_COUNT:${JSON.stringify(parsed)}`);process.stdout.write(String(count));
NODE
}
assert_count(){ local label="$1" expected="$2" sql="$3"; local count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "POSTCONDITION_OK=$label"; }
assert_count "active-baseline" 1 "SELECT COUNT(*) AS count FROM airtrust_schema_baselines_v2 WHERE baseline_id='$BASELINE_ID' AND status='ACTIVE';"
assert_count "schema-v2-change" 1 "SELECT COUNT(*) AS count FROM airtrust_schema_changes_v2 WHERE change_id='$CHANGE_ID';"
assert_count "funcao-id-column" 1 "SELECT COUNT(*) AS count FROM pragma_table_info('funcionarios') WHERE name='funcao_id';"
assert_count "canonical-org-tables" 3 "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('setores_funcoes','setores_aliases','funcoes_aliases');"
assert_count "canonical-org-triggers" 8 "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='trigger' AND name IN ('trg_funcionarios_funcao_tenant_insert','trg_funcionarios_funcao_tenant_update','trg_setores_funcoes_tenant_insert','trg_setores_funcoes_tenant_update','trg_setores_aliases_tenant_insert','trg_setores_aliases_tenant_update','trg_funcoes_aliases_tenant_insert','trg_funcoes_aliases_tenant_update');"
assert_count "merged-source-sectors-active" 0 "SELECT COUNT(*) AS count FROM setores WHERE empresa_id=6 AND deleted_at IS NULL AND COALESCE(ativo,1)=1 AND ((UPPER(TRIM(codigo))='CTM' OR UPPER(TRIM(nome))='CTM') OR (UPPER(TRIM(codigo))='QUA' OR UPPER(TRIM(nome))=UPPER('Qualidade')));"
for table in funcionarios qualificacoes_tipos_setores lms_cursos_setores setores_gestores treinamento_requisitos; do assert_count "live-source-sector-$table" 0 "SELECT COUNT(*) AS count FROM $table WHERE empresa_id=6 AND deleted_at IS NULL AND setor_id IN (SELECT id FROM setores WHERE empresa_id=6 AND ((UPPER(TRIM(codigo))='CTM' OR UPPER(TRIM(nome))='CTM') OR (UPPER(TRIM(codigo))='QUA' OR UPPER(TRIM(nome))=UPPER('Qualidade'))));"; done
assert_count "legacy-first-officer" 0 "SELECT COUNT(*) AS count FROM funcionarios WHERE empresa_id=6 AND deleted_at IS NULL AND setor_id IN (SELECT id FROM setores WHERE empresa_id=6 AND (UPPER(TRIM(codigo))='TRI' OR UPPER(TRIM(nome))=UPPER('Tripulação'))) AND (UPPER(REPLACE(REPLACE(TRIM(COALESCE(cargo,'')),'º',''),'°','')) IN ('1 OFICIAL','1O OFICIAL','PRIMEIRO OFICIAL') OR UPPER(REPLACE(REPLACE(TRIM(COALESCE(funcao,'')),'º',''),'°','')) IN ('1 OFICIAL','1O OFICIAL','PRIMEIRO OFICIAL'));"
assert_count "tripulacao-noncanonical-role" 0 "SELECT COUNT(*) AS count FROM funcionarios WHERE empresa_id=6 AND deleted_at IS NULL AND setor_id IN (SELECT id FROM setores WHERE empresa_id=6 AND (UPPER(TRIM(codigo))='TRI' OR UPPER(TRIM(nome))=UPPER('Tripulação'))) AND UPPER(TRIM(COALESCE(funcao,''))) NOT IN ('COMANDANTE','COPILOTO');"
assert_count "aux-suprimentos-in-maintenance" 0 "SELECT COUNT(*) AS count FROM funcionarios WHERE empresa_id=6 AND deleted_at IS NULL AND setor_id IN (SELECT id FROM setores WHERE empresa_id=6 AND (UPPER(TRIM(codigo))='MAN' OR UPPER(TRIM(nome))=UPPER('Manutenção'))) AND (UPPER(TRIM(COALESCE(cargo,'')))=UPPER('Auxiliar de Suprimentos') OR UPPER(TRIM(COALESCE(funcao,''))) LIKE UPPER('Auxiliar de Suprimentos%'));"
assert_count "legacy-coord-engenharia" 0 "SELECT COUNT(*) AS count FROM funcionarios WHERE empresa_id=6 AND deleted_at IS NULL AND UPPER(TRIM(COALESCE(funcao,'')))=UPPER('Coord de Engenharia');"
assert_count "active-qa-fixtures" 0 "SELECT COUNT(*) AS count FROM funcionarios WHERE empresa_id=6 AND deleted_at IS NULL AND UPPER(TRIM(COALESCE(cargo,'')))=UPPER('QA Fictício');"
assert_count "cross-tenant-function" 0 "SELECT COUNT(*) AS count FROM funcionarios e LEFT JOIN funcoes f ON f.id=e.funcao_id AND f.empresa_id=e.empresa_id WHERE e.deleted_at IS NULL AND e.funcao_id IS NOT NULL AND f.id IS NULL;"
assert_count "invalid-sector-function-pair" 0 "SELECT COUNT(*) AS count FROM funcionarios e WHERE e.empresa_id=6 AND e.deleted_at IS NULL AND e.setor_id IS NOT NULL AND e.funcao_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM setores_funcoes sf WHERE sf.empresa_id=e.empresa_id AND sf.setor_id=e.setor_id AND sf.funcao_id=e.funcao_id AND sf.deleted_at IS NULL AND sf.ativo=1);"
echo "ORGANIZATIONAL_STRUCTURE_0492_PRODUCTION_POSTCONDITIONS=PASS"
