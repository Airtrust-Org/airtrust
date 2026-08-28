-- Migration 0475: usuarios_empresas_perfis governance reconciliation
--
-- The multi-profile table `usuarios_empresas_perfis` was first created and
-- populated by the ungoverned migration 0473, which additionally embedded
-- user-specific role grants inside a structural migration. 0473 already ran in
-- production and stays immutable as the historical record of what was applied.
--
-- This reconciliation change is idempotent and safe in both states:
--   * environments where the table does not exist yet (e.g. staging): it
--     creates the table, the lookup index and runs ONLY the generic,
--     deterministic backfill from usuarios_empresas.role;
--   * environments where 0473 already ran (production): CREATE ... IF NOT
--     EXISTS and INSERT OR IGNORE make it a structural no-op that changes no
--     schema and inserts no new rows, while bringing the structure under the
--     governed Schema V2 ledger.
--
-- It contains NO user/email/name-specific DML, NO mass casing normalization,
-- NO DELETE and NO UPDATE of existing profile rows. Any future change to the
-- three pre-existing individual grants is a separate, tenant-scoped, audited
-- administrative operation — never a migration.

CREATE TABLE IF NOT EXISTS usuarios_empresas_perfis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL,
  empresa_id INTEGER NOT NULL,
  perfil TEXT NOT NULL,
  ativo INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(usuario_id, empresa_id, perfil)
);

CREATE INDEX IF NOT EXISTS idx_usuarios_empresas_perfis_lookup
  ON usuarios_empresas_perfis(usuario_id, empresa_id, ativo);

-- Generic, deterministic backfill: adopt the current canonical tenant role from
-- usuarios_empresas as an explicit profile. INSERT OR IGNORE keeps it idempotent
-- against the UNIQUE(usuario_id, empresa_id, perfil) constraint, so a second
-- apply — or an apply against a database where 0473 already backfilled — adds
-- nothing.
INSERT OR IGNORE INTO usuarios_empresas_perfis (usuario_id, empresa_id, perfil, ativo, created_at, updated_at)
SELECT usuario_id, empresa_id, role, 1, datetime('now'), datetime('now')
FROM usuarios_empresas
WHERE role IS NOT NULL AND role != '';
