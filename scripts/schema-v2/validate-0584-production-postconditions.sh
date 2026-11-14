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

assert_count ledger-0584 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='avsec-competency-models-0584' AND baseline_id='production-d1-baseline-v2-20260714';"
assert_count active-AVSEC-one 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL AND (codigo='D1' OR codigo LIKE 'AVSEC_%');"
assert_count D1-name 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE id=22 AND empresa_id=6 AND codigo='D1' AND nome='AVSEC — Tripulantes' AND validade=24 AND ativo=1 AND deleted_at IS NULL;"
assert_count corporate-retired 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE id=194 AND empresa_id=6 AND codigo='AVSEC_CONSC' AND ativo=0 AND deleted_at IS NOT NULL;"
assert_count D1-history-preserved 31 "SELECT COUNT(*) count FROM qualificacoes_historico WHERE empresa_id=6 AND qualificacao_id=22 AND qualificacao_codigo='D1' AND perfil_competencia='AVSEC_TRIPULANTE' AND deleted_at IS NULL;"
assert_count corporate-history-erased 0 "SELECT COUNT(*) count FROM qualificacoes_historico WHERE id=5276 OR (empresa_id=6 AND qualificacao_id=194);"
assert_count notification-detached 0 "SELECT COUNT(*) count FROM notificacoes_log WHERE qualificacao_historico_id=5276;"
assert_count D1-crew-rules-only 2 "SELECT COUNT(*) count FROM treinamento_requisitos WHERE empresa_id=6 AND qualificacao_tipo_id=22 AND id IN (486,487) AND obrigatoriedade='OBRIGATORIA' AND ativo=1 AND deleted_at IS NULL;"
assert_count retired-rules 0 "SELECT COUNT(*) count FROM treinamento_requisitos WHERE empresa_id=6 AND id IN (488,489,490,538,671) AND ativo=1 AND deleted_at IS NULL;"
assert_count no-active-corporate-rule 0 "SELECT COUNT(*) count FROM treinamento_requisitos WHERE empresa_id=6 AND qualificacao_tipo_id=194 AND ativo=1 AND deleted_at IS NULL;"
echo AVSEC_0584_POSTCONDITIONS_PASS
