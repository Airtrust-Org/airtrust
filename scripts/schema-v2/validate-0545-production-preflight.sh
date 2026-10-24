#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$ROOT"
target=airtrust-db
for arg in "$@"; do case "$arg" in --target=*) target="$(printf '%s' "$arg" | cut -d= -f2-)" ;; *) echo UNSUPPORTED_ARG >&2; exit 1 ;; esac; done
[[ "$target" == airtrust-db ]] || { echo WRONG_D1_TARGET >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") | node -e "let s='';process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>{let a=JSON.parse(s);let n=Number(a[0]?.results?.[0]?.count);if(!Number.isSafeInteger(n)||n<0)process.exit(1);console.log(n)})"; }
assert_count(){ local name="$1" expected="$2" sql="$3" n; n="$(query_count "$sql")"; [[ "$n" == "$expected" ]] || { echo "0545_CHECK_FAILED:$name expected=$expected actual=$n" >&2; exit 1; }; echo "PASS:$name"; }
assert_count baseline 1 "SELECT COUNT(*) count FROM airtrust_schema_baselines_v2 WHERE baseline_id='production-d1-baseline-v2-20260714' AND status='ACTIVE'"
assert_count prior-0534-0538 2 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id IN ('training-compliance-final-matrix-0534','training-compliance-manager-designation-nr05-0538')"
assert_count unapplied 0 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='training-compliance-canonical-pdf-alignment-0545'"
assert_count models 28 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo IN ('AUD_COMP','BRIGADA_INCENDIO','COD_ETICA','INTRO_SGQ','COL_SEL','MUDA','INTEGRA','NR-05','NR06','NR-11','NR-12','NR-20','NR-26','NR-35','PRIMEIROS_SOCORROS','REGRAS_OURO_PETROBRAS','CRM_CORP','CRM_DIR_RBAC119','JUST_CULTURE','FOD','LOSA','PPSP_SUP','PPSP','PRE','D2','STOP_WORK','FDM-MECANICO','BOWTIEXP') AND ativo=1 AND deleted_at IS NULL"
assert_count cipa-condition 1 "SELECT COUNT(*) count FROM compliance_condicoes WHERE empresa_id=6 AND codigo='MEMBRO_CIPA' AND ativo=1 AND deleted_at IS NULL"
assert_count nr05-universal 1 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id AND qt.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND qt.codigo='NR-05' AND tr.escopo='EMPRESA' AND tr.condicao_id IS NULL AND tr.ativo=1 AND tr.deleted_at IS NULL"
assert_count regras-ouro-universal 1 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id AND qt.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND qt.codigo='REGRAS_OURO_PETROBRAS' AND tr.ativo=1 AND tr.deleted_at IS NULL"
echo "TRAINING_COMPLIANCE_0545_PREFLIGHT=PASS"
