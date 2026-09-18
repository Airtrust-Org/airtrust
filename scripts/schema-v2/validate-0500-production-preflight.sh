#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db"; BASELINE_ID="production-d1-baseline-v2-20260714"; CHANGE_ID="controle-voos-navigation-points-0500"
target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: 0500 production preflight refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "PREFLIGHT_OK=$label"; }
assert_count active-baseline 1 "SELECT COUNT(*) count FROM airtrust_schema_baselines_v2 WHERE baseline_id='$BASELINE_ID' AND status='ACTIVE';"
assert_count unapplied-change 0 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='$CHANGE_ID';"
assert_count tenant-6 1 "SELECT COUNT(*) count FROM empresas WHERE id=6 AND deleted_at IS NULL;"
assert_count cv-aeroportos-table 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='cv_aeroportos';"
assert_count nav-table-absent 0 "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='cv_pontos_navegacao';"
assert_count nav-link-column-absent 0 "SELECT COUNT(*) count FROM pragma_table_info('cv_aeroportos') WHERE name='ponto_navegacao_id';"
assert_count nav-lat-column-absent 0 "SELECT COUNT(*) count FROM pragma_table_info('cv_aeroportos') WHERE name='latitude_decimal';"
assert_count sbme-baseline 1 "SELECT COUNT(*) count FROM cv_aeroportos WHERE empresa_id=6 AND codigo='SBME' AND deleted_at IS NULL;"
echo CONTROLE_VOOS_NAVIGATION_POINTS_0500_PRODUCTION_PREFLIGHT=PASS
