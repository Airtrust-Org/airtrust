#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db"; BASELINE_ID="production-d1-baseline-v2-20260714"; CHANGE_ID="frms-regulatory-evidence-location-catalog-0512"
target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: 0512 production preflight refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "PREFLIGHT_OK=$label"; }
assert_count active-baseline 1 "SELECT COUNT(*) count FROM airtrust_schema_baselines_v2 WHERE baseline_id='$BASELINE_ID' AND status='ACTIVE';"
assert_count unapplied-change 0 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='$CHANGE_ID';"
assert_count profile-prestate 1 "SELECT COUNT(*) count FROM frms_regulatory_profiles WHERE id='frms-regulatory-profile-6-helicopter-offshore-v1' AND empresa_id=6 AND profile_code='HELICOPTER_OFFSHORE' AND active=1 AND deleted_at IS NULL AND approval_reference='FRMS_HELICOPTER_OFFSHORE_BASELINE_V1' AND limits_json IS NULL AND source_document_hash IS NULL;"
assert_count catalog-targets-absent 0 "SELECT COUNT(*) count FROM frms_location_catalog WHERE empresa_id=6 AND active=1 AND deleted_at IS NULL AND location_code IN ('SBME','9PGB','9PGS','9PGF','9PHK','9PSS','9PUF');"
assert_count source-location-codes 7 "SELECT COUNT(DISTINCT codigo_icao) count FROM cv_pontos_navegacao WHERE empresa_id=6 AND deleted_at IS NULL AND ativo=1 AND coordenada_valida=1 AND codigo_icao IN ('SBME','9PGB','9PGS','9PGF','9PHK','9PSS','9PUF');"
assert_count location-index 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='index' AND name='idx_frms_location_catalog_empresa_code_active';"
echo FRMS_REGULATORY_EVIDENCE_LOCATION_CATALOG_0512_PRODUCTION_PREFLIGHT=PASS
