#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db"
BASELINE_ID="production-d1-baseline-v2-20260714"
CHANGE_ID="controle-voos-delay-justification-catalog-0507"
target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: 0507 production postconditions refused target: $target" >&2; exit 1; }
query_count() {
  local sql="$1"
  (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") |
    node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"
}
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "POSTCONDITION_OK=$label"; }
assert_count active-baseline 1 "SELECT COUNT(*) count FROM airtrust_schema_baselines_v2 WHERE baseline_id='$BASELINE_ID' AND status='ACTIVE';"
assert_count applied-change 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='$CHANGE_ID';"
assert_count category-column-present 1 "SELECT COUNT(*) count FROM pragma_table_info('cv_justificativas_voo') WHERE name='categoria';"
assert_count category-index-present 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='index' AND name='idx_cv_justificativas_voo_empresa_categoria';"
assert_count seeded-codes 54 "SELECT COUNT(*) count FROM cv_justificativas_voo WHERE empresa_id=6 AND deleted_at IS NULL AND ativo=1 AND codigo GLOB 'AA[4-9][0-9]';"
assert_count source-categories 5 "SELECT COUNT(DISTINCT categoria) count FROM cv_justificativas_voo WHERE empresa_id=6 AND deleted_at IS NULL AND ativo=1 AND codigo GLOB 'AA[4-9][0-9]';"
assert_count aa41-present 1 "SELECT COUNT(*) count FROM cv_justificativas_voo WHERE empresa_id=6 AND codigo='AA41' AND nome='ABASTECIMENTO' AND deleted_at IS NULL;"
assert_count aa94-present 1 "SELECT COUNT(*) count FROM cv_justificativas_voo WHERE empresa_id=6 AND codigo='AA94' AND categoria='Condições Meteorológicas' AND deleted_at IS NULL;"
echo CONTROLE_VOOS_DELAY_JUSTIFICATION_CATALOG_0507_PRODUCTION_POSTCONDITIONS=PASS
