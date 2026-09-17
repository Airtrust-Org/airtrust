#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db"; BASELINE_ID="production-d1-baseline-v2-20260714"; CHANGE_ID="frms-v2-historical-backfill-0499"; TARGET_REV="frms-empresa6-helicopter-offshore-v2-history-0499"
target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: 0499 production postconditions refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "POSTCONDITION_OK=$label"; }
assert_positive(){ local label="$1" sql="$2" count; count="$(query_count "$sql")"; [[ "$count" -ge 1 ]] || { echo "ERROR: $label expected>=1 found=$count" >&2; exit 1; }; echo "POSTCONDITION_OK=$label:$count"; }
assert_count active-baseline 1 "SELECT COUNT(*) count FROM airtrust_schema_baselines_v2 WHERE baseline_id='$BASELINE_ID' AND status='ACTIVE';"
assert_count schema-v2-change 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='$CHANGE_ID';"
assert_count tenant-v2-revision 1 "SELECT COUNT(*) count FROM frms_config_revisions WHERE id='$TARGET_REV' AND empresa_id=6 AND profile_code='HELICOPTER_OFFSHORE' AND status='ACTIVE' AND policy_version='FRMS_OPERATIONAL_POLICY_V2' AND effective_from='2026-01-01' AND effective_to IS NULL;"
assert_positive tenant-v2-parameters "SELECT COUNT(*) count FROM frms_config_parameters WHERE revision_id='$TARGET_REV';"
assert_count parameter-count-drift 0 "SELECT COUNT(*) count FROM (SELECT (SELECT COUNT(*) FROM frms_config_parameters WHERE revision_id='$TARGET_REV') tenant_count,(SELECT COUNT(*) FROM frms_config_parameters p JOIN frms_config_revisions r ON r.id=p.revision_id WHERE r.empresa_id IS NULL AND r.profile_code='HELICOPTER_OFFSHORE' AND r.status='ACTIVE' AND r.policy_version='FRMS_OPERATIONAL_POLICY_V2') source_count) x WHERE tenant_count<>source_count;"
assert_count parameter-value-drift 0 "SELECT COUNT(*) count FROM frms_config_parameters t JOIN frms_config_revisions srev ON srev.empresa_id IS NULL AND srev.profile_code='HELICOPTER_OFFSHORE' AND srev.status='ACTIVE' AND srev.policy_version='FRMS_OPERATIONAL_POLICY_V2' JOIN frms_config_parameters s ON s.revision_id=srev.id AND s.parameter_key=t.parameter_key WHERE t.revision_id='$TARGET_REV' AND (COALESCE(t.numeric_value,-999999)<>COALESCE(s.numeric_value,-999999) OR COALESCE(t.json_value,'')<>COALESCE(s.json_value,'') OR COALESCE(t.unit,'')<>COALESCE(s.unit,''));"
assert_count critical-v2-drift 0 "SELECT COUNT(*) count FROM frms_config_revisions r WHERE r.id='$TARGET_REV' AND (NOT EXISTS (SELECT 1 FROM frms_config_parameters p WHERE p.revision_id=r.id AND p.parameter_key='FRMS_V2_ENABLED' AND p.numeric_value=1) OR NOT EXISTS (SELECT 1 FROM frms_config_parameters p WHERE p.revision_id=r.id AND p.parameter_key='LANDINGS_NEUTRAL_MAX' AND p.numeric_value=8) OR NOT EXISTS (SELECT 1 FROM frms_config_parameters p WHERE p.revision_id=r.id AND p.parameter_key='ACCUMULATION_USE_YEAR_CALENDAR' AND p.numeric_value=1));"
assert_count governed-recalc-run 1 "SELECT COUNT(*) count FROM frms_recalc_runs WHERE id='frms-recalc-empresa6-v2-history-2026-0499' AND empresa_id=6 AND target_revision_id='$TARGET_REV' AND effective_from='2026-01-01' AND effective_to='2026-09-16' AND status='PENDING';"
echo FRMS_V2_HISTORICAL_BACKFILL_0499_PRODUCTION_POSTCONDITIONS=PASS
