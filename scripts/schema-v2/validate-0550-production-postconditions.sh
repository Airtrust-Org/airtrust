#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
target=airtrust-db
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo UNKNOWN_ARGUMENT >&2; exit 1 ;; esac; done
[[ "$target" == airtrust-db ]] || { echo PRODUCTION_DB_MISMATCH >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") | node -e "let s='';process.stdin.on('data',b=>s+=b);process.stdin.on('end',()=>{const a=s.indexOf('['),z=s.lastIndexOf(']'),d=JSON.parse(a>=0?s.slice(a,z+1):s),v=Number(d[0]?.results?.[0]?.count);if(!Number.isSafeInteger(v)||v<0)process.exit(1);console.log(v);})"; }
assert_count(){ local n="$1" e="$2" q="$3" a; a="$(query_count "$q")"; [[ "$a" == "$e" ]] || { echo "POSTCHECK_FAILED: $n expected=$e got=$a" >&2; exit 1; }; echo "CHECK_OK=$n"; }
assert_count ledger 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='retire-empty-lgpd-seg-info-model-0550' AND baseline_id='production-d1-baseline-v2-20260714';"
assert_count retired-model 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='LGPD_SEG_INFO' AND ativo=0 AND deleted_at IS NOT NULL;"
assert_count active-history 0 "SELECT COUNT(*) count FROM qualificacoes_historico h JOIN qualificacoes_tipos q ON q.id=h.qualificacao_id AND q.empresa_id=h.empresa_id WHERE h.empresa_id=6 AND h.deleted_at IS NULL AND q.codigo='LGPD_SEG_INFO';"
assert_count active-courses 0 "SELECT COUNT(*) count FROM lms_cursos c JOIN qualificacoes_tipos q ON q.id=c.qualificacao_tipo_id AND q.empresa_id=c.empresa_id WHERE c.empresa_id=6 AND c.deleted_at IS NULL AND q.codigo='LGPD_SEG_INFO';"
assert_count active-requirements 0 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos q ON q.id=tr.qualificacao_tipo_id AND q.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND tr.ativo=1 AND tr.deleted_at IS NULL AND q.codigo='LGPD_SEG_INFO';"
echo RETIRE_EMPTY_LGPD_SEG_INFO_0550_PRODUCTION_POSTCONDITIONS=PASS
