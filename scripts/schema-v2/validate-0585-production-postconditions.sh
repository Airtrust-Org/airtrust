#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
target=airtrust-db
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo UNKNOWN_ARGUMENT >&2; exit 1 ;; esac; done
[[ "$target" == airtrust-db ]] || { echo DGR_0585_DB_MISMATCH >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") | node -e "let s='';process.stdin.on('data',b=>s+=b);process.stdin.on('end',()=>{const a=s.indexOf('['),z=s.lastIndexOf(']'),d=JSON.parse(a>=0?s.slice(a,z+1):s),n=Number(d[0]?.results?.[0]?.count);if(!Number.isSafeInteger(n)||n<0)process.exit(1);console.log(n);})"; }
assert_count(){ local name="$1" expected="$2" sql="$3" n; n="$(query_count "$sql")"; [[ "$n" == "$expected" ]] || { echo "DGR_0585_CHECK_FAILED: $name expected=$expected got=$n" >&2; exit 1; }; echo "CHECK_OK=$name"; }
assert_count ledger-0585 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='dgr-legacy-maintenance-consolidation-0585'"
assert_count D4-label 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE id=25 AND empresa_id=6 AND codigo='D4' AND nome='Treinamento de Artigos Perigosos para o Transporte Aéreo' AND ativo=1 AND deleted_at IS NULL"
assert_count MNT-retired 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE id=137 AND empresa_id=6 AND codigo='MNT_ARTIGOS_PERIGOSOS' AND ativo=0 AND deleted_at IS NOT NULL"
assert_count D4-41-histories 41 "SELECT COUNT(*) count FROM qualificacoes_historico WHERE empresa_id=6 AND qualificacao_id=25 AND deleted_at IS NULL"
assert_count D4-legacy-two-preserved 2 "SELECT COUNT(*) count FROM qualificacoes_historico WHERE id IN (4781,4782) AND empresa_id=6 AND qualificacao_id=25 AND qualificacao_codigo='MNT_ARTIGOS_PERIGOSOS' AND tipo='Treinamento de Artigos Perigosos para o Transporte Aéreo' AND perfil_competencia='PTAP_MNT_LEGACY_NAO_HOMOLOGADO' AND status='VENCIDA' AND data_conclusao='2022-06-12' AND data_vencimento='2024-06-12' AND numero_certificado IS NOT NULL AND observacoes LIKE '%PTM 20.12%' AND deleted_at IS NULL"
assert_count D4-original-39 39 "SELECT COUNT(*) count FROM qualificacoes_historico WHERE empresa_id=6 AND qualificacao_id=25 AND qualificacao_codigo='D4' AND deleted_at IS NULL"
assert_count MNT-no-live-history 0 "SELECT COUNT(*) count FROM qualificacoes_historico WHERE empresa_id=6 AND qualificacao_id=137 AND deleted_at IS NULL"
assert_count previously-deleted-preserved 1 "SELECT COUNT(*) count FROM qualificacoes_historico WHERE id=4649 AND empresa_id=6 AND qualificacao_id=137 AND deleted_at IS NOT NULL"
assert_count maintenance-rule-separated 1 "SELECT COUNT(*) count FROM treinamento_requisitos WHERE id=220 AND empresa_id=6 AND qualificacao_tipo_id=25 AND escopo='FUNCAO' AND funcao_id=36 AND perfil_competencia='PTAP_MNT_SUPRIMENTOS' AND obrigatoriedade='OBRIGATORIA' AND ativo=1 AND deleted_at IS NULL"
assert_count MNT-no-active-rule 0 "SELECT COUNT(*) count FROM treinamento_requisitos WHERE empresa_id=6 AND qualificacao_tipo_id=137 AND ativo=1 AND deleted_at IS NULL"
assert_count D4-both-sector-links 2 "SELECT COUNT(*) count FROM qualificacoes_tipos_setores WHERE empresa_id=6 AND deleted_at IS NULL AND ((id=27 AND tipo_id=25 AND setor_id=10) OR (id=16 AND tipo_id=25 AND setor_id=11));"
assert_count no-legacy-sector-links 0 "SELECT COUNT(*) count FROM qualificacoes_tipos_setores WHERE empresa_id=6 AND tipo_id=137 AND deleted_at IS NULL;"
assert_count D4-seven-rules 7 "SELECT COUNT(*) count FROM treinamento_requisitos WHERE empresa_id=6 AND qualificacao_tipo_id=25 AND id IN (220,492,493,494,495,496,497) AND ativo=1 AND deleted_at IS NULL"
assert_count no-legacy-false-competence 0 "SELECT COUNT(*) count FROM qualificacoes_historico h JOIN treinamento_requisitos r ON r.qualificacao_tipo_id=h.qualificacao_id AND r.empresa_id=h.empresa_id AND r.id=220 WHERE h.id IN (4781,4782) AND h.perfil_competencia=r.perfil_competencia"
assert_count fk-integrity 0 "SELECT COUNT(*) count FROM pragma_foreign_key_check"
echo DGR_0585_POSTCONDITIONS_PASS
