-- =====================================================
-- Migration 0202: Remove Duplicates & Prevent Future
-- Data: 2026-02-05
-- Objetivo: Limpar duplicatas + constraint UNIQUE
-- =====================================================

-- STEP 1: Identificar e deletar duplicatas (mantém o mais antigo)
-- Estratégia: Para cada grupo de duplicatas, manter apenas o ID mais baixo (mais antigo)

-- 1.1: Soft delete de duplicatas
UPDATE qualificacoes_historico
SET deleted_at = datetime('now'),
    updated_at = datetime('now')
WHERE id IN (
  SELECT qh2.id
  FROM qualificacoes_historico qh1
  INNER JOIN qualificacoes_historico qh2 
    ON qh1.funcionario_id = qh2.funcionario_id
    AND qh1.qualificacao_codigo = qh2.qualificacao_codigo
    AND qh1.data_conclusao = qh2.data_conclusao
    AND qh1.id < qh2.id  -- manter apenas o mais antigo (ID menor)
  WHERE qh1.deleted_at IS NULL
    AND qh2.deleted_at IS NULL
);

-- STEP 2: Criar índice UNIQUE para prevenir duplicatas futuras
-- Nota: SQLite não suporta UNIQUE com WHERE clause em CREATE INDEX,
-- então usamos um UNIQUE INDEX parcial via trigger

CREATE UNIQUE INDEX IF NOT EXISTS idx_qualificacoes_historico_unique_active
ON qualificacoes_historico(funcionario_id, qualificacao_codigo, data_conclusao)
WHERE deleted_at IS NULL;

-- STEP 3: Marcar eventos EdApp como processados para evitar reimportação
-- Apenas eventos que já criaram registros duplicados

UPDATE integracoes_edapp_eventos
SET processado = 1,
    updated_at = datetime('now')
WHERE processado = 0
  AND qualificacao_historico_id IS NOT NULL;

-- STEP 4: Log de quantos registros foram deletados (para auditoria)
-- Não é possível fazer SELECT após UPDATE em migration, mas o resultado
-- será visível no meta.changes do Wrangler

-- VERIFICAÇÃO FINAL (comentado - apenas para referência):
-- SELECT COUNT(*) as duplicatas_restantes 
-- FROM qualificacoes_historico qh1
-- INNER JOIN qualificacoes_historico qh2 
--   ON qh1.funcionario_id = qh2.funcionario_id
--   AND qh1.qualificacao_codigo = qh2.qualificacao_codigo
--   AND qh1.data_conclusao = qh2.data_conclusao
--   AND qh1.id < qh2.id
-- WHERE qh1.deleted_at IS NULL AND qh2.deleted_at IS NULL;
-- Resultado esperado: 0
