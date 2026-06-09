-- Reconcile production d1_migrations after Wave 4 migration (0402) was
-- applied via direct d1 execute --file to work around D1's transactional
-- wrapper limitations with table-rebuild + trigger dependencies.
--
-- Safety model:
--   - Only records 0402 if all Wave 4 schema shapes are already present.
--   - Checks empresa_id NOT NULL + no DEFAULT on the hardened tables.
--   - Idempotent: skips if 0402 is already in the ledger.

INSERT INTO d1_migrations (name, applied_at)
SELECT '0402_harden_empresa_id_wave4.sql', datetime('now')
WHERE NOT EXISTS (
  SELECT 1 FROM d1_migrations WHERE name = '0402_harden_empresa_id_wave4.sql'
)
AND EXISTS (
  SELECT 1 FROM pragma_table_info('importacoes_log')
  WHERE name = 'empresa_id' AND "notnull" = 1 AND dflt_value IS NULL
)
AND EXISTS (
  SELECT 1 FROM pragma_table_info('qualificacoes_tipos')
  WHERE name = 'empresa_id' AND "notnull" = 1 AND dflt_value IS NULL
)
AND NOT EXISTS (
  SELECT 1 FROM qualificacoes_tipos WHERE empresa_id = 1
)
AND EXISTS (
  SELECT 1 FROM pragma_table_info('sgso_spi_config')
  WHERE name = 'empresa_id' AND "notnull" = 1 AND dflt_value IS NULL
)
AND EXISTS (
  SELECT 1 FROM sqlite_master WHERE type = 'trigger'
  AND name = 'trg_qualificacoes_historico_set_tipo'
)
AND EXISTS (
  SELECT 1 FROM sqlite_master WHERE type = 'view'
  AND name = 'qualificacoes_historico_v'
);
