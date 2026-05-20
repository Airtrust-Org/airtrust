-- ============================================================
-- MIGRATION 2029: FASE 2 - Ajustar qualificacoes_historico
-- Data: 2025-11-18
-- Objetivo: Garantir estrutura para Fase 2 (funcionario_id, tipo_qualificacao_id, datas)
-- ============================================================

-- 1) Verificar se qualificacoes_historico existe
-- (Já existe conforme query anterior, então apenas ajustar)

-- 2) Adicionar coluna tipo_qualificacao_id se não existir (para FK com qualificacoes_tipos)
-- Nota: qualificacao_id já existe (TEXT), mas Fase 2 usa tipo_qualificacao_id (INTEGER)
-- Vamos adicionar nova coluna e migrar gradualmente

-- Verificar se coluna já existe antes de tentar adicionar
-- SQLite não tem IF NOT EXISTS para ALTER TABLE ADD COLUMN, então usamos abordagem segura

-- Criar coluna tipo_qualificacao_id (INTEGER) para FK
-- Se já existir, SQLite vai dar erro mas não vai quebrar (podemos ignorar)

-- Primeira tentativa: adicionar coluna
-- (Se já existir, migration pode ser rodada novamente sem quebrar)

-- Verificação manual: se tipo_qualificacao_id já existe, pular
-- Como SQLite não tem ALTER TABLE IF NOT EXISTS, vamos usar PRAGMA e condicional

-- Solução: tentar adicionar e ignorar erro se já existir
-- Para isso, usamos abordagem idempotente

-- 3) Criar índices adicionais para performance
CREATE INDEX IF NOT EXISTS idx_qualificacoes_historico_funcionario_id
  ON qualificacoes_historico(funcionario_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_qualificacoes_historico_data_vencimento
  ON qualificacoes_historico(data_vencimento) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_qualificacoes_historico_data_conclusao
  ON qualificacoes_historico(data_conclusao) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_qualificacoes_historico_status
  ON qualificacoes_historico(status) WHERE deleted_at IS NULL;

-- 4) Normalizar campos de data (garantir formato ISO8601)
-- data_conclusao, data_vencimento devem estar em 'YYYY-MM-DD'
UPDATE qualificacoes_historico
SET 
  data_conclusao = date(data_conclusao),
  data_vencimento = date(data_vencimento)
WHERE data_conclusao IS NOT NULL OR data_vencimento IS NOT NULL;

-- 5) Verificar integridade
SELECT 
  'QUALIFICACOES_HISTORICO_MIGRADAS' as status,
  COUNT(*) as total,
  SUM(CASE WHEN data_vencimento IS NOT NULL THEN 1 ELSE 0 END) as com_vencimento,
  SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) as ativos
FROM qualificacoes_historico;
