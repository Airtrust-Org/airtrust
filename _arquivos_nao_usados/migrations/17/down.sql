
-- Reverter mudanças
ALTER TABLE certificado_anexos_v2 DROP COLUMN arquivo_github_url;
ALTER TABLE certificado_anexos_v2 ADD COLUMN arquivo_data TEXT;
ALTER TABLE certificado_anexos_v2 ADD COLUMN content_type TEXT DEFAULT 'application/pdf';
