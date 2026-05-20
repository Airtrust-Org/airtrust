
-- Remover índices criados
DROP INDEX IF EXISTS idx_auditoria_manobras_ficha;
DROP INDEX IF EXISTS idx_fichas_manobras_ficha_id;
DROP INDEX IF EXISTS idx_fichas_manobras_catalogo_id;

-- Remover tabela de auditoria
DROP TABLE IF EXISTS auditoria_manobras;
