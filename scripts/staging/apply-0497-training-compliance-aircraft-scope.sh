#!/usr/bin/env bash
# Governed staging-only application path for Schema V2 training compliance aircraft scope 0497.
# Default mode is dry-run. --apply is explicit and still requires the staging
# confirmation phrase supplied only by sanctioned workflows.
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"
ALLOWED_DB_ID="bf9963f4-eb12-439b-a830-20bbf577ac22"
BLOCKED_PRODUCTION_DB_ID="7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae"
CONFIRMATION_PHRASE="AIRTRUST_STAGING_SCHEMA_CHANGE"
MIGRATION_BASENAME="0497_training_compliance_aircraft_scope.sql"
SCHEMA_CHANGE_ID="training-compliance-aircraft-scope-0497"
apply=false
migration_arg=""
for arg in "$@"; do
  case "$arg" in
    --apply) apply=true ;;
    --migration=*) migration_arg="${arg#*=}" ;;
    *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;;
  esac
done
expected_path="release/worker-airtrust/migrations/$MIGRATION_BASENAME"
[[ "$migration_arg" == "$expected_path" ]] || { echo "ERROR: 0497 requires exact path $expected_path" >&2; exit 1; }
[[ ! -L "$migration_arg" && -f "$migration_arg" ]] || { echo "ERROR: migration 0497 missing or symlink refused" >&2; exit 1; }
if ! git -C release diff --quiet -- "worker-airtrust/migrations/$MIGRATION_BASENAME" || ! git -C release diff --cached --quiet -- "worker-airtrust/migrations/$MIGRATION_BASENAME"; then
  echo "ERROR: migration 0497 has uncommitted release changes" >&2; exit 1
fi
release_sha="$(git -C release rev-parse HEAD)"
db_name="${STAGING_D1_NAME:-$ALLOWED_DB_NAME}"
db_id="${STAGING_D1_ID:-$ALLOWED_DB_ID}"
[[ "$db_name" == "$ALLOWED_DB_NAME" && "$db_id" == "$ALLOWED_DB_ID" ]] || { echo "ERROR: target is not official staging D1" >&2; exit 1; }
[[ "$db_id" != "$BLOCKED_PRODUCTION_DB_ID" && "$db_name" != "airtrust-db" ]] || { echo "ERROR: production target refused" >&2; exit 1; }
manifest_path="release/worker-airtrust/schema-v2/$SCHEMA_CHANGE_ID.json"
schema_sql_path="release/worker-airtrust/schema-v2/changes/$MIGRATION_BASENAME"
plan_path="release/worker-airtrust/schema-v2/plans/training-compliance-aircraft-scope-0497.md"
for path in "$manifest_path" "$schema_sql_path" "$plan_path"; do [[ ! -L "$path" && -f "$path" ]] || { echo "ERROR: reviewed Schema V2 artifact missing: $path" >&2; exit 1; }; done
cmp -s "$migration_arg" "$schema_sql_path" || { echo "ERROR: canonical migration diverges from reviewed Schema V2 SQL" >&2; exit 1; }
sha256(){ if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}'; else sha256sum "$1" | awk '{print $1}'; fi; }
sql_hash="$(sha256 "$migration_arg")"; plan_hash="$(sha256 "$plan_path")"
node - "$manifest_path" "$sql_hash" "$plan_hash" <<'NODE'
const fs=require('node:fs'); const [,,p,sqlHash,planHash]=process.argv; const m=JSON.parse(fs.readFileSync(p,'utf8'));
if(m.changeId!=='training-compliance-aircraft-scope-0497') throw new Error('CHANGE_ID_MISMATCH');
if(m.baselineId!=='production-d1-baseline-v2-20260714') throw new Error('BASELINE_ID_MISMATCH');
if(m.filePath!=='worker-airtrust/schema-v2/changes/0497_training_compliance_aircraft_scope.sql') throw new Error('FILE_PATH_MISMATCH');
if(m.planPath!=='worker-airtrust/schema-v2/plans/training-compliance-aircraft-scope-0497.md') throw new Error('PLAN_PATH_MISMATCH');
if(m.fileHash!==sqlHash||m.planHash!==planHash) throw new Error('REVIEWED_HASH_MISMATCH');
NODE
printf 'MIGRATION=%s\nRELEASE_SHA=%s\nSQL_SHA256=%s\nTARGET_DB=%s\nSCHEMA_V2_REVIEWED=true\n' "$MIGRATION_BASENAME" "$release_sha" "$sql_hash" "$db_name"
query_count(){ local sql="$1"; node - "$db_name" "$sql" <<'NODE'
const {spawnSync}=require('node:child_process'),path=require('node:path'); const [,,db,sql]=process.argv; const r=spawnSync('npx',['wrangler','d1','execute',db,'--remote','--json','--command',sql],{cwd:path.join(process.cwd(),'worker-airtrust'),encoding:'utf8',env:process.env}); if(r.status!==0){process.stderr.write(r.stderr||r.stdout);process.exit(1)} const s=r.stdout.indexOf('['),e=r.stdout.lastIndexOf(']'),p=JSON.parse(s>=0&&e>s?r.stdout.slice(s,e+1):r.stdout),row=(Array.isArray(p)?p[0]?.results:p?.results)?.[0],n=Number(row?.count??row?.total??row?.['COUNT(*)']??(row?Object.values(row)[0]:NaN)); if(!Number.isInteger(n)||n<0)throw new Error('INVALID_COUNT'); process.stdout.write(String(n));
NODE
}
for table in treinamento_requisitos aeronaves funcionarios_aeronaves; do [[ "$(query_count "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='$table';")" == 1 ]] || { echo "ERROR: prerequisite $table missing" >&2; exit 1; }; done
[[ "$(query_count "SELECT COUNT(*) AS count FROM d1_migrations WHERE name='0491_training_compliance_requirements.sql';")" == 1 ]] || { echo "ERROR: prerequisite 0491 not applied in staging ledger" >&2; exit 1; }
ledger_count="$(query_count "SELECT COUNT(*) AS count FROM d1_migrations WHERE name='$MIGRATION_BASENAME';")"
column_count="$(query_count "SELECT COUNT(*) AS count FROM pragma_table_info('treinamento_requisitos') WHERE name='aeronave_modelo';")"
if [[ "$ledger_count" == 1 ]]; then
  [[ "$column_count" == 1 ]] || { echo "ERROR: 0497 ledger exists without aeronave_modelo column" >&2; exit 1; }
  bash scripts/staging/validate-0497-postconditions.sh --target="$db_name"
  echo "MIGRATION_ALREADY_APPLIED_AND_VALIDATED=$MIGRATION_BASENAME"; exit 0
fi
[[ "$ledger_count" == 0 ]] || { echo "ERROR: invalid 0497 ledger count=$ledger_count" >&2; exit 1; }
[[ "$column_count" == 0 ]] || { echo "ERROR: 0497 schema drift: column exists without ledger" >&2; exit 1; }
preflight="$(mktemp -t airtrust-staging-0497-preflight.XXXXXXXX)"; recovery="$(mktemp -t airtrust-staging-0497-recovery.XXXXXXXX)"; combined="$(mktemp -t airtrust-staging-0497.XXXXXXXX.sql)"; trap 'rm -f "$preflight" "$recovery" "$combined"' EXIT
node scripts/staging/migration-ledger-preflight.mjs --scope="0497" > "$preflight" || { cat "$preflight" >&2; exit 1; }
node --input-type=module - "$migration_arg" "$MIGRATION_BASENAME" "$combined" <<'NODE'
import {readFileSync,writeFileSync} from 'node:fs'; import {buildLedgerAppliedSql} from './worker-airtrust/scripts/lib/migration-remote-apply.mjs'; const [migrationPath,migrationName,outputPath]=process.argv.slice(2); writeFileSync(outputPath,buildLedgerAppliedSql({migrationSql:readFileSync(migrationPath,'utf8'),migrationName}),{encoding:'utf8',mode:0o600});
NODE
if ! $apply; then echo "DRY_RUN=true"; echo "REMOTE_WRITE_EXECUTED=false"; exit 0; fi
[[ "${CONFIRM_STAGING_SCHEMA_CHANGE:-}" == "$CONFIRMATION_PHRASE" ]] || { echo "ERROR: staging confirmation missing" >&2; exit 1; }
recovery_timestamp="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
(cd worker-airtrust && npx wrangler d1 time-travel info "$db_name" --timestamp="$recovery_timestamp" --json > "$recovery")
test -s "$recovery"; node - "$recovery" <<'NODE'
const fs=require('node:fs'); if(!/bookmark/i.test(JSON.stringify(JSON.parse(fs.readFileSync(process.argv[2],'utf8'))))) throw new Error('TIME_TRAVEL_BOOKMARK_NOT_CONFIRMED');
NODE
echo "RECOVERY_TIMESTAMP_UTC=$recovery_timestamp"
(cd worker-airtrust && npx wrangler d1 execute "$db_name" --remote --file="$combined")
[[ "$(query_count "SELECT COUNT(*) AS count FROM d1_migrations WHERE name='$MIGRATION_BASENAME';")" == 1 ]] || { echo "ERROR: 0497 applied without exact ledger row" >&2; exit 1; }
bash scripts/staging/validate-0497-postconditions.sh --target="$db_name"
echo "MIGRATION_APPLIED_AND_VALIDATED=$MIGRATION_BASENAME"
