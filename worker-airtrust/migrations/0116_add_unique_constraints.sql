-- Migration 0116: Adicionar UNIQUE constraints para chaves naturais
-- Data: 2025-11-25
-- Objetivo: Preparar chaves naturais antes de refatorar qualificacoes_historico

-- =============================
-- 1. UNIQUE em funcionarios.cpf (se não existir)
-- =============================
CREATE UNIQUE INDEX IF NOT EXISTS ux_funcionarios_cpf 
  ON funcionarios(cpf) 
  WHERE deleted_at IS NULL;

-- =============================
-- 2. UNIQUE em qualificacoes_tipos.codigo (se não existir)
-- =============================
CREATE UNIQUE INDEX IF NOT EXISTS ux_qualificacoes_tipos_codigo 
  ON qualificacoes_tipos(codigo) 
  WHERE deleted_at IS NULL;

-- Verificação
-- SELECT 'Constraints criados com sucesso!' as status;
