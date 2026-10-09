#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$ROOT"
target=airtrust-db-staging-baseline-20260701
for arg in "$@"; do case "$arg" in --target=*) target="$(printf '%s' "$arg" | cut -d= -f2-)" ;; *) echo UNSUPPORTED_ARG >&2; exit 1 ;; esac; done
[[ "$target" == airtrust-db-staging-baseline-20260701 ]] || { echo WRONG_D1_TARGET >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env staging --remote --json --command "$sql") | node -e "let s='';process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>{let a=JSON.parse(s);let n=Number(a[0]?.results?.[0]?.count);if(!Number.isSafeInteger(n)||n<0)process.exit(1);console.log(n)})"; }
assert_count(){ local name="$1" expected="$2" sql="$3" n; n="$(query_count "$sql")"; [[ "$n" == "$expected" ]] || { echo "0546_CHECK_FAILED:$name expected=$expected actual=$n" >&2; exit 1; }; echo "PASS:$name"; }
assert_count prior-0534-0538 2 "SELECT COUNT(*) count FROM d1_migrations WHERE name IN ('0534_training_compliance_final_matrix.sql','0538_training_compliance_manager_designation_nr05.sql')"
assert_count legacy-0545-unapplied 0 "SELECT COUNT(*) count FROM d1_migrations WHERE name='0545_training_compliance_canonical_pdf_alignment.sql'"
assert_count unapplied 0 "SELECT COUNT(*) count FROM d1_migrations WHERE name='0546_training_compliance_canonical_pdf_alignment.sql'"
# The staging fixture has 24/28 canonical training models (four historical entries absent).
# Production retains the immutable full-28 mandatory preflight check.
assert_count staging-24-models 24 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo IN ('BRIGADA_INCENDIO','COD_ETICA','INTEGRA','NR-05','NR06','NR-11','NR-12','NR-20','NR-26','NR-35','PRIMEIROS_SOCORROS','REGRAS_OURO_PETROBRAS','CRM_CORP','CRM_DIR_RBAC119','JUST_CULTURE','FOD','LOSA','PPSP_SUP','PPSP','PRE','D2','STOP_WORK','FDM-MECANICO','BOWTIEXP') AND ativo=1 AND deleted_at IS NULL"
assert_count staging-four-historical-absent 0 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo IN ('AUD_COMP','INTRO_SGQ','COL_SEL','MUDA') AND ativo=1 AND deleted_at IS NULL"
assert_count generic-category-absent 0 "SELECT COUNT(*) count FROM qualificacoes_categorias WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL AND (codigo='TREINAMENTO_GERAL' OR nome='Treinamento')"
assert_count cipa-condition 1 "SELECT COUNT(*) count FROM compliance_condicoes WHERE empresa_id=6 AND codigo='MEMBRO_CIPA' AND ativo=1 AND deleted_at IS NULL"
assert_count nr05-universal 1 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id AND qt.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND qt.codigo='NR-05' AND tr.escopo='EMPRESA' AND tr.condicao_id IS NULL AND tr.ativo=1 AND tr.deleted_at IS NULL"
assert_count regras-ouro-universal 1 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id AND qt.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND qt.codigo='REGRAS_OURO_PETROBRAS' AND tr.ativo=1 AND tr.deleted_at IS NULL"
echo "TRAINING_COMPLIANCE_0546_PREFLIGHT=PASS"
