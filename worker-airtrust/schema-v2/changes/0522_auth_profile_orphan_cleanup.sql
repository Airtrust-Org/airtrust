-- 0522_auth_profile_orphan_cleanup.sql
-- source_reference: production release preflight run 36786155458 detected explicit profile rows whose tenant membership no longer exists.
-- operational_decision: explicit tenant profiles must mirror an existing tenant membership; preserve valid multi-profile grants and enforce the invariant at the database boundary.
-- dry_run_required: true
-- rollback_plan_required: worker-airtrust/schema-v2/plans/auth-profile-orphan-cleanup-0522.md

-- Reassert the 0514 compatibility-role invariant. This is idempotent in production
-- and gives staging the same authority behavior even though 0514 was a production
-- Schema V2-only change rather than a canonical staging migration.
INSERT OR IGNORE INTO usuarios_empresas_perfis (
  usuario_id, empresa_id, perfil, ativo, created_at, updated_at
)
SELECT usuario_id, empresa_id, role, 1, datetime('now'), datetime('now')
  FROM usuarios_empresas
 WHERE role IS NOT NULL
   AND TRIM(role) <> '';

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

DELETE FROM usuarios_empresas_perfis
 WHERE NOT EXISTS (
   SELECT 1
     FROM usuarios_empresas ue
    WHERE ue.usuario_id = usuarios_empresas_perfis.usuario_id
      AND ue.empresa_id = usuarios_empresas_perfis.empresa_id
 );

CREATE TRIGGER IF NOT EXISTS trg_usuarios_empresas_profile_authority_delete
AFTER DELETE ON usuarios_empresas
FOR EACH ROW
BEGIN
  DELETE FROM usuarios_empresas_perfis
   WHERE usuario_id = OLD.usuario_id
     AND empresa_id = OLD.empresa_id;
END;
