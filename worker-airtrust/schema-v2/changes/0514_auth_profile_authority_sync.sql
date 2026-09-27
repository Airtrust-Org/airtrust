-- 0514_auth_profile_authority_sync.sql
-- Keeps the legacy tenant role represented in the explicit multi-profile authority.
-- source_reference: production release preflight 2026-09-27 detected one post-0475 usuarios_empresas role without matching usuarios_empresas_perfis row.
-- operational_decision: preserve multi-profile semantics; only guarantee that the already-authoritative legacy role has an explicit profile row. Never delete or invent additional roles.
-- dry_run_required: true
-- rollback_plan_required: worker-airtrust/schema-v2/plans/auth-profile-authority-sync-0514.md

-- Reconcile any role rows created after governed reconciliation 0475.
INSERT OR IGNORE INTO usuarios_empresas_perfis (
  usuario_id, empresa_id, perfil, ativo, created_at, updated_at
)
SELECT usuario_id, empresa_id, role, 1, datetime('now'), datetime('now')
  FROM usuarios_empresas
 WHERE role IS NOT NULL
   AND TRIM(role) <> '';

-- New tenant membership: mirror only the role already present on usuarios_empresas.
CREATE TRIGGER IF NOT EXISTS trg_usuarios_empresas_profile_authority_insert
AFTER INSERT ON usuarios_empresas
FOR EACH ROW
WHEN NEW.role IS NOT NULL AND TRIM(NEW.role) <> ''
BEGIN
  INSERT OR IGNORE INTO usuarios_empresas_perfis (
    usuario_id, empresa_id, perfil, ativo, created_at, updated_at
  ) VALUES (
    NEW.usuario_id, NEW.empresa_id, NEW.role, 1, datetime('now'), datetime('now')
  );
END;

-- A legacy/default role change must also exist in the explicit profile authority.
-- Existing additional profiles are intentionally preserved: usuarios_empresas_perfis
-- is multi-profile authority, while usuarios_empresas.role is the compatibility/default role.
CREATE TRIGGER IF NOT EXISTS trg_usuarios_empresas_profile_authority_role_update
AFTER UPDATE OF role ON usuarios_empresas
FOR EACH ROW
WHEN NEW.role IS NOT NULL AND TRIM(NEW.role) <> ''
BEGIN
  INSERT OR IGNORE INTO usuarios_empresas_perfis (
    usuario_id, empresa_id, perfil, ativo, created_at, updated_at
  ) VALUES (
    NEW.usuario_id, NEW.empresa_id, NEW.role, 1, datetime('now'), datetime('now')
  );
END;
