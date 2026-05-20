-- ==========================================
-- MIGRATION 0141: Extend fichas_sessao - adicionar colunas faltantes
-- Data: 2025-11-30
-- Objetivo: Adicionar colunas faltantes para compatibilidade com endpoints
-- Nota: Tabela já tem: colaborador_id_aluno, instrutor_id, agendamento_slot_id, aprovado, resultado_final, nota_final
-- ==========================================

-- Adicionar colunas de contexto da sessão
ALTER TABLE fichas_sessao ADD COLUMN tipo_sessao TEXT;
ALTER TABLE fichas_sessao ADD COLUMN tipo_aeronave TEXT;
ALTER TABLE fichas_sessao ADD COLUMN data_sessao TEXT;

-- Adicionar colunas de assinatura digital com IP (ALUNO)
ALTER TABLE fichas_sessao ADD COLUMN assinatura_aluno_ip TEXT;
ALTER TABLE fichas_sessao ADD COLUMN assinatura_aluno_timestamp TEXT;

-- Adicionar colunas de assinatura digital com IP (INSTRUTOR)
ALTER TABLE fichas_sessao ADD COLUMN assinatura_instrutor_ip TEXT;
ALTER TABLE fichas_sessao ADD COLUMN assinatura_instrutor_timestamp TEXT;

-- Migrar dados de data_conclusao para data_sessao onde data_sessao é NULL
UPDATE fichas_sessao 
SET data_sessao = COALESCE(data_conclusao, created_at)
WHERE data_sessao IS NULL;

-- Criar indexes para performance
CREATE INDEX IF NOT EXISTS idx_fichas_sessao_tipo ON fichas_sessao(tipo_sessao);
CREATE INDEX IF NOT EXISTS idx_fichas_sessao_data_sessao ON fichas_sessao(data_sessao);

