#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
target=airtrust-db
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo UNKNOWN_ARGUMENT >&2; exit 1 ;; esac; done
[[ "$target" == airtrust-db ]] || { echo GUIAS_0586_DB_MISMATCH >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") | node -e "let s='';process.stdin.on('data',b=>s+=b);process.stdin.on('end',()=>{const a=s.indexOf('['),z=s.lastIndexOf(']'),d=JSON.parse(a>=0?s.slice(a,z+1):s),n=Number(d[0]?.results?.[0]?.count);if(!Number.isSafeInteger(n)||n<0)process.exit(1);console.log(n);})"; }
assert_count(){ local name="$1" expected="$2" sql="$3" n; n="$(query_count "$sql")"; [[ "$n" == "$expected" ]] || { echo "GUIAS_0586_POSTCHECK_FAILED: $name expected=$expected got=$n" >&2; exit 1; }; echo "CHECK_OK=$name"; }
assert_count ledger-0586 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='simuladores-guias-instrutor-v18-0586' AND baseline_id='production-d1-baseline-v2-20260714' AND status='ACTIVE'"
assert_count v2-guias-table 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='simuladores_guias_instrutor_v2'"
assert_count v2-links-table 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='simuladores_modelos_sessao_guias_v2'"
assert_count v2-audit-table 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='simuladores_guias_instrutor_auditoria_v2'"
assert_count guias-row-parity 0 "SELECT ABS((SELECT COUNT(*) FROM simuladores_guias_instrutor) - (SELECT COUNT(*) FROM simuladores_guias_instrutor_v2)) count"
assert_count links-row-parity 0 "SELECT ABS((SELECT COUNT(*) FROM simuladores_modelos_sessao_guias) - (SELECT COUNT(*) FROM simuladores_modelos_sessao_guias_v2)) count"
assert_count audit-row-parity 0 "SELECT ABS((SELECT COUNT(*) FROM simuladores_guias_instrutor_auditoria) - (SELECT COUNT(*) FROM simuladores_guias_instrutor_auditoria_v2)) count"
assert_count fk-integrity 0 "SELECT COUNT(*) count FROM pragma_foreign_key_check"
echo GUIAS_0586_POSTCONDITIONS_PASS
