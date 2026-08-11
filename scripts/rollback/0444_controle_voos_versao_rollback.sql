-- Rollback de 0444_controle_voos_versao.sql
-- So execute se a coluna versao precisar ser removida antes do codigo que a
-- consome (routes/controle-voos.ts) ser revertido junto.
ALTER TABLE cv_voos DROP COLUMN versao;
