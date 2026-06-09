-- Reconcile production d1_migrations after Wave 1 schema already existed
-- and Wave 2 needed direct file execution outside wrangler's transactional
-- migration wrapper so the rebuild script could run with foreign key enforcement disabled.
--
-- Safety model:
-- - Only records 0396 if Wave 1 schema shape is already present.
-- - Only records 0397 if Wave 2 schema shape is already present.
-- - The wrangler migration runner records 0398 itself after successful apply.

INSERT INTO d1_migrations (name, applied_at)
SELECT '0396_harden_empresa_id_wave1.sql', datetime('now')
WHERE NOT EXISTS (
  SELECT 1 FROM d1_migrations WHERE name = '0396_harden_empresa_id_wave1.sql'
)
AND EXISTS (
  SELECT 1
  FROM pragma_table_info('aeronaves')
  WHERE name = 'empresa_id' AND "notnull" = 1 AND dflt_value IS NULL
)
AND EXISTS (
  SELECT 1
  FROM pragma_table_info('modelos_sessao')
  WHERE name = 'empresa_id' AND "notnull" = 1 AND dflt_value IS NULL
)
AND EXISTS (
  SELECT 1
  FROM pragma_table_info('funcionarios')
  WHERE name = 'empresa_id' AND "notnull" = 1 AND dflt_value IS NULL
);

INSERT INTO d1_migrations (name, applied_at)
SELECT '0397_harden_empresa_id_wave2.sql', datetime('now')
WHERE NOT EXISTS (
  SELECT 1 FROM d1_migrations WHERE name = '0397_harden_empresa_id_wave2.sql'
)
AND EXISTS (
  SELECT 1
  FROM pragma_table_info('qualificacoes_historico')
  WHERE name = 'empresa_id' AND "notnull" = 1 AND dflt_value IS NULL
)
AND EXISTS (
  SELECT 1
  FROM pragma_table_info('fichas_sessao')
  WHERE name = 'empresa_id' AND "notnull" = 1 AND dflt_value IS NULL
)
AND EXISTS (
  SELECT 1
  FROM pragma_table_info('certificados')
  WHERE name = 'empresa_id' AND "notnull" = 1 AND dflt_value IS NULL
);

