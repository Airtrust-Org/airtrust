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
[[ "${EXPECTED_WORKER_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || { echo DGR_0585_WORKER_SHA_REQUIRED >&2; exit 1; }
live_sha="$(curl --fail --silent --show-error --max-time 12 -H 'Cache-Control: no-cache' https://api.airtrust.online/api/version | node -e "let d='';process.stdin.on('data',b=>d+=b);process.stdin.on('end',()=>{const x=JSON.parse(d);const sha=x?.data?.sourceSha;if(!/^[a-f0-9]{40}$/.test(sha||''))process.exit(1);process.stdout.write(sha)})")"
[[ "$live_sha" == "$EXPECTED_WORKER_SHA" ]] || { echo DGR_0585_WORKER_SHA_MISMATCH >&2; exit 1; }
assert_count unapplied-0585 0 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='dgr-legacy-maintenance-consolidation-0585'"
assert_count baseline-active 1 "SELECT COUNT(*) count FROM airtrust_schema_baselines_v2 WHERE baseline_id='production-d1-baseline-v2-20260714' AND status='ACTIVE'"
assert_count source-D4 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND id=25 AND codigo='D4' AND nome='DGR — Transporte de Artigos Perigosos' AND validade=24 AND ativo=1 AND deleted_at IS NULL"
assert_count source-MNT 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND id=137 AND codigo='MNT_ARTIGOS_PERIGOSOS' AND nome='Artigos Perigosos' AND ativo=1 AND deleted_at IS NULL"
assert_count D4-39 39 "SELECT COUNT(*) count FROM qualificacoes_historico WHERE empresa_id=6 AND qualificacao_id=25 AND deleted_at IS NULL"
assert_count MNT-two 2 "SELECT COUNT(*) count FROM qualificacoes_historico WHERE empresa_id=6 AND qualificacao_id=137 AND deleted_at IS NULL"
assert_count MNT-exact-inactive-legacy 2 "SELECT COUNT(*) count FROM qualificacoes_historico h JOIN funcionarios f ON f.id=h.funcionario_id AND f.empresa_id=h.empresa_id WHERE h.id IN (4781,4782) AND h.empresa_id=6 AND h.qualificacao_id=137 AND h.qualificacao_codigo='MNT_ARTIGOS_PERIGOSOS' AND h.tipo='Artigos Perigosos' AND h.status='VENCIDA' AND h.data_conclusao='2022-06-12' AND h.data_vencimento='2024-06-12' AND h.perfil_competencia IS NULL AND h.observacoes IS NULL AND h.deleted_at IS NULL AND f.status='INATIVO' AND f.ativo=0 AND f.deleted_at IS NULL"
assert_count former-deleted-history 1 "SELECT COUNT(*) count FROM qualificacoes_historico WHERE id=4649 AND empresa_id=6 AND qualificacao_id=137 AND deleted_at IS NOT NULL"
assert_count mandatory-maintenance-rule 1 "SELECT COUNT(*) count FROM treinamento_requisitos WHERE id=220 AND empresa_id=6 AND qualificacao_tipo_id=137 AND escopo='FUNCAO' AND funcao_id=36 AND perfil_competencia IS NULL AND obrigatoriedade='OBRIGATORIA' AND ativo=1 AND deleted_at IS NULL"
assert_count no-other-active-old-rules 0 "SELECT COUNT(*) count FROM treinamento_requisitos WHERE empresa_id=6 AND qualificacao_tipo_id=137 AND id<>220 AND ativo=1 AND deleted_at IS NULL"
assert_count six-D4-rules 6 "SELECT COUNT(*) count FROM treinamento_requisitos WHERE empresa_id=6 AND qualificacao_tipo_id=25 AND id IN (492,493,494,495,496,497) AND ativo=1 AND deleted_at IS NULL"
assert_count no-LMS 0 "SELECT COUNT(*) count FROM lms_cursos WHERE empresa_id=6 AND qualificacao_tipo_id IN (25,137) AND deleted_at IS NULL"
assert_count no-legacy-extra-profiles 0 "SELECT COUNT(*) count FROM qualificacoes_historico_perfis_competencia WHERE historico_id IN (4781,4782)"
assert_count no-legacy-reclass-queue 0 "SELECT COUNT(*) count FROM qualificacoes_historico_reclass_queue WHERE historico_id IN (4781,4782)"
assert_count fk-integrity 0 "SELECT COUNT(*) count FROM pragma_foreign_key_check"
echo DGR_0585_PREFLIGHT_PASS
