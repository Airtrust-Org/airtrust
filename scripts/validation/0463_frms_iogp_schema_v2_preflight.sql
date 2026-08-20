-- Read-only preflight for migration 0463. Run manually against the target
-- SQLite/D1 database before applying the migration; any returned row is a
-- blocker. This file deliberately lives outside migrations/.

-- Required tenant parent table and primary key must exist.
SELECT 'missing empresas(id)' AS blocker
WHERE NOT EXISTS (
  SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'empresas'
)
   OR NOT EXISTS (
  SELECT 1 FROM pragma_table_info('empresas') WHERE name = 'id'
);

-- 0463 is intentionally non-idempotent. Existing objects indicate a partial
-- apply, a collision, or that the migration was already applied.
SELECT '0463 object already exists: ' || name AS blocker
FROM sqlite_master
WHERE name IN (
  'frms_regulatory_profiles',
  'frms_location_catalog',
  'frms_jornada_avaliacoes',
  'idx_frms_reg_profiles_empresa_effective',
  'idx_frms_location_catalog_empresa_code_active',
  'idx_frms_jornada_avaliacoes_empresa_jornada',
  'idx_frms_jornada_avaliacoes_empresa_level',
  'idx_frms_jornada_avaliacoes_input_active'
);

-- Tenant parent data must already satisfy its existing FK graph. 0463 adds
-- tenant-scoped evidence, so do not apply it to a database with unresolved
-- parent integrity violations.
SELECT 'existing foreign-key violation: ' || "table" || ':' || rowid AS blocker
FROM pragma_foreign_key_check;
