#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"; target=""
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: staging 0522 preflight refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "PREFLIGHT_OK=$label"; }
assert_count membership-table 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='usuarios_empresas';"
assert_count profile-authority-table 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='usuarios_empresas_perfis';"
assert_count delete-trigger-absent 0 "SELECT COUNT(*) count FROM sqlite_master WHERE type='trigger' AND name='trg_usuarios_empresas_profile_authority_delete';"
gaps="$(query_count "SELECT COUNT(*) count FROM usuarios_empresas ue WHERE ue.role IS NOT NULL AND TRIM(ue.role)<>'' AND NOT EXISTS (SELECT 1 FROM usuarios_empresas_perfis p WHERE p.usuario_id=ue.usuario_id AND p.empresa_id=ue.empresa_id AND p.perfil=ue.role);")"
orphans="$(query_count "SELECT COUNT(*) count FROM usuarios_empresas_perfis p WHERE NOT EXISTS (SELECT 1 FROM usuarios_empresas ue WHERE ue.usuario_id=p.usuario_id AND ue.empresa_id=p.empresa_id);")"
echo "PREFLIGHT_OBSERVED=role-backfill-gaps:$gaps"
echo "PREFLIGHT_OBSERVED=orphan-profile-rows:$orphans"
echo AUTH_PROFILE_ORPHAN_CLEANUP_0522_STAGING_PREFLIGHT=PASS
