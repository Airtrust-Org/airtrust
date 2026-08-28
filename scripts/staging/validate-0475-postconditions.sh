#!/usr/bin/env bash
# Read-only staging proof for the 0475 usuarios_empresas_perfis governance
# reconciliation. Additive-only: table + lookup index + generic role backfill.
# No user-specific grant, no casing normalization, no destructive change.
set -euo pipefail
DB='airtrust-db-staging-baseline-20260701'
[[ "${1:-}" == "--target=$DB" ]] || { echo 'ERROR: staging target required' >&2; exit 1; }

scalar() {
  (cd worker-airtrust && npx wrangler d1 execute "$DB" --remote --json --command "$1") \
    | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>process.stdout.write(String(JSON.parse(d)[0]?.results?.[0]?.n ?? 0)))'
}

# table exists with the UNIQUE(usuario_id, empresa_id, perfil) constraint
test "$(scalar "SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name='usuarios_empresas_perfis' AND sql LIKE '%UNIQUE(usuario_id, empresa_id, perfil)%'")" = 1

# lookup index exists
test "$(scalar "SELECT COUNT(*) n FROM sqlite_master WHERE type='index' AND name='idx_usuarios_empresas_perfis_lookup'")" = 1

# generic backfill is complete: every usuarios_empresas row with a non-empty role
# has a matching (usuario_id, empresa_id, perfil) profile row
test "$(scalar "SELECT COUNT(*) n FROM usuarios_empresas ue WHERE ue.role IS NOT NULL AND ue.role <> '' AND NOT EXISTS (SELECT 1 FROM usuarios_empresas_perfis p WHERE p.usuario_id = ue.usuario_id AND p.empresa_id = ue.empresa_id AND p.perfil = ue.role)")" = 0

# no backfilled profile row crosses tenants relative to its source usuarios_empresas row
test "$(scalar "SELECT COUNT(*) n FROM usuarios_empresas_perfis p WHERE p.perfil IN (SELECT role FROM usuarios_empresas WHERE role IS NOT NULL AND role <> '') AND NOT EXISTS (SELECT 1 FROM usuarios_empresas ue WHERE ue.usuario_id = p.usuario_id AND ue.empresa_id = p.empresa_id)")" = 0

echo POSTCONDITIONS_OK
