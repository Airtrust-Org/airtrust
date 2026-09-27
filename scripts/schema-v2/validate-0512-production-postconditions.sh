#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db"; BASELINE_ID="production-d1-baseline-v2-20260714"; CHANGE_ID="frms-regulatory-evidence-location-catalog-0512"
SOURCE_HASH="c66536dba033f7854e2e1702418d1dbb4d4b45dc59e03dfa4cf949b645ec35cc"
target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: 0512 production postconditions refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "POSTCONDITION_OK=$label"; }
assert_count active-baseline 1 "SELECT COUNT(*) count FROM airtrust_schema_baselines_v2 WHERE baseline_id='$BASELINE_ID' AND status='ACTIVE';"
assert_count schema-v2-change 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='$CHANGE_ID';"
assert_count profile-evidence 1 "SELECT COUNT(*) count FROM frms_regulatory_profiles WHERE id='frms-regulatory-profile-6-helicopter-offshore-v1' AND empresa_id=6 AND profile_code='HELICOPTER_OFFSHORE' AND active=1 AND deleted_at IS NULL AND approval_reference='AIRTRUST_FRMS_REGULATORY_SOURCE_MANIFEST_2026-09-27' AND source_document_hash='$SOURCE_HASH' AND json_valid(limits_json)=1 AND json_array_length(json_extract(limits_json,'$.rbac117_appendices'))=0 AND json_extract(limits_json,'$.appendix_selection_status')='UNCONFIRMED_OPERATOR_SELECTION' AND json_extract(limits_json,'$.grf_status')='NOT_DOCUMENTED_IN_AIRTRUST' AND json_extract(limits_json,'$.sgrf_status')='NOT_APPROVED_EVIDENCE_IN_AIRTRUST';"
assert_count catalog-seven 7 "SELECT COUNT(*) count FROM frms_location_catalog WHERE empresa_id=6 AND active=1 AND deleted_at IS NULL AND location_code IN ('SBME','9PGB','9PGS','9PGF','9PHK','9PSS','9PUF');"
assert_count catalog-sbme 1 "SELECT COUNT(*) count FROM frms_location_catalog WHERE empresa_id=6 AND location_code='SBME' AND active=1 AND deleted_at IS NULL AND operational_class='AERODROME' AND timezone_iana='America/Sao_Paulo' AND weather_source_kind='REDEMET' AND redemet_station_icao='SBME';"
assert_count catalog-helidecks 6 "SELECT COUNT(*) count FROM frms_location_catalog WHERE empresa_id=6 AND active=1 AND deleted_at IS NULL AND location_code IN ('9PGB','9PGS','9PGF','9PHK','9PSS','9PUF') AND operational_class='HELIDECK' AND timezone_iana='America/Sao_Paulo' AND weather_source_kind='NONE' AND redemet_station_icao IS NULL;"
assert_count no-active-target-duplicates 0 "SELECT COUNT(*) count FROM (SELECT location_code FROM frms_location_catalog WHERE empresa_id=6 AND active=1 AND deleted_at IS NULL AND location_code IN ('SBME','9PGB','9PGS','9PGF','9PHK','9PSS','9PUF') GROUP BY location_code HAVING COUNT(*)<>1);"
echo FRMS_REGULATORY_EVIDENCE_LOCATION_CATALOG_0512_PRODUCTION_POSTCONDITIONS=PASS
