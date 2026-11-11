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
 node -e "let s='';process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>{const i=s.indexOf('['); const j=JSON.parse(s.slice(i)); const r=j?.[0]?.results?.[0]; const n=Number(r?.n); if(!j?.[0]?.success||!Number.isSafeInteger(n)||n<0||j?.[0]?.meta?.rows_written)process.exit(1);console.log(n)})"
}
assert_count() { local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "PREFLIGHT_FAILED_$label expected=$expected got=$count" >&2;exit 1; }; echo "PASS_$label"; }
assert_count baseline 1 "SELECT COUNT(*) n FROM airtrust_schema_baselines_v2 WHERE baseline_id='production-d1-baseline-v2-20260714' AND status='ACTIVE'"
assert_count not_applied 0 "SELECT COUNT(*) n FROM airtrust_schema_changes_v2 WHERE change_id='compliance-designation-ead-contract-0578'"
assert_count target_rules 9 "SELECT COUNT(*) n FROM treinamento_requisitos tr WHERE tr.empresa_id=6 AND tr.id IN (587,656,657,658,659,660,669,674,705) AND tr.ativo=1 AND tr.deleted_at IS NULL AND tr.obrigatoriedade='OBRIGATORIA' AND COALESCE(tr.auto_matricular_ead,0) IN (0,1) AND tr.modalidade_requerida IS NULL AND EXISTS(SELECT 1 FROM qualificacoes_tipos qt WHERE qt.id=tr.qualificacao_tipo_id AND qt.empresa_id=6 AND qt.ativo=1 AND qt.deleted_at IS NULL AND UPPER(TRIM(qt.categoria)) IN ('EAD','TREINAMENTO EAD')) AND 1=(SELECT COUNT(*) FROM lms_cursos lc WHERE lc.empresa_id=6 AND lc.qualificacao_tipo_id=tr.qualificacao_tipo_id AND lc.ativo=1 AND lc.publicado=1 AND lc.deleted_at IS NULL)"
assert_count fdm_target_course 1 "SELECT COUNT(*) n FROM lms_cursos lc JOIN qualificacoes_tipos qt ON qt.id=lc.qualificacao_tipo_id AND qt.empresa_id=lc.empresa_id WHERE lc.empresa_id=6 AND lc.id=73 AND lc.ativo=1 AND lc.publicado=1 AND lc.deleted_at IS NULL AND qt.codigo='FDM_GATE' AND qt.ativo=1 AND qt.deleted_at IS NULL"
assert_count fdm_conditions 2 "SELECT COUNT(*) n FROM compliance_condicoes WHERE empresa_id=6 AND codigo IN ('FDM_COMITE','GATEKEEPER') AND tipo='DESIGNACAO' AND ativo=1 AND deleted_at IS NULL"
assert_count fdm_ead_rules_absent 0 "SELECT COUNT(*) n FROM treinamento_requisitos tr JOIN compliance_condicoes cc ON cc.id=tr.condicao_id AND cc.empresa_id=tr.empresa_id JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id AND qt.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND qt.codigo='FDM_GATE' AND cc.codigo IN ('FDM_COMITE','GATEKEEPER') AND tr.ativo=1 AND tr.deleted_at IS NULL"
assert_count fdm_operational_rules_preserved 2 "SELECT COUNT(*) n FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id AND qt.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND qt.codigo='FDM-COMITE-GATEKEEPER' AND tr.condicao_id IN (12,32) AND tr.ativo=1 AND tr.deleted_at IS NULL"
assert_count designated_manager 1 "SELECT COUNT(*) n FROM funcionarios_compliance_condicoes a JOIN funcionarios f ON f.id=a.funcionario_id AND f.empresa_id=a.empresa_id WHERE a.empresa_id=6 AND a.funcionario_id=138 AND a.condicao_id=32 AND a.ativo=1 AND a.deleted_at IS NULL AND f.ativo=1 AND f.deleted_at IS NULL"
assert_count missing_current_enrollment 0 "SELECT COUNT(*) n FROM lms_matriculas WHERE empresa_id=6 AND curso_id=73 AND funcionario_id=138 AND deleted_at IS NULL"
echo COMPLIANCE_DESIGNATION_EAD_0578_PREFLIGHT=PASS
