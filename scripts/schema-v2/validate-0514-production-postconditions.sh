#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db"; BASELINE_ID="production-d1-baseline-v2-20260714"; CHANGE_ID="auth-profile-authority-sync-0514"
target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: 0514 production postconditions refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "POSTCONDITION_OK=$label"; }
assert_count active-baseline 1 "SELECT COUNT(*) count FROM airtrust_schema_baselines_v2 WHERE baseline_id='$BASELINE_ID' AND status='ACTIVE';"
assert_count schema-v2-change 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='$CHANGE_ID';"
assert_count authority-sync-triggers 2 "SELECT COUNT(*) count FROM sqlite_master WHERE type='trigger' AND name IN ('trg_usuarios_empresas_profile_authority_insert','trg_usuarios_empresas_profile_authority_role_update');"
assert_count role-backfill-gaps 0 "SELECT COUNT(*) count FROM usuarios_empresas ue WHERE ue.role IS NOT NULL AND TRIM(ue.role)<>'' AND NOT EXISTS (SELECT 1 FROM usuarios_empresas_perfis p WHERE p.usuario_id=ue.usuario_id AND p.empresa_id=ue.empresa_id AND p.perfil=ue.role);"
assert_count legacy-role-profile-orphans 0 "SELECT COUNT(*) count FROM usuarios_empresas_perfis p WHERE p.perfil IN (SELECT role FROM usuarios_empresas WHERE role IS NOT NULL AND TRIM(role)<>'') AND NOT EXISTS (SELECT 1 FROM usuarios_empresas ue WHERE ue.usuario_id=p.usuario_id AND ue.empresa_id=p.empresa_id);"
echo AUTH_PROFILE_AUTHORITY_SYNC_0514_PRODUCTION_POSTCONDITIONS=PASS
