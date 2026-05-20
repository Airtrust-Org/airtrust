-- =============================================
-- MIGRATION: Adicionar campo vencimento_fim_mes
-- Data: 27/11/2025
-- Descrição: Controla se vencimento é no dia exato ou fim do mês
-- =============================================

-- Adicionar coluna vencimento_fim_mes
-- 0 = Vence no dia exato (ex: 15/01/2026)
-- 1 = Vence no fim do mês (ex: 31/01/2026)
ALTER TABLE qualificacoes_tipos 
ADD COLUMN vencimento_fim_mes INTEGER DEFAULT 0 NOT NULL 
CHECK(vencimento_fim_mes IN (0, 1));

-- Criar índice para consultas
CREATE INDEX IF NOT EXISTS idx_qualificacoes_tipos_vencimento_fim_mes 
ON qualificacoes_tipos(vencimento_fim_mes);
