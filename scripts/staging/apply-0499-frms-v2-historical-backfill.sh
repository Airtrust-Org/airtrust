#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"; ALLOWED_DB_ID="bf9963f4-eb12-439b-a830-20bbf577ac22"; BLOCKED_PRODUCTION_DB_ID="7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae"
CONFIRMATION_PHRASE="AIRTRUST_STAGING_SCHEMA_CHANGE"; MIGRATION_BASENAME="0499_frms_v2_historical_backfill.sql"; SCHEMA_CHANGE_ID="frms-v2-historical-backfill-0499"; TARGET_REV="frms-empresa6-helicopter-offshore-v2-history-0499"
apply=false; migration_arg=""
for arg in "$@"; do case "$arg" in --apply) apply=true ;; --migration=*) migration_arg="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
expected_path="release/worker-airtrust/migrations/$MIGRATION_BASENAME"; [[ "$migration_arg" == "$expected_path" ]] || { echo "ERROR: 0499 requires exact path $expected_path" >&2; exit 1; }
[[ ! -L "$migration_arg" && -f "$migration_arg" ]] || { echo "ERROR: migration 0499 missing or symlink refused" >&2; exit 1; }
if ! git -C release diff --quiet -- "worker-airtrust/migrations/$MIGRATION_BASENAME" || ! git -C release diff --cached --quiet -- "worker-airtrust/migrations/$MIGRATION_BASENAME"; then echo "ERROR: migration 0499 has uncommitted release changes" >&2; exit 1; fi
db_name="${STAGING_D1_NAME:-$ALLOWED_DB_NAME}"; db_id="${STAGING_D1_ID:-$ALLOWED_DB_ID}"
[[ "$db_name" == "$ALLOWED_DB_NAME" && "$db_id" == "$ALLOWED_DB_ID" && "$db_id" != "$BLOCKED_PRODUCTION_DB_ID" ]] || { echo "ERROR: target is not official staging D1" >&2; exit 1; }
manifest_path="release/worker-airtrust/schema-v2/$SCHEMA_CHANGE_ID.json"; schema_sql_path="release/worker-airtrust/schema-v2/changes/$MIGRATION_BASENAME"; plan_path="release/worker-airtrust/schema-v2/plans/frms-v2-historical-backfill-0499.md"
for path in "$manifest_path" "$schema_sql_path" "$plan_path"; do [[ ! -L "$path" && -f "$path" ]] || { echo "ERROR: reviewed Schema V2 artifact missing: $path" >&2; exit 1; }; done
cmp -s "$migration_arg" "$schema_sql_path" || { echo "ERROR: canonical migration diverges from reviewed Schema V2 SQL" >&2; exit 1; }
sha256(){ if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}'; else sha256sum "$1" | awk '{print $1}'; fi; }; sql_hash="$(sha256 "$migration_arg")"; plan_hash="$(sha256 "$plan_path")"
node - "$manifest_path" "$sql_hash" "$plan_hash" <<'NODE'
const fs=require('node:fs');const[,,p,sqlHash,planHash]=process.argv,m=JSON.parse(fs.readFileSync(p,'utf8'));if(m.changeId!=='frms-v2-historical-backfill-0499'||m.baselineId!=='production-d1-baseline-v2-20260714'||m.filePath!=='worker-airtrust/schema-v2/changes/0499_frms_v2_historical_backfill.sql'||m.planPath!=='worker-airtrust/schema-v2/plans/frms-v2-historical-backfill-0499.md'||m.fileHash!==sqlHash||m.planHash!==planHash)throw new Error('REVIEWED_MANIFEST_MISMATCH');
NODE
query_count(){ local sql="$1"; node - "$db_name" "$sql" <<'NODE'
const{spawnSync}=require('node:child_process'),path=require('node:path');const[,,db,sql]=process.argv,r=spawnSync('npx',['wrangler','d1','execute',db,'--remote','--json','--command',sql],{cwd:path.join(process.cwd(),'worker-airtrust'),encoding:'utf8',env:process.env});if(r.status!==0){process.stderr.write(r.stderr||r.stdout);process.exit(1)}const s=r.stdout.indexOf('['),e=r.stdout.lastIndexOf(']'),p=JSON.parse(s>=0&&e>s?r.stdout.slice(s,e+1):r.stdout),row=(Array.isArray(p)?p[0]?.results:p?.results)?.[0],n=Number(row?.count??row?.total??row?.['COUNT(*)']??(row?Object.values(row)[0]:NaN));if(!Number.isInteger(n)||n<0)throw new Error('INVALID_COUNT');process.stdout.write(String(n));
NODE
}
for table in frms_config_revisions frms_config_parameters frms_recalc_runs frms_profile_assignments frms_regulatory_profiles; do [[ "$(query_count "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='$table';")" == 1 ]] || { echo "ERROR: prerequisite $table missing" >&2; exit 1; }; done
ledger_count="$(query_count "SELECT COUNT(*) count FROM d1_migrations WHERE name='$MIGRATION_BASENAME';")"; target_count="$(query_count "SELECT COUNT(*) count FROM frms_config_revisions WHERE id='$TARGET_REV';")"
if [[ "$ledger_count" == 1 ]]; then [[ "$target_count" == 1 ]] || { echo "ERROR: 0499 ledger exists without tenant revision" >&2; exit 1; }; bash scripts/staging/validate-0499-postconditions.sh --target="$db_name"; echo "MIGRATION_ALREADY_APPLIED_AND_VALIDATED=$MIGRATION_BASENAME"; exit 0; fi
[[ "$ledger_count" == 0 && "$target_count" == 0 ]] || { echo "ERROR: 0499 revision/ledger drift" >&2; exit 1; }
preflight="$(mktemp -t airtrust-staging-0499-preflight.XXXXXXXX)"; recovery="$(mktemp -t airtrust-staging-0499-recovery.XXXXXXXX)"; combined="$(mktemp -t airtrust-staging-0499.XXXXXXXX.sql)"; apply_output="$(mktemp -t airtrust-staging-0499-apply.XXXXXXXX)"; trap 'rm -f "$preflight" "$recovery" "$combined" "$apply_output"' EXIT
node scripts/staging/migration-ledger-preflight.mjs --scope="0499" > "$preflight" || { cat "$preflight" >&2; exit 1; }
node --input-type=module - "$migration_arg" "$MIGRATION_BASENAME" "$combined" <<'NODE'
import{readFileSync,writeFileSync}from'node:fs';import{buildLedgerAppliedSql}from'./worker-airtrust/scripts/lib/migration-remote-apply.mjs';const[migrationPath,migrationName,outputPath]=process.argv.slice(2);writeFileSync(outputPath,buildLedgerAppliedSql({migrationSql:readFileSync(migrationPath,'utf8'),migrationName}),{encoding:'utf8',mode:0o600});
NODE
if ! $apply; then echo DRY_RUN=true; echo REMOTE_WRITE_EXECUTED=false; exit 0; fi
[[ "${CONFIRM_STAGING_SCHEMA_CHANGE:-}" == "$CONFIRMATION_PHRASE" ]] || { echo "ERROR: staging confirmation missing" >&2; exit 1; }
recovery_timestamp="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"; (cd worker-airtrust && npx wrangler d1 time-travel info "$db_name" --timestamp="$recovery_timestamp" --json > "$recovery"); test -s "$recovery"; echo "RECOVERY_TIMESTAMP_UTC=$recovery_timestamp"
sql_payload="$(cat "$combined")"; [[ -n "$sql_payload" ]] || { echo "ERROR: empty 0499 SQL bundle" >&2; exit 1; }; [[ ${#sql_payload} -le 100000 ]] || { echo "ERROR: 0499 SQL bundle exceeds bounded --command transport" >&2; exit 1; }
(cd worker-airtrust && npx wrangler d1 execute "$db_name" --remote --command="$sql_payload" --json > "$apply_output"); test -s "$apply_output"
[[ "$(query_count "SELECT COUNT(*) count FROM d1_migrations WHERE name='$MIGRATION_BASENAME';")" == 1 ]] || { echo "ERROR: 0499 applied without exact ledger row" >&2; exit 1; }
bash scripts/staging/validate-0499-postconditions.sh --target="$db_name"; echo "MIGRATION_APPLIED_AND_VALIDATED=$MIGRATION_BASENAME"
