
-- Remover colunas de armazenamento BASE64
ALTER TABLE certificado_anexos_v2 DROP COLUMN content_type;
ALTER TABLE certificado_anexos_v2 DROP COLUMN arquivo_data;
