-- Reconcile production d1_migrations after Wave 3 schema needed direct
-- file execution outside wrangler's transactional wrapper because the
-- wrapper kept foreign key enforcement active around rebuild steps.
--
-- Safety model:
-- - Only records 0399 if all Wave 3 schema shapes are already present.
-- - The wrangler migration runner records 0400 itself after successful apply.

INSERT INTO d1_migrations (name, applied_at)
SELECT '0399_harden_empresa_id_wave3.sql', datetime('now')
WHERE NOT EXISTS (
  SELECT 1 FROM d1_migrations WHERE name = '0399_harden_empresa_id_wave3.sql'
)
AND EXISTS (
  SELECT 1
  FROM pragma_table_info('documentos')
  WHERE name = 'empresa_id' AND "notnull" = 1 AND dflt_value IS NULL
)
AND EXISTS (
  SELECT 1
  FROM pragma_table_info('pasta_virtual')
  WHERE name = 'empresa_id' AND "notnull" = 1 AND dflt_value IS NULL
)
AND EXISTS (
  SELECT 1
  FROM pragma_table_info('tipos_sessao')
  WHERE name = 'empresa_id' AND "notnull" = 1 AND dflt_value IS NULL
)
AND EXISTS (
  SELECT 1
  FROM pragma_table_info('setores')
  WHERE name = 'empresa_id' AND "notnull" = 1 AND dflt_value IS NULL
)
AND EXISTS (
  SELECT 1
  FROM pragma_table_info('funcoes')
  WHERE name = 'empresa_id' AND "notnull" = 1 AND dflt_value IS NULL
)
AND EXISTS (
  SELECT 1
  FROM pragma_table_info('arquivos')
  WHERE name = 'empresa_id' AND "notnull" = 1 AND dflt_value IS NULL
);
