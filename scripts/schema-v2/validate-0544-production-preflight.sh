#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
target=airtrust-db
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "UNKNOWN_ARGUMENT" >&2; exit 1 ;; esac; done
[[ "$target" == airtrust-db ]] || { echo "AVSEC_0544_DB_MISMATCH" >&2; exit 1; }
[[ "${EXPECTED_WORKER_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || { echo "AVSEC_0544_EXPECTED_WORKER_SHA_REQUIRED" >&2; exit 1; }
live_worker_sha="$(curl --fail --silent --show-error --max-time 12 -H 'Cache-Control: no-cache' https://api.airtrust.online/api/version | node -e "let d='';process.stdin.on('data',b=>d+=b);process.stdin.on('end',()=>{const x=JSON.parse(d);const sha=x?.data?.sourceSha;if(!/^[a-f0-9]{40}$/.test(sha||''))process.exit(1);process.stdout.write(sha)})")"
[[ "$live_worker_sha" == "$EXPECTED_WORKER_SHA" ]] || { echo "AVSEC_0544_WORKER_SHA_MISMATCH" >&2; exit 1; }
echo PREFLIGHT_OK=production-worker-exact-sha
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") | node -e "let s='';process.stdin.on('data',b=>s+=b);process.stdin.on('end',()=>{const a=s.indexOf('['),z=s.lastIndexOf(']'),d=JSON.parse(a>=0?s.slice(a,z+1):s),n=Number(d[0]?.results?.[0]?.count);if(!Number.isSafeInteger(n)||n<0)process.exit(1);console.log(n);})"; }
assert_count(){ local name="$1" expected="$2" sql="$3" n; n="$(query_count "$sql")"; [[ "$n" == "$expected" ]] || { echo "AVSEC_0544_PREFLIGHT_FAILED: $name expected=$expected got=$n" >&2; exit 1; }; echo "PREFLIGHT_OK=$name"; }
assert_count active-baseline 1 "SELECT COUNT(*) count FROM airtrust_schema_baselines_v2 WHERE baseline_id='production-d1-baseline-v2-20260714' AND status='ACTIVE';"
assert_count unapplied-0544 0 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='avsec-corporativo-historico-0544';"
assert_count dependencies-0519-0520 2 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id IN ('training-compliance-evidence-profiles-0519','training-compliance-evidence-multi-profiles-0520');"
assert_count unique-legacy-D1 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='D1' AND ativo=1 AND deleted_at IS NULL;"
assert_count unique-corporate-model 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='AVSEC_CONSC' AND ativo=1 AND deleted_at IS NULL;"
assert_count employee-manager 1 "SELECT COUNT(*) count FROM funcionarios f JOIN funcoes fn ON fn.id=f.funcao_id AND fn.empresa_id=f.empresa_id AND fn.deleted_at IS NULL WHERE f.id=111 AND f.empresa_id=6 AND f.funcao_id=53 AND f.setor_id=11 AND f.deleted_at IS NULL AND COALESCE(f.ativo,1)=1 AND fn.nome='Gerente de Manutenção';"
assert_count exact-original-evidence 1 "SELECT COUNT(*) count FROM qualificacoes_historico qh JOIN qualificacoes_tipos qt ON qt.id=qh.qualificacao_id AND qt.empresa_id=qh.empresa_id WHERE qh.id=5276 AND qh.empresa_id=6 AND qh.funcionario_id=111 AND qh.deleted_at IS NULL AND qt.codigo='D1' AND qh.qualificacao_codigo='D1' AND qh.perfil_competencia IS NULL AND qh.status='CONCLUIDO' AND qh.data_conclusao='2024-02-19' AND qh.data_vencimento='2026-02-19' AND qh.observacoes LIKE '%Conscientizacao AVSEC.pdf%';"
assert_count no-related-profile 0 "SELECT COUNT(*) count FROM qualificacoes_historico_perfis_competencia WHERE empresa_id=6 AND historico_id=5276 AND deleted_at IS NULL;"
assert_count no-existing-corporate-evidence 0 "SELECT COUNT(*) count FROM qualificacoes_historico qh JOIN qualificacoes_tipos qt ON qt.id=qh.qualificacao_id AND qt.empresa_id=qh.empresa_id WHERE qh.empresa_id=6 AND qh.funcionario_id=111 AND qt.codigo='AVSEC_CONSC' AND qh.deleted_at IS NULL;"
assert_count corporate-rule 1 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id AND qt.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND qt.codigo='AVSEC_CONSC' AND tr.escopo='EMPRESA' AND tr.obrigatoriedade='OBRIGATORIA' AND tr.ativo=1 AND tr.deleted_at IS NULL;"
echo AVSEC_0544_PRODUCTION_PREFLIGHT=PASS
