#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"; BLOCKED_PRODUCTION_DB_NAME="airtrust-db"; TARGET_REV="frms-empresa6-helicopter-offshore-v2-history-0499"
target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" && "$target" != "$BLOCKED_PRODUCTION_DB_NAME" ]] || { echo "ERROR: staging 0499 validator refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "POSTCONDITION_OK=$label"; }
assert_positive(){ local label="$1" sql="$2" count; count="$(query_count "$sql")"; [[ "$count" -ge 1 ]] || { echo "ERROR: $label expected>=1 found=$count" >&2; exit 1; }; echo "POSTCONDITION_OK=$label:$count"; }
assert_count tenant-v2-revision 1 "SELECT COUNT(*) count FROM frms_config_revisions WHERE id='$TARGET_REV' AND empresa_id=6 AND status='ACTIVE' AND effective_from='2026-01-01';"
assert_positive tenant-v2-parameters "SELECT COUNT(*) count FROM frms_config_parameters WHERE revision_id='$TARGET_REV';"
assert_count critical-v2-drift 0 "SELECT COUNT(*) count FROM frms_config_revisions r WHERE r.id='$TARGET_REV' AND (NOT EXISTS (SELECT 1 FROM frms_config_parameters p WHERE p.revision_id=r.id AND p.parameter_key='FRMS_V2_ENABLED' AND p.numeric_value=1) OR NOT EXISTS (SELECT 1 FROM frms_config_parameters p WHERE p.revision_id=r.id AND p.parameter_key='LANDINGS_NEUTRAL_MAX' AND p.numeric_value=8));"
assert_count governed-recalc-run 1 "SELECT COUNT(*) count FROM frms_recalc_runs WHERE id='frms-recalc-empresa6-v2-history-2026-0499' AND status='PENDING';"
echo FRMS_V2_HISTORICAL_BACKFILL_0499_STAGING_POSTCONDITIONS=PASS
