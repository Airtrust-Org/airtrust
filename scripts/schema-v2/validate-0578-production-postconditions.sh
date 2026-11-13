#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
target=airtrust-db
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}";; *) echo UNKNOWN_ARGUMENT >&2;exit 1;; esac; done
[[ "$target" == airtrust-db ]] || { echo PROD_DB_GUARD >&2;exit 1; }
query_count() {
 local q="$1"
 (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$q") |
 node -e "let s='';process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>{const i=s.indexOf('[');const j=JSON.parse(s.slice(i));const n=Number(j?.[0]?.results?.[0]?.n);if(!j?.[0]?.success||!Number.isSafeInteger(n)||n<0||j?.[0]?.meta?.rows_written)process.exit(1);console.log(n)})"
}
assert_count() { local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "POSTCONDITION_FAILED_$label expected=$expected got=$count" >&2;exit 1; }; echo "PASS_$label"; }
assert_count ledger 1 "SELECT COUNT(*) n FROM airtrust_schema_changes_v2 WHERE change_id='compliance-designation-ead-contract-0578' AND baseline_id='production-d1-baseline-v2-20260714'"
assert_count opt_in_rules 9 "SELECT COUNT(*) n FROM treinamento_requisitos WHERE empresa_id=6 AND id IN (587,656,657,658,659,660,669,674,705) AND ativo=1 AND deleted_at IS NULL AND obrigatoriedade='OBRIGATORIA' AND auto_matricular_ead=1 AND modalidade_requerida='EAD'"
assert_count fdm_ead_conditions 2 "SELECT COUNT(*) n FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id AND qt.empresa_id=tr.empresa_id JOIN compliance_condicoes cc ON cc.id=tr.condicao_id AND cc.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND qt.codigo='FDM_GATE' AND tr.escopo='EMPRESA' AND cc.codigo IN ('FDM_COMITE','GATEKEEPER') AND tr.obrigatoriedade='OBRIGATORIA' AND tr.modalidade_requerida='EAD' AND tr.auto_matricular_ead=1 AND tr.ativo=1 AND tr.deleted_at IS NULL"
assert_count preserve_distinct_formal_model 2 "SELECT COUNT(*) n FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id AND qt.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND qt.codigo='FDM-COMITE-GATEKEEPER' AND tr.condicao_id IN (12,32) AND tr.ativo=1 AND tr.deleted_at IS NULL"
assert_count keep_course_73 1 "SELECT COUNT(*) n FROM lms_cursos WHERE empresa_id=6 AND id=73 AND qualificacao_tipo_id=201 AND ativo=1 AND publicado=1 AND deleted_at IS NULL"
assert_count no_matriculas_by_schema 0 "SELECT COUNT(*) n FROM lms_matriculas WHERE empresa_id=6 AND curso_id=73 AND funcionario_id=138 AND deleted_at IS NULL"
echo COMPLIANCE_DESIGNATION_EAD_0578_POST=PASS
