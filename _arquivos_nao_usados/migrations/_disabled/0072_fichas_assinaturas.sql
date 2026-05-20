-- Migration: Adicionar campos de assinatura nas fichas
-- Data: 29/10/2025
-- Descrição: Campos para assinatura digital de instrutor e tripulante

-- Adicionar campos de assinatura na tabela fichas_sessao
ALTER TABLE fichas_sessao ADD COLUMN assinatura_instrutor INTEGER DEFAULT 0;
ALTER TABLE fichas_sessao ADD COLUMN assinatura_instrutor_data DATETIME;
ALTER TABLE fichas_sessao ADD COLUMN assinatura_instrutor_usuario_id INTEGER;

ALTER TABLE fichas_sessao ADD COLUMN assinatura_tripulante INTEGER DEFAULT 0;
ALTER TABLE fichas_sessao ADD COLUMN assinatura_tripulante_data DATETIME;
ALTER TABLE fichas_sessao ADD COLUMN assinatura_tripulante_usuario_id INTEGER;

-- Índices para consultas de fichas assinadas
CREATE INDEX IF NOT EXISTS idx_fichas_assinatura_instrutor ON fichas_sessao(assinatura_instrutor);
CREATE INDEX IF NOT EXISTS idx_fichas_assinatura_tripulante ON fichas_sessao(assinatura_tripulante);

-- Comentários (documentação)
-- assinatura_instrutor: 0 = não assinado, 1 = assinado
-- assinatura_instrutor_data: timestamp da assinatura
-- assinatura_instrutor_usuario_id: ID do usuário que assinou
-- assinatura_tripulante: 0 = não assinado, 1 = assinado
-- assinatura_tripulante_data: timestamp da assinatura
-- assinatura_tripulante_usuario_id: ID do usuário que assinou
