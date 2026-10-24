#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
target=airtrust-db
for arg in "$@"; do
  case "$arg" in --target=*) target="${arg#*=}" ;; *) echo UNKNOWN_ARGUMENT >&2; exit 1 ;; esac
done
[[ "$target" == airtrust-db ]] || { echo PRODUCTION_DB_MISMATCH >&2; exit 1; }
query_count(){
  local sql="$1"
  (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") |
    node -e "let s='';process.stdin.on('data',b=>s+=b);process.stdin.on('end',()=>{const a=s.indexOf('['),z=s.lastIndexOf(']'),d=JSON.parse(a>=0?s.slice(a,z+1):s),v=Number(d[0]?.results?.[0]?.count);if(!Number.isSafeInteger(v)||v<0)process.exit(1);console.log(v);})"
}
assert_count(){
  local n="$1" e="$2" q="$3" a
  a="$(query_count "$q")"
  [[ "$a" == "$e" ]] || { echo "SCHEMA_0554_CHECK_FAILED: $n expected=$e got=$a" >&2; exit 1; }
  echo "SCHEMA_0554_CHECK_OK=$n"
}
assert_count unapplied 0 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='simulator-individual-check-evidence-0554';"
assert_count source-tables 4 "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name IN ('sessoes_checks','fichas_sessao','simulador_agendamentos','funcionarios');"
assert_count new-table-absent 0 "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='sessoes_checks_resultados_individuais';"
echo SIMULATOR_INDIVIDUAL_CHECK_EVIDENCE_0554_PREFLIGHT=PASS
