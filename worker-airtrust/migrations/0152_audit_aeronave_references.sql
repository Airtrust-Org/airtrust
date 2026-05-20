-- Script SQL para corrigir referências obsoletas de aeronaves
-- Data: 2026-01-13
-- Descrição: Remove campos duplicados e garante que modelos vêm de um único lugar

-- ============================================================================
-- PROBLEMA IDENTIFICADO:
-- ============================================================================
-- 1. Campos "aeronave" e "modelo_aeronave" duplicados em queries
-- 2. Interface "Aeronave" com campo "codigo" obsoleto no frontend
-- 3. Referências a codigo_aeronave em modelos_sessao
-- 4. JOIN com aeronaves usando tipo_aeronave como ID (incorreto)

-- ============================================================================
-- PARTE 1: GARANTIR ESTRUTURA CORRETA DAS TABELAS
-- ============================================================================

-- Verificar estrutura de modelos_aeronave (deve ter apenas "modelo", não "codigo" nem "nome")
SELECT '=== ESTRUTURA MODELOS_AERONAVE ===' as info;
SELECT sql FROM sqlite_master WHERE type='table' AND name='modelos_aeronave';

-- Verificar estrutura de aeronaves (deve ter "modelo", não "codigo")
SELECT '=== ESTRUTURA AERONAVES ===' as info;
SELECT sql FROM sqlite_master WHERE type='table' AND name='aeronaves';

-- Verificar estrutura de modelos_sessao (deve ter "modelo_aeronave", não "codigo_aeronave")
SELECT '=== ESTRUTURA MODELOS_SESSAO ===' as info;
SELECT sql FROM sqlite_master WHERE type='table' AND name='modelos_sessao';

-- ============================================================================
-- PARTE 2: ATUALIZAR FICHAS_SESSAO - Garantir que tipo_aeronave seja TEXT (modelo)
-- ============================================================================

-- Verificar estrutura atual de fichas_sessao
SELECT sql FROM sqlite_master WHERE type='table' AND name='fichas_sessao';

-- Se tipo_aeronave estiver como INTEGER (ID), precisamos corrigir:
-- 1. Criar backup
CREATE TABLE IF NOT EXISTS fichas_sessao_backup_20260113 AS 
SELECT * FROM fichas_sessao;

-- 2. Atualizar valores de ID para MODELO (se aplicável)
UPDATE fichas_sessao
SET tipo_aeronave = (
  SELECT modelo FROM aeronaves 
  WHERE aeronaves.id = CAST(fichas_sessao.tipo_aeronave AS INTEGER)
  AND aeronaves.deleted_at IS NULL
)
WHERE tipo_aeronave IS NOT NULL 
  AND tipo_aeronave != ''
  AND CAST(tipo_aeronave AS INTEGER) > 0
  AND EXISTS (
    SELECT 1 FROM aeronaves 
    WHERE aeronaves.id = CAST(fichas_sessao.tipo_aeronave AS INTEGER)
  );

-- ============================================================================
-- PARTE 3: DADOS DE REFERÊNCIA - Garantir modelos existem
-- ============================================================================

-- Popular modelos_aeronave se não existirem
INSERT OR IGNORE INTO modelos_aeronave (modelo, fabricante, tipo, categoria, ativo) VALUES
('AW139', 'Leonardo (AgustaWestland)', 'Helicóptero', 'Executivo', 1),
('S76', 'Sikorsky', 'Helicóptero', 'Comercial', 1),
('EC135', 'Airbus Helicopters', 'Helicóptero', 'Executivo', 1),
('Bell 407', 'Bell Helicopter', 'Helicóptero', 'Executivo', 1);

-- ============================================================================
-- PARTE 4: VERIFICAÇÕES FINAIS
-- ============================================================================

-- Listar modelos cadastrados
SELECT '=== MODELOS CADASTRADOS ===' as info;
SELECT id, modelo, fabricante, tipo, categoria 
FROM modelos_aeronave 
WHERE deleted_at IS NULL 
ORDER BY modelo;

-- Contar referências por modelo
SELECT '=== USO DE MODELOS NO SISTEMA ===' as info;
SELECT 
  m.modelo,
  (SELECT COUNT(*) FROM funcionarios WHERE modelo_aeronave_id = m.id AND deleted_at IS NULL) as funcionarios,
  (SELECT COUNT(*) FROM modelos_sessao WHERE modelo_aeronave = m.modelo AND deleted_at IS NULL) as modelos_sessao,
  (SELECT COUNT(*) FROM aeronaves WHERE modelo = m.modelo AND deleted_at IS NULL) as aeronaves_fisicas
FROM modelos_aeronave m
WHERE m.deleted_at IS NULL
ORDER BY m.modelo;

-- Verificar fichas com tipo_aeronave válido
SELECT '=== FICHAS POR TIPO AERONAVE ===' as info;
SELECT 
  tipo_aeronave,
  COUNT(*) as total
FROM fichas_sessao
WHERE deleted_at IS NULL
  AND tipo_aeronave IS NOT NULL
  AND tipo_aeronave != ''
GROUP BY tipo_aeronave
ORDER BY total DESC;
