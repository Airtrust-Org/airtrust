#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
target=airtrust-db
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "UNKNOWN_ARGUMENT" >&2; exit 1 ;; esac; done
[[ "$target" == airtrust-db ]] || { echo "PRODUCTION_DB_MISMATCH" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") | node -e "let s='';process.stdin.on('data',b=>s+=b);process.stdin.on('end',()=>{const a=s.indexOf('['),z=s.lastIndexOf(']'),d=JSON.parse(a>=0?s.slice(a,z+1):s),v=Number(d[0]?.results?.[0]?.count); if(!Number.isSafeInteger(v)||v<0)process.exit(1);console.log(v);})"; }
assert_count(){ local name="$1" expected="$2" sql="$3" n; n="$(query_count "$sql")"; [[ "$n" == "$expected" ]] || { echo "PREPOST_FAILED: $name expected=$expected got=$n" >&2; exit 1; }; echo "CHECK_OK=$name"; }

assert_count schema-v2-0543-ledger 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='fdm-target-qualification-links-0543' AND baseline_id='production-d1-baseline-v2-20260714';"
assert_count exact-matched-bindings 2 "SELECT COUNT(*) count FROM lms_cursos c JOIN qualificacoes_tipos qt ON qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id AND qt.ativo=1 AND qt.deleted_at IS NULL WHERE c.empresa_id=6 AND c.ativo=1 AND c.publicado=1 AND c.deleted_at IS NULL AND ((c.id=71 AND qt.codigo='FDM-TRIPULACAO') OR (c.id=72 AND qt.codigo='FDM-MECANICO'));"
assert_count no-destination-enrollments-created 0 "SELECT COUNT(*) count FROM lms_matriculas WHERE empresa_id=6 AND curso_id IN (71,72);"
echo FDM_TARGET_BINDINGS_0543_PRODUCTION_POSTCONDITIONS=PASS
