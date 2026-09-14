#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"; BLOCKED_PRODUCTION_DB_NAME="airtrust-db"; MIGRATION_BASENAME="0492_organizational_structure_normalization.sql"; target=""
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" && "$target" != "$BLOCKED_PRODUCTION_DB_NAME" ]] || { echo "ERROR: staging 0492 validator refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; node - "$target" "$sql" <<'NODE'
const {spawnSync}=require('node:child_process'),path=require('node:path');const[,,db,sql]=process.argv;const r=spawnSync('npx',['wrangler','d1','execute',db,'--remote','--json','--command',sql],{cwd:path.join(process.cwd(),'worker-airtrust'),encoding:'utf8',env:process.env});if(r.status!==0){process.stderr.write(r.stderr||r.stdout);process.exit(1)}const s=r.stdout.indexOf('['),e=r.stdout.lastIndexOf(']'),p=JSON.parse(s>=0&&e>s?r.stdout.slice(s,e+1):r.stdout),row=(Array.isArray(p)?p[0]?.results:p?.results)?.[0],n=Number(row?.count??row?.total??row?.['COUNT(*)']??(row?Object.values(row)[0]:NaN));if(!Number.isInteger(n)||n<0)throw new Error('INVALID_COUNT');process.stdout.write(String(n));
NODE
}
assert_count(){ local label="$1" expected="$2" sql="$3"; local count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "POSTCONDITION_OK=$label"; }
assert_count "migration-ledger" 1 "SELECT COUNT(*) AS count FROM d1_migrations WHERE name='$MIGRATION_BASENAME';"
assert_count "funcao-id-column" 1 "SELECT COUNT(*) AS count FROM pragma_table_info('funcionarios') WHERE name='funcao_id';"
assert_count "canonical-org-tables" 3 "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('setores_funcoes','setores_aliases','funcoes_aliases');"
for table in funcionarios qualificacoes_tipos_setores lms_cursos_setores setores_gestores treinamento_requisitos; do assert_count "live-source-sector-$table" 0 "SELECT COUNT(*) AS count FROM $table WHERE empresa_id=6 AND deleted_at IS NULL AND setor_id IN (15,21);"; done
assert_count "legacy-first-officer" 0 "SELECT COUNT(*) AS count FROM funcionarios WHERE empresa_id=6 AND deleted_at IS NULL AND setor_id=10 AND (UPPER(REPLACE(REPLACE(TRIM(COALESCE(cargo,'')),'º',''),'°','')) IN ('1 OFICIAL','1O OFICIAL','PRIMEIRO OFICIAL') OR UPPER(REPLACE(REPLACE(TRIM(COALESCE(funcao,'')),'º',''),'°','')) IN ('1 OFICIAL','1O OFICIAL','PRIMEIRO OFICIAL'));"
assert_count "tripulacao-noncanonical-role" 0 "SELECT COUNT(*) AS count FROM funcionarios WHERE empresa_id=6 AND deleted_at IS NULL AND setor_id=10 AND UPPER(TRIM(COALESCE(funcao,''))) NOT IN ('COMANDANTE','COPILOTO');"
assert_count "aux-suprimentos-in-maintenance" 0 "SELECT COUNT(*) AS count FROM funcionarios WHERE empresa_id=6 AND deleted_at IS NULL AND setor_id=11 AND (UPPER(TRIM(COALESCE(cargo,'')))=UPPER('Auxiliar de Suprimentos') OR UPPER(TRIM(COALESCE(funcao,''))) LIKE UPPER('Auxiliar de Suprimentos%'));"
assert_count "legacy-coord-engenharia" 0 "SELECT COUNT(*) AS count FROM funcionarios WHERE empresa_id=6 AND deleted_at IS NULL AND UPPER(TRIM(COALESCE(funcao,'')))=UPPER('Coord de Engenharia');"
assert_count "active-qa-fixtures" 0 "SELECT COUNT(*) AS count FROM funcionarios WHERE empresa_id=6 AND deleted_at IS NULL AND UPPER(TRIM(COALESCE(cargo,'')))=UPPER('QA Fictício');"
assert_count "cross-tenant-function" 0 "SELECT COUNT(*) AS count FROM funcionarios e LEFT JOIN funcoes f ON f.id=e.funcao_id AND f.empresa_id=e.empresa_id WHERE e.deleted_at IS NULL AND e.funcao_id IS NOT NULL AND f.id IS NULL;"
assert_count "invalid-sector-function-pair" 0 "SELECT COUNT(*) AS count FROM funcionarios e WHERE e.empresa_id=6 AND e.deleted_at IS NULL AND e.setor_id IS NOT NULL AND e.funcao_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM setores_funcoes sf WHERE sf.empresa_id=e.empresa_id AND sf.setor_id=e.setor_id AND sf.funcao_id=e.funcao_id AND sf.deleted_at IS NULL AND sf.ativo=1);"
echo "ORGANIZATIONAL_STRUCTURE_0492_STAGING_POSTCONDITIONS=PASS"
