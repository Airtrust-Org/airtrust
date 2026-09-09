-- PREFLIGHT A-06: 0490_a06_redundant_indexes_cleanup.sql
-- Provas read-only de que os indices a serem mantidos e removidos sao perfeitamente equivalentes.

-- 1. Comparar as definicoes dos indices na base atual para garantir equivalencia exata
SELECT tbl_name, name, sql
FROM sqlite_master
WHERE type='index' AND name IN (
  'idx_qualificacoes_tipos_ativo', 'idx_qual_tipos_ativo',
  'idx_fichas_empresa', 'idx_fichas_sessao_empresa'
) ORDER BY tbl_name, sql;
