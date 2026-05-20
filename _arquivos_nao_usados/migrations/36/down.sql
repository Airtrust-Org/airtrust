
-- Remover índices
DROP INDEX IF EXISTS idx_notificacoes_email_enviado;
DROP INDEX IF EXISTS idx_notificacoes_email_ficha_uuid;
DROP INDEX IF EXISTS idx_fichas_assinaturas_protocolo;
DROP INDEX IF EXISTS idx_fichas_assinaturas_ficha_id;

-- Remover tabelas
DROP TABLE IF EXISTS notificacoes_email;
DROP TABLE IF EXISTS fichas_assinaturas;
