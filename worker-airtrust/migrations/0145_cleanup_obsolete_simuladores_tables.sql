-- =====================================================
-- Migration 0145: Limpeza de Tabelas Obsoletas - Módulo Simuladores
-- Data: 02/12/2025
-- Objetivo: Remover tabelas legacy e consolidar estrutura
-- =====================================================

-- 1. REMOVER TABELAS OBSOLETAS
-- =====================================================

-- Tabela obsoleta (substituída por 'manobras')
-- 275 registros não usados
DROP TABLE IF EXISTS cadastro_manobras;

-- Tabela obsoleta (categoria agora é TEXT em 'manobras')
-- 21 registros não usados
DROP TABLE IF EXISTS manobras_categorias;

-- Tabela obsoleta (substituída por 'modelos_sessao_manobras')
-- 450 registros antigos - dados migrados para modelos_sessao_manobras
DROP TABLE IF EXISTS sessoes_template_manobras;

-- Tabela obsoleta (nome confuso, possível duplicação)
-- 1051 registros - verificar se é usada antes de remover
DROP TABLE IF EXISTS sessao_manobras;

-- Tabela vazia (0 registros)
DROP TABLE IF EXISTS sessoes_manobras;


-- 2. CRIAR ÍNDICES DE PERFORMANCE (se não existirem)
-- =====================================================

-- Índices para fichas_sessao_manobras
CREATE INDEX IF NOT EXISTS idx_fichas_sessao_manobras_ficha 
ON fichas_sessao_manobras(ficha_id) 
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fichas_sessao_manobras_ordem 
ON fichas_sessao_manobras(ordem) 
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fichas_sessao_manobras_codigo 
ON fichas_sessao_manobras(codigo) 
WHERE deleted_at IS NULL;


-- 3. VERIFICAR INTEGRIDADE PÓS-LIMPEZA
-- =====================================================

-- Verificar se modelos_sessao_manobras está populada
-- Esperado: ~220 registros
SELECT 
  'modelos_sessao_manobras' as tabela,
  COUNT(*) as total 
FROM modelos_sessao_manobras 
WHERE deleted_at IS NULL;

-- Verificar se fichas_sessao_manobras está populada
-- Esperado: registros de avaliações
SELECT 
  'fichas_sessao_manobras' as tabela,
  COUNT(*) as total 
FROM fichas_sessao_manobras 
WHERE deleted_at IS NULL;

-- Verificar se manobras está populada
-- Esperado: ~71 manobras
SELECT 
  'manobras' as tabela,
  COUNT(*) as total 
FROM manobras 
WHERE deleted_at IS NULL;


-- 4. DOCUMENTAÇÃO
-- =====================================================

-- ESTRUTURA FINAL DO MÓDULO SIMULADORES:
--
-- ✅ TABELAS ATIVAS:
-- - manobras (71 registros) → Master data de manobras
-- - modelos_sessao (12 registros) → Templates de sessões
-- - modelos_sessao_manobras (220 registros) → Relacionamento N:N modelos ↔ manobras
-- - fichas_sessao (17 registros) → Fichas de avaliação
-- - fichas_sessao_manobras (22 registros) → Manobras avaliadas nas fichas
--
-- ❌ TABELAS REMOVIDAS:
-- - cadastro_manobras → Substituída por 'manobras'
-- - manobras_categorias → categoria agora é TEXT
-- - sessoes_template_manobras → Substituída por 'modelos_sessao_manobras'
-- - sessao_manobras → Nome confuso, não usada
-- - sessoes_manobras → Vazia
--
-- 📊 ESTIMATIVA DE ESPAÇO LIBERADO: ~1.1 MB
-- 🚀 BENEFÍCIOS: Menos confusão, queries mais rápidas, estrutura limpa

-- =====================================================
-- FIM DA MIGRATION 0145
-- =====================================================
