#!/usr/bin/env bash
# source_reference: worker-airtrust/schema-v2/conhecimento-ativo-desafios-livres-0505.json
# operational_decision: read-only production Schema V2 preflight; no writes
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

ALLOWED_DB_NAME="airtrust-db"
BASELINE_ID="production-d1-baseline-v2-20260714"
CHANGE_ID="conhecimento-ativo-desafios-livres-0505"
PREREQUISITE_CHANGE_ID="conhecimento-ativo-foundation-0503"
target="$ALLOWED_DB_NAME"

for arg in "$@"; do
  case "$arg" in
    --target=*) target="${arg#*=}" ;;
    *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;;
  esac
done

[[ "$target" == "$ALLOWED_DB_NAME" ]] || {
  echo "ERROR: 0505 production preflight refused target: $target" >&2
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
assert_count prerequisite-0503-applied 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='$PREREQUISITE_CHANGE_ID';"
assert_count unapplied-change 0 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='$CHANGE_ID';"
assert_count challenge-table-present 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='conhecimento_ativo_desafios';"
assert_count canonical-sequence-column-absent 0 "SELECT COUNT(*) count FROM pragma_table_info('conhecimento_ativo_desafios') WHERE name='numero_sequencial';"
assert_count legacy-active-index-present 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='index' AND name='idx_ca_desafios_periodo_active';"

echo CONHECIMENTO_ATIVO_DESAFIOS_LIVRES_0505_PRODUCTION_PREFLIGHT=PASS
