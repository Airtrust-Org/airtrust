#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$ROOT"
target=airtrust-db-staging-baseline-20260701
for arg in "$@"; do case "$arg" in --target=*) target="$(printf '%s' "$arg" | cut -d= -f2-)" ;; *) echo UNSUPPORTED_ARG >&2; exit 1 ;; esac; done
[[ "$target" == airtrust-db-staging-baseline-20260701 ]] || { echo WRONG_D1_TARGET >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env staging --remote --json --command "$sql") | node -e "let s='';process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>{let a=JSON.parse(s);let n=Number(a[0]?.results?.[0]?.count);if(!Number.isSafeInteger(n)||n<0)process.exit(1);console.log(n)})"; }
assert_count(){ local name="$1" expected="$2" sql="$3" n; n="$(query_count "$sql")"; [[ "$n" == "$expected" ]] || { echo "0546_CHECK_FAILED:$name expected=$expected actual=$n" >&2; exit 1; }; echo "PASS:$name"; }
assert_count ledger 1 "SELECT COUNT(*) count FROM d1_migrations WHERE name='0546_training_compliance_canonical_category_repair.sql'"
assert_count generic-category-valid 1 "SELECT COUNT(*) count FROM qualificacoes_categorias WHERE empresa_id=6 AND codigo='TREINAMENTO_GERAL' AND nome='Treinamento' AND ativo=1 AND deleted_at IS NULL"
assert_count legacy-0545-unapplied 0 "SELECT COUNT(*) count FROM d1_migrations WHERE name='0545_training_compliance_canonical_pdf_alignment.sql'"
assert_count nr05-metadata 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='NR-05' AND categoria='Treinamento' AND categoria_id IS NOT NULL AND categoria_id=(  SELECT id FROM qualificacoes_categorias WHERE empresa_id=6  AND codigo='TREINAMENTO_GERAL' AND nome='Treinamento'  AND ativo=1 AND deleted_at IS NULL LIMIT 1) AND validade IS NULL AND carga_horaria IS NULL AND carga_horaria_inicial IS NULL AND carga_horaria_recorrente IS NULL AND ativo=1 AND deleted_at IS NULL"
assert_count nr05-designated 1 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id AND qt.empresa_id=tr.empresa_id JOIN compliance_condicoes cc ON cc.id=tr.condicao_id AND cc.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND qt.codigo='NR-05' AND cc.codigo='MEMBRO_CIPA' AND tr.escopo='EMPRESA' AND tr.obrigatoriedade='OBRIGATORIA' AND tr.ativo=1 AND tr.deleted_at IS NULL"
assert_count nr05-universal 0 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id AND qt.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND qt.codigo='NR-05' AND tr.escopo='EMPRESA' AND tr.condicao_id IS NULL AND tr.ativo=1 AND tr.deleted_at IS NULL"
assert_count regras-ouro-active 0 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id AND qt.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND qt.codigo='REGRAS_OURO_PETROBRAS' AND tr.ativo=1 AND tr.deleted_at IS NULL"
assert_count fdm-hour 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='FDM-MECANICO' AND validade IS NULL AND carga_horaria=1 AND carga_horaria_inicial=1 AND carga_horaria_recorrente=1 AND ativo=1 AND deleted_at IS NULL"
assert_count staging-fdm-role-gap-documented 0 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id AND qt.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND qt.codigo='FDM-MECANICO' AND tr.escopo='FUNCAO' AND tr.ativo=1 AND tr.deleted_at IS NULL"
# Staging lacks the two maintenance qualification links; production postcondition still requires two.
node scripts/staging/verify-0546-staging-applicability.mjs --target=airtrust-db-staging-baseline-20260701
assert_count nr35-presencial 2 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id AND qt.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND qt.codigo='NR-35' AND tr.escopo='FUNCAO' AND tr.modalidade_requerida='PRESENCIAL' AND tr.ativo=1 AND tr.deleted_at IS NULL"
echo "TRAINING_COMPLIANCE_0546_POSTCONDITIONS=PASS"
