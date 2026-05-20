-- ========================================
-- Migration 132: Adicionar campo ATIVO em funcionários
-- ========================================
-- Data: 28/11/2025
-- Objetivo: Permitir marcar funcionários como ativos/inativos
--           Dashboard e compliance consideram apenas funcionários ativos
-- ========================================

-- 1. Adicionar coluna ativo (default TRUE para retrocompatibilidade)
ALTER TABLE funcionarios ADD COLUMN ativo INTEGER DEFAULT 1 NOT NULL;

-- 2. Criar índice para otimizar queries de dashboard/compliance
CREATE INDEX IF NOT EXISTS idx_funcionarios_ativo_deleted 
ON funcionarios(ativo, deleted_at) 
WHERE deleted_at IS NULL;

-- 3. Comentário explicativo
-- ativo = 1: Funcionário ativo (conta para dashboard e compliance)
-- ativo = 0: Funcionário inativo (não conta para cálculos)
-- deleted_at IS NULL: Ainda não foi soft-deleted

-- 4. Todos os funcionários existentes tornam-se ATIVOS por padrão
UPDATE funcionarios 
SET ativo = 1 
WHERE ativo IS NULL;

-- ========================================
-- ROLLBACK (caso necessário):
-- ========================================
-- ALTER TABLE funcionarios DROP COLUMN ativo;
-- DROP INDEX IF EXISTS idx_funcionarios_ativo_deleted;
