#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db"; BASELINE_ID="production-d1-baseline-v2-20260714"; CHANGE_ID="auth-profile-authority-sync-0514"
target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: 0514 production preflight refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "PREFLIGHT_OK=$label"; }
assert_count active-baseline 1 "SELECT COUNT(*) count FROM airtrust_schema_baselines_v2 WHERE baseline_id='$BASELINE_ID' AND status='ACTIVE';"
assert_count unapplied-change 0 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='$CHANGE_ID';"
assert_count membership-table 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='usuarios_empresas';"
assert_count profile-authority-table 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='usuarios_empresas_perfis';"
assert_count reconciliation-0475-applied 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='usuarios-empresas-perfis-reconciliation-0475';"
unique_sql="$(cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "SELECT sql FROM sqlite_master WHERE type='table' AND name='usuarios_empresas_perfis' LIMIT 1;")"
printf '%s' "$unique_sql" | grep -Eiq 'UNIQUE[[:space:]]*\([[:space:]]*usuario_id[[:space:]]*,[[:space:]]*empresa_id[[:space:]]*,[[:space:]]*perfil[[:space:]]*\)' || { echo 'ERROR: profile authority unique constraint missing' >&2; exit 1; }
assert_count insert-trigger-absent 0 "SELECT COUNT(*) count FROM sqlite_master WHERE type='trigger' AND name='trg_usuarios_empresas_profile_authority_insert';"
assert_count update-trigger-absent 0 "SELECT COUNT(*) count FROM sqlite_master WHERE type='trigger' AND name='trg_usuarios_empresas_profile_authority_role_update';"
echo AUTH_PROFILE_AUTHORITY_SYNC_0514_PRODUCTION_PREFLIGHT=PASS
