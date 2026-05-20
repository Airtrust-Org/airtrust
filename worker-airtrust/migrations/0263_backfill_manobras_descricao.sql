-- Migração 0263: Backfill descricao a partir de nome para manobras sem descricao
-- As manobras S76-* foram inseridas apenas com nome (descricao = NULL).
-- Este script copia nome → descricao para todos os registros afetados.

UPDATE manobras
SET descricao = nome
WHERE descricao IS NULL
  AND nome IS NOT NULL
  AND deleted_at IS NULL;
