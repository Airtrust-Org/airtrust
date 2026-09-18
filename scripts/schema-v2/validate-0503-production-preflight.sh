#!/usr/bin/env bash
# source_reference: worker-airtrust/schema-v2/conhecimento-ativo-foundation-0503.json
# operational_decision: read-only production Schema V2 preflight; no writes
# dry_run_required: true
# rollback_plan_required: worker-airtrust/schema-v2/plans/conhecimento-ativo-foundation-0503.md
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

ALLOWED_DB_NAME="airtrust-db"
BASELINE_ID="production-d1-baseline-v2-20260714"
CHANGE_ID="conhecimento-ativo-foundation-0503"
target="$ALLOWED_DB_NAME"

for arg in "$@"; do
  case "$arg" in
    --target=*) target="${arg#*=}" ;;
    *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;;
  esac
done

[[ "$target" == "$ALLOWED_DB_NAME" ]] || {
  echo "ERROR: 0503 production preflight refused target: $target" >&2
  exit 1
}

query_count() {
  local sql="$1"
  (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") |
    node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"
}

assert_count() {
  local label="$1" expected="$2" sql="$3" count
  count="$(query_count "$sql")"
  [[ "$count" == "$expected" ]] || {
    echo "ERROR: $label expected=$expected found=$count" >&2
    exit 1
  }
  echo "PREFLIGHT_OK=$label"
}

assert_count active-baseline 1 "SELECT COUNT(*) count FROM airtrust_schema_baselines_v2 WHERE baseline_id='$BASELINE_ID' AND status='ACTIVE';"
assert_count unapplied-change 0 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='$CHANGE_ID';"

for table in usuarios funcionarios aeronaves funcionarios_aeronaves modelos_aeronave; do
  assert_count "prerequisite-$table" 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='$table';"
done

assert_count conhecimento-ativo-tables-absent 0 "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name LIKE 'conhecimento_ativo_%';"
assert_count conhecimento-ativo-triggers-absent 0 "SELECT COUNT(*) count FROM sqlite_master WHERE type='trigger' AND name LIKE 'trg_ca_%';"

echo CONHECIMENTO_ATIVO_FOUNDATION_0503_PRODUCTION_PREFLIGHT=PASS
