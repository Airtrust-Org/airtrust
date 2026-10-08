#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
target=airtrust-db
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "UNKNOWN_ARGUMENT" >&2; exit 1 ;; esac; done
[[ "$target" == airtrust-db ]] || { echo "AVSEC_0544_DB_MISMATCH" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") | node -e "let s='';process.stdin.on('data',b=>s+=b);process.stdin.on('end',()=>{const a=s.indexOf('['),z=s.lastIndexOf(']'),d=JSON.parse(a>=0?s.slice(a,z+1):s),n=Number(d[0]?.results?.[0]?.count);if(!Number.isSafeInteger(n)||n<0)process.exit(1);console.log(n);})"; }
assert_count(){ local name="$1" expected="$2" sql="$3" n; n="$(query_count "$sql")"; [[ "$n" == "$expected" ]] || { echo "AVSEC_0544_POSTCONDITION_FAILED: $name expected=$expected got=$n" >&2; exit 1; }; echo "POSTCONDITION_OK=$name"; }
assert_count ledger-0544 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='avsec-corporativo-historico-0544' AND baseline_id='production-d1-baseline-v2-20260714';"
assert_count exact-corporate-reclassification 1 "SELECT COUNT(*) count FROM qualificacoes_historico qh JOIN qualificacoes_tipos qt ON qt.id=qh.qualificacao_id AND qt.empresa_id=qh.empresa_id WHERE qh.id=5276 AND qh.empresa_id=6 AND qh.funcionario_id=111 AND qh.deleted_at IS NULL AND qt.codigo='AVSEC_CONSC' AND qh.qualificacao_codigo='AVSEC_CONSC' AND qh.perfil_competencia IS NULL AND qh.status='CONCLUIDO' AND qh.data_conclusao='2024-02-19' AND qh.data_vencimento='2026-02-19' AND qh.observacoes LIKE '%Conscientizacao AVSEC.pdf%';"
assert_count unchanged-single-corporate-evidence 1 "SELECT COUNT(*) count FROM qualificacoes_historico qh JOIN qualificacoes_tipos qt ON qt.id=qh.qualificacao_id AND qt.empresa_id=qh.empresa_id WHERE qh.empresa_id=6 AND qh.funcionario_id=111 AND qt.codigo='AVSEC_CONSC' AND qh.deleted_at IS NULL;"
assert_count no-new-history-profiles 0 "SELECT COUNT(*) count FROM qualificacoes_historico_perfis_competencia WHERE empresa_id=6 AND historico_id=5276 AND deleted_at IS NULL;"
echo AVSEC_0544_PRODUCTION_POSTCONDITIONS=PASS
