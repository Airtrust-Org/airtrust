-- Read-only postconditions for migration 0463. Run manually after applying
-- 0463; any returned row is a failed invariant.

WITH expected(name) AS (
  VALUES
    ('frms_regulatory_profiles'),
    ('frms_location_catalog'),
    ('frms_jornada_avaliacoes')
)
SELECT 'missing table: ' || expected.name AS failure
FROM expected
LEFT JOIN sqlite_master ON sqlite_master.type = 'table' AND sqlite_master.name = expected.name
WHERE sqlite_master.name IS NULL;

WITH expected(name) AS (
  VALUES
    ('idx_frms_reg_profiles_empresa_effective'),
    ('idx_frms_location_catalog_empresa_code_active'),
    ('idx_frms_jornada_avaliacoes_empresa_jornada'),
    ('idx_frms_jornada_avaliacoes_empresa_level'),
    ('idx_frms_jornada_avaliacoes_input_active')
)
SELECT 'missing index: ' || expected.name AS failure
FROM expected
LEFT JOIN sqlite_master ON sqlite_master.type = 'index' AND sqlite_master.name = expected.name
WHERE sqlite_master.name IS NULL;

SELECT 'frms_regulatory_profiles.empresa_id is not NOT NULL' AS failure
WHERE NOT EXISTS (SELECT 1 FROM pragma_table_info('frms_regulatory_profiles') WHERE name = 'empresa_id' AND "notnull" = 1);
SELECT 'frms_location_catalog.empresa_id is not NOT NULL' AS failure
WHERE NOT EXISTS (SELECT 1 FROM pragma_table_info('frms_location_catalog') WHERE name = 'empresa_id' AND "notnull" = 1);
SELECT 'frms_jornada_avaliacoes.empresa_id is not NOT NULL' AS failure
WHERE NOT EXISTS (SELECT 1 FROM pragma_table_info('frms_jornada_avaliacoes') WHERE name = 'empresa_id' AND "notnull" = 1);

WITH expected(name) AS (
  VALUES ('jornada_id'), ('evaluation_version'), ('input_fingerprint'),
         ('compliance_json'), ('operational_demand_json'), ('environmental_json'),
         ('overall_level'), ('automatic_approval_allowed'), ('calculated_at')
)
SELECT 'frms_jornada_avaliacoes missing required column: ' || expected.name AS failure
FROM expected
WHERE NOT EXISTS (SELECT 1 FROM pragma_table_info('frms_jornada_avaliacoes') WHERE name = expected.name);

SELECT 'missing tenant FK: frms_regulatory_profiles' AS failure
WHERE NOT EXISTS (
  SELECT 1 FROM pragma_foreign_key_list('frms_regulatory_profiles')
  WHERE "table" = 'empresas' AND "from" = 'empresa_id' AND "to" = 'id'
);
SELECT 'missing tenant FK: frms_location_catalog' AS failure
WHERE NOT EXISTS (
  SELECT 1 FROM pragma_foreign_key_list('frms_location_catalog')
  WHERE "table" = 'empresas' AND "from" = 'empresa_id' AND "to" = 'id'
);
SELECT 'missing tenant FK: frms_jornada_avaliacoes' AS failure
WHERE NOT EXISTS (
  SELECT 1 FROM pragma_foreign_key_list('frms_jornada_avaliacoes')
  WHERE "table" = 'empresas' AND "from" = 'empresa_id' AND "to" = 'id'
);

SELECT 'foreign-key violation: ' || "table" || ':' || rowid AS failure
FROM pragma_foreign_key_check;
