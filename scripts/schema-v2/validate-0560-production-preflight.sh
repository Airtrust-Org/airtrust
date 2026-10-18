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
  local label="$1" expected="$2" sql="$3" actual
  actual="$(query_count "$sql")"
  [[ "$actual" == "$expected" ]] || { echo "SCHEMA_0560_CHECK_FAILED: $label expected=$expected actual=$actual" >&2; exit 1; }
  echo "SCHEMA_0560_CHECK_OK=$label"
}
# Read-only production preflight. NEVER run automatically or as authorization.
assert_count active-baseline 1 "SELECT COUNT(*) count FROM airtrust_schema_baselines_v2 WHERE baseline_id='production-d1-baseline-v2-20260714' AND status='ACTIVE';"
assert_count dependency-0554 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='simulator-individual-check-evidence-0554' AND baseline_id='production-d1-baseline-v2-20260714';"
assert_count unapplied-0560 0 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='simulator-individual-check-delete-guard-0560';"
assert_count source-table 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='sessoes_checks_resultados_individuais';"
assert_count indexes-0554 3 "SELECT COUNT(*) count FROM sqlite_master WHERE type='index' AND tbl_name='sessoes_checks_resultados_individuais' AND name LIKE 'idx_checks_individuais_%';"
assert_count triggers-0554 6 "SELECT COUNT(*) count FROM sqlite_master WHERE type='trigger' AND tbl_name='sessoes_checks_resultados_individuais' AND name LIKE 'trg_checks_individuais_%';"
assert_count delete-guard-absent 0 "SELECT COUNT(*) count FROM sqlite_master WHERE type='trigger' AND name='trg_checks_individuais_delete_guard';"
echo SIMULATOR_CHECK_DELETE_GUARD_0560_PREFLIGHT=PASS
