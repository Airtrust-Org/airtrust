-- Production Schema V2 change 0475: usuarios_empresas_perfis governance reconciliation.
-- Additive-only, idempotent adoption of a structure that already exists in
-- production (created by the ungoverned migration 0473) into the governed
-- Schema V2 ledger.
--
-- source_reference:
--   worker-airtrust/migrations/0475_usuarios_empresas_perfis_reconciliation.sql
--   worker-airtrust/migrations/0473_usuarios_empresas_perfis.sql (immutable historical apply)
-- operational_decision:
--   Do NOT fabricate a historical ledger row claiming 0473 was applied through
--   Schema V2. Register this new reconciliation change honestly. It only ensures
--   the table, the lookup index and the generic role backfill exist and are
--   idempotent. It carries NO user/email-specific grant, NO casing
--   normalization, NO DELETE and NO UPDATE of existing profile rows. The three
--   pre-existing individual grants in production are left untouched; any future
--   change to them is a separate tenant-scoped audited administrative action.
-- dry_run_required:
--   Official Schema V2 workflow validates hashes, baseline, current schema
--   contract and unapplied change before remote execution.
-- rollback_plan_required:
--   Capture D1 Time Travel recovery point before apply. Runtime already depends
--   on this additive structure; there is nothing to drop as an automatic
--   rollback. Destructive removal is a separate governed data action.

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

INSERT OR IGNORE INTO usuarios_empresas_perfis (usuario_id, empresa_id, perfil, ativo, created_at, updated_at)
SELECT usuario_id, empresa_id, role, 1, datetime('now'), datetime('now')
FROM usuarios_empresas
WHERE role IS NOT NULL AND role != '';
