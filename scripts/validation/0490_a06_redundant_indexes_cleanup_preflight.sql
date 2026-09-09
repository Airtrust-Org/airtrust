-- PREFLIGHT A-06: 0490_a06_redundant_indexes_cleanup.sql
-- Provas read-only de que os indices a serem mantidos e removidos coexistem no schema final.

SELECT tbl_name, name, sql
FROM sqlite_master
WHERE type='index' AND name IN (
  'idx_fichas_instrutor', 'idx_fichas_sessao_instrutor',
  'idx_fichas_sessao_empresa_id', 'idx_fichas_sessao_empresa',
  'idx_modelos_codigo', 'idx_modelos_sessao_codigo',
  'idx_modelos_deleted', 'idx_modelos_sessao_deleted'
) ORDER BY tbl_name, sql;
