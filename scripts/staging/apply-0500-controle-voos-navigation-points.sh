#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"; ALLOWED_DB_ID="bf9963f4-eb12-439b-a830-20bbf577ac22"; BLOCKED_PRODUCTION_DB_ID="7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae"
MIGRATION_BASENAME="0500_controle_voos_navigation_points.sql"; SCHEMA_CHANGE_ID="controle-voos-navigation-points-0500"
apply=false; migration_arg=""
for arg in "$@"; do case "$arg" in --apply) apply=true ;; --migration=*) migration_arg="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
expected_path="release/worker-airtrust/migrations/$MIGRATION_BASENAME"; [[ "$migration_arg" == "$expected_path" ]] || { echo "ERROR: 0500 requires exact path $expected_path" >&2; exit 1; }
[[ ! -L "$migration_arg" && -f "$migration_arg" ]] || { echo "ERROR: migration 0500 missing or symlink refused" >&2; exit 1; }
if ! git -C release diff --quiet -- "worker-airtrust/migrations/$MIGRATION_BASENAME" || ! git -C release diff --cached --quiet -- "worker-airtrust/migrations/$MIGRATION_BASENAME"; then echo "ERROR: migration 0500 has uncommitted release changes" >&2; exit 1; fi
db_name="${STAGING_D1_NAME:-$ALLOWED_DB_NAME}"; db_id="${STAGING_D1_ID:-$ALLOWED_DB_ID}"
[[ "$db_name" == "$ALLOWED_DB_NAME" && "$db_id" == "$ALLOWED_DB_ID" && "$db_id" != "$BLOCKED_PRODUCTION_DB_ID" ]] || { echo "ERROR: target is not official staging D1" >&2; exit 1; }
manifest_path="release/worker-airtrust/schema-v2/$SCHEMA_CHANGE_ID.json"; schema_sql_path="release/worker-airtrust/schema-v2/changes/$MIGRATION_BASENAME"; plan_path="release/worker-airtrust/schema-v2/plans/controle-voos-navigation-points-0500.md"
for path in "$manifest_path" "$schema_sql_path" "$plan_path"; do [[ ! -L "$path" && -f "$path" ]] || { echo "ERROR: reviewed Schema V2 artifact missing: $path" >&2; exit 1; }; done
cmp -s "$migration_arg" "$schema_sql_path" || { echo "ERROR: canonical migration diverges from reviewed Schema V2 SQL" >&2; exit 1; }
sha256(){ if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}'; else sha256sum "$1" | awk '{print $1}'; fi; }; sql_hash="$(sha256 "$migration_arg")"; plan_hash="$(sha256 "$plan_path")"
node - "$manifest_path" "$sql_hash" "$plan_hash" <<'NODE'
const fs=require('node:fs');const[,,p,sqlHash,planHash]=process.argv,m=JSON.parse(fs.readFileSync(p,'utf8'));if(m.changeId!=='controle-voos-navigation-points-0500'||m.baselineId!=='production-d1-baseline-v2-20260714'||m.filePath!=='worker-airtrust/schema-v2/changes/0500_controle_voos_navigation_points.sql'||m.planPath!=='worker-airtrust/schema-v2/plans/controle-voos-navigation-points-0500.md'||m.fileHash!==sqlHash||m.planHash!==planHash)throw new Error('REVIEWED_MANIFEST_MISMATCH');
NODE
query_count(){ local sql="$1"; node - "$db_name" "$sql" <<'NODE'
const{spawnSync}=require('node:child_process'),path=require('node:path');const[,,db,sql]=process.argv,r=spawnSync('npx',['wrangler','d1','execute',db,'--remote','--json','--command',sql],{cwd:path.join(process.cwd(),'worker-airtrust'),encoding:'utf8',env:process.env});if(r.status!==0){process.stderr.write(r.stderr||r.stdout);process.exit(1)}const s=r.stdout.indexOf('['),e=r.stdout.lastIndexOf(']'),p=JSON.parse(s>=0&&e>s?r.stdout.slice(s,e+1):r.stdout),row=(Array.isArray(p)?p[0]?.results:p?.results)?.[0],n=Number(row?.count??row?.total??row?.['COUNT(*)']??(row?Object.values(row)[0]:NaN));if(!Number.isInteger(n)||n<0)throw new Error('INVALID_COUNT');process.stdout.write(String(n));
NODE
}
for table in empresas cv_aeroportos d1_migrations; do [[ "$(query_count "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='$table';")" == 1 ]] || { echo "ERROR: prerequisite $table missing" >&2; exit 1; }; done
[[ "$(query_count "SELECT COUNT(*) count FROM empresas WHERE id=6 AND deleted_at IS NULL;")" == 1 ]] || { echo "ERROR: tenant 6 prerequisite missing in staging" >&2; exit 1; }
ledger_count="$(query_count "SELECT COUNT(*) count FROM d1_migrations WHERE name='$MIGRATION_BASENAME';")"
nav_table_count="$(query_count "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='cv_pontos_navegacao';")"
nav_link_col_count="$(query_count "SELECT COUNT(*) count FROM pragma_table_info('cv_aeroportos') WHERE name='ponto_navegacao_id';")"
if [[ "$ledger_count" == 1 ]]; then bash scripts/staging/validate-0500-postconditions.sh --target="$db_name"; echo "MIGRATION_ALREADY_APPLIED_AND_VALIDATED=$MIGRATION_BASENAME"; exit 0; fi
[[ "$ledger_count" == 0 && "$nav_table_count" == 0 && "$nav_link_col_count" == 0 ]] || { echo "ERROR: 0500 schema/ledger drift or partial apply" >&2; exit 1; }
args=(--migration="$migration_arg"); $apply && args+=(--apply)
exec bash "$ROOT/scripts/staging/apply-approved-migration-with-recovery-point.sh" "${args[@]}"
