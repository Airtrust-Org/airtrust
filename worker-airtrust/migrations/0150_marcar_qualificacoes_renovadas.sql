-- Migration 0150: Marcar qualificações renovadas e criar trigger automático
-- Data: 02/12/2025
-- Objetivo: Identificar qualificações que foram renovadas antes de vencer

-- =============================
-- 1. MARCAR RENOVADAS EXISTENTES
-- =============================

-- Marcar como renovada=1 todas as qualificações que foram obtidas
-- ANTES da qualificação anterior do mesmo tipo vencer
UPDATE qualificacoes_historico
SET renovada = 1
WHERE id IN (
  SELECT qh.id
  FROM qualificacoes_historico qh
  WHERE EXISTS (
    SELECT 1
    FROM qualificacoes_historico qh_anterior
    WHERE qh_anterior.funcionario_cpf = qh.funcionario_cpf
      AND qh_anterior.qualificacao_codigo = qh.qualificacao_codigo
      AND qh_anterior.deleted_at IS NULL
      AND qh_anterior.id < qh.id  -- Qualificação anterior (ID menor)
      AND date(qh.data_conclusao) < date(qh_anterior.data_vencimento)  -- Renovada ANTES de vencer
  )
  AND qh.deleted_at IS NULL
);

-- =============================
-- 2. TRIGGER AUTOMÁTICO
-- =============================

-- Drop trigger se já existir
DROP TRIGGER IF EXISTS trg_marcar_renovada_insert;
DROP TRIGGER IF EXISTS trg_marcar_renovada_update;

-- Trigger AFTER INSERT: Marcar como renovada automaticamente
CREATE TRIGGER trg_marcar_renovada_insert
AFTER INSERT ON qualificacoes_historico
FOR EACH ROW
WHEN NEW.deleted_at IS NULL
BEGIN
  UPDATE qualificacoes_historico
  SET renovada = CASE
    WHEN EXISTS (
      SELECT 1
      FROM qualificacoes_historico qh_anterior
      WHERE qh_anterior.funcionario_cpf = NEW.funcionario_cpf
        AND qh_anterior.qualificacao_codigo = NEW.qualificacao_codigo
        AND qh_anterior.deleted_at IS NULL
        AND qh_anterior.id < NEW.id
        AND date(NEW.data_conclusao) < date(qh_anterior.data_vencimento)
    ) THEN 1
    ELSE 0
  END
  WHERE id = NEW.id;
END;

-- Trigger AFTER UPDATE: Recalcular se dados mudarem
CREATE TRIGGER trg_marcar_renovada_update
AFTER UPDATE OF data_conclusao, data_vencimento, funcionario_cpf, qualificacao_codigo
ON qualificacoes_historico
FOR EACH ROW
WHEN NEW.deleted_at IS NULL
BEGIN
  UPDATE qualificacoes_historico
  SET renovada = CASE
    WHEN EXISTS (
      SELECT 1
      FROM qualificacoes_historico qh_anterior
      WHERE qh_anterior.funcionario_cpf = NEW.funcionario_cpf
        AND qh_anterior.qualificacao_codigo = NEW.qualificacao_codigo
        AND qh_anterior.deleted_at IS NULL
        AND qh_anterior.id < NEW.id
        AND date(NEW.data_conclusao) < date(qh_anterior.data_vencimento)
    ) THEN 1
    ELSE 0
  END
  WHERE id = NEW.id;
END;

-- =============================
-- 3. VALIDAÇÃO
-- =============================

-- Verificar quantas foram marcadas como renovadas
SELECT 
  COUNT(*) as total_qualificacoes,
  SUM(CASE WHEN renovada = 1 THEN 1 ELSE 0 END) as total_renovadas,
  ROUND(CAST(SUM(CASE WHEN renovada = 1 THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) * 100, 2) as percentual_renovadas
FROM qualificacoes_historico
WHERE deleted_at IS NULL;

-- =============================
-- 4. ÍNDICE PARA PERFORMANCE
-- =============================

-- Índice para agilizar consultas de renovadas
CREATE INDEX IF NOT EXISTS idx_qualificacoes_historico_renovada 
ON qualificacoes_historico(renovada)
WHERE deleted_at IS NULL;

-- Índice composto para busca de qualificações anteriores
CREATE INDEX IF NOT EXISTS idx_qualificacoes_historico_func_qual_data 
ON qualificacoes_historico(funcionario_cpf, qualificacao_codigo, data_conclusao, data_vencimento)
WHERE deleted_at IS NULL;
