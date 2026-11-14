#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
target=airtrust-db
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "UNKNOWN_ARGUMENT" >&2; exit 1 ;; esac; done
[[ "$target" == airtrust-db ]] || { echo "AVSEC_0584_DB_MISMATCH" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") | node -e "let s='';process.stdin.on('data',b=>s+=b);process.stdin.on('end',()=>{const a=s.indexOf('['),z=s.lastIndexOf(']'),d=JSON.parse(a>=0?s.slice(a,z+1):s),n=Number(d[0]?.results?.[0]?.count);if(!Number.isSafeInteger(n)||n<0)process.exit(1);console.log(n);})"; }
assert_count(){ local name="$1" expected="$2" sql="$3" n; n="$(query_count "$sql")"; [[ "$n" == "$expected" ]] || { echo "AVSEC_0584_CHECK_FAILED: $name expected=$expected got=$n" >&2; exit 1; }; echo "CHECK_OK=$name"; }

[[ "${EXPECTED_WORKER_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || { echo "AVSEC_0584_EXPECTED_WORKER_SHA_REQUIRED" >&2; exit 1; }
live_sha="$(curl --fail --silent --show-error --max-time 12 -H 'Cache-Control: no-cache' https://api.airtrust.online/api/version | node -e "let d='';process.stdin.on('data',b=>d+=b);process.stdin.on('end',()=>{const x=JSON.parse(d);const sha=x?.data?.sourceSha;if(!/^[a-f0-9]{40}$/.test(sha||''))process.exit(1);process.stdout.write(sha)})")"
[[ "$live_sha" == "$EXPECTED_WORKER_SHA" ]] || { echo "AVSEC_0584_WORKER_SHA_MISMATCH" >&2; exit 1; }
assert_count active-baseline 1 "SELECT COUNT(*) count FROM airtrust_schema_baselines_v2 WHERE baseline_id='production-d1-baseline-v2-20260714' AND status='ACTIVE';"
assert_count unapplied-0584 0 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='avsec-competency-models-0584';"
assert_count applied-0544 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='avsec-corporativo-historico-0544';"
assert_count unique-D1 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND id=22 AND codigo='D1' AND nome='AVSEC' AND validade=24 AND ativo=1 AND deleted_at IS NULL;"
assert_count corporate-model 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND id=194 AND codigo='AVSEC_CONSC' AND ativo=1 AND deleted_at IS NULL;"
assert_count no-other-models 0 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo IN ('AVSEC_ATENDIMENTO','AVSEC_SOLO','AVSEC_CARGA') AND deleted_at IS NULL;"
assert_count legacy-crew-31 31 "SELECT COUNT(*) count FROM qualificacoes_historico WHERE empresa_id=6 AND qualificacao_id=22 AND qualificacao_codigo='D1' AND perfil_competencia='AVSEC_TRIPULANTE' AND deleted_at IS NULL;"
assert_count crew-no-unknown 0 "SELECT COUNT(*) count FROM qualificacoes_historico WHERE empresa_id=6 AND qualificacao_id=22 AND deleted_at IS NULL AND COALESCE(perfil_competencia,'')<>'AVSEC_TRIPULANTE';"
assert_count exact-corporate-history 1 "SELECT COUNT(*) count FROM qualificacoes_historico WHERE id=5276 AND empresa_id=6 AND funcionario_id=111 AND qualificacao_id=194 AND qualificacao_codigo='AVSEC_CONSC' AND status='CONCLUIDO' AND data_conclusao='2024-02-19' AND data_vencimento='2026-02-19' AND perfil_competencia IS NULL AND deleted_at IS NULL;"
assert_count no-other-corporate-history 0 "SELECT COUNT(*) count FROM qualificacoes_historico WHERE empresa_id=6 AND qualificacao_id=194 AND id<>5276 AND deleted_at IS NULL;"
assert_count pilot-rules 2 "SELECT COUNT(*) count FROM treinamento_requisitos WHERE empresa_id=6 AND id IN (486,487) AND qualificacao_tipo_id=22 AND perfil_competencia='AVSEC_TRIPULANTE' AND obrigatoriedade='OBRIGATORIA' AND ativo=1 AND deleted_at IS NULL;"
assert_count specialized-to-retire 3 "SELECT COUNT(*) count FROM treinamento_requisitos WHERE empresa_id=6 AND id IN (488,489,490) AND qualificacao_tipo_id=22 AND obrigatoriedade='OBRIGATORIA' AND ativo=1 AND deleted_at IS NULL;"
assert_count corporate-to-retire 2 "SELECT COUNT(*) count FROM treinamento_requisitos WHERE empresa_id=6 AND id IN (538,671) AND qualificacao_tipo_id=194 AND ativo=1 AND deleted_at IS NULL;"
assert_count no-unexpected-AVSEC-rules 0 "SELECT COUNT(*) count FROM treinamento_requisitos WHERE empresa_id=6 AND qualificacao_tipo_id IN (22,194) AND ativo=1 AND deleted_at IS NULL AND id NOT IN (486,487,488,489,490,538,671);"
assert_count no-LMS-source 0 "SELECT COUNT(*) count FROM lms_cursos WHERE empresa_id=6 AND qualificacao_tipo_id IN (22,194) AND deleted_at IS NULL;"
assert_count notification-reference 1 "SELECT COUNT(*) count FROM notificacoes_log WHERE empresa_id=6 AND qualificacao_historico_id=5276;"
assert_count no-notification-system 0 "SELECT COUNT(*) count FROM notificacoes_sistema WHERE qualificacao_historico_id=5276;"
assert_count no-qualification-successor 0 "SELECT COUNT(*) count FROM qualificacoes_historico WHERE renovacao_de=5276;"
assert_count no-lms-cycles 0 "SELECT COUNT(*) count FROM lms_matricula_ciclos WHERE qualificacao_historico_id=5276;"
assert_count no-generated-qualification 0 "SELECT COUNT(*) count FROM treinamentos_qualificacoes_geradas WHERE qualificacao_historico_id=5276 OR qualificacao_tipo_id=194;"
assert_count no-renewals 0 "SELECT COUNT(*) count FROM qualificacoes_renovacoes WHERE qualificacao_historico_id=5276;"
assert_count no-related-profiles 0 "SELECT COUNT(*) count FROM qualificacoes_historico_perfis_competencia WHERE historico_id=5276;"
assert_count no-reclass-queue 0 "SELECT COUNT(*) count FROM qualificacoes_historico_reclass_queue WHERE historico_id=5276;"
echo AVSEC_0584_PREFLIGHT_PASS
