-- Migration: Refatoração completa do sistema de aeronaves
-- Data: 2026-01-13
-- Descrição: 
--   1. Remove coluna "codigo" de modelos_aeronave e aeronaves
--   2. Renomeia "nome" para "modelo" em modelos_aeronave
--   3. Remove "fabricante" de aeronaves (já está em modelos_aeronave)
--   4. Atualiza todas as referências do sistema para usar apenas "modelo"

-- ============================================================================
-- PARTE 1: MODELOS_AERONAVE - Remove codigo, renomeia nome -> modelo
-- ============================================================================

-- Criar tabela temporária com nova estrutura
CREATE TABLE IF NOT EXISTS modelos_aeronave_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  modelo TEXT NOT NULL UNIQUE,  -- RENOMEADO de "nome"
  fabricante TEXT,
  tipo TEXT,
  categoria TEXT,
  descricao TEXT,
  ativo INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME
);

-- Copiar dados (codigo removido, nome -> modelo)
INSERT INTO modelos_aeronave_new 
  (id, modelo, fabricante, tipo, categoria, descricao, ativo, created_at, updated_at, deleted_at)
SELECT 
  id, 
  nome as modelo,  -- RENOMEANDO
  fabricante, 
  tipo, 
  categoria, 
  descricao, 
  ativo, 
  created_at, 
  updated_at, 
  deleted_at
FROM modelos_aeronave;

-- Dropar tabela antiga
DROP TABLE modelos_aeronave;

-- Renomear tabela nova
ALTER TABLE modelos_aeronave_new RENAME TO modelos_aeronave;

-- Recriar índices
CREATE INDEX IF NOT EXISTS idx_modelos_aeronave_modelo ON modelos_aeronave(modelo);
CREATE INDEX IF NOT EXISTS idx_modelos_aeronave_ativo ON modelos_aeronave(ativo);

-- ============================================================================
-- PARTE 2: AERONAVES - Remove codigo e fabricante
-- ============================================================================

-- Criar tabela temporária com nova estrutura
CREATE TABLE IF NOT EXISTS aeronaves_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  modelo TEXT NOT NULL,  -- REFERÊNCIA ao modelo (não mais codigo)
  prefixo TEXT UNIQUE,
  ano_fabricacao INTEGER,
  status TEXT DEFAULT 'ATIVO',
  observacoes TEXT,
  ativo INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME
);

-- Copiar dados (codigo e fabricante removidos)
INSERT INTO aeronaves_new 
  (id, modelo, prefixo, ano_fabricacao, status, observacoes, ativo, created_at, updated_at, deleted_at)
SELECT 
  id, 
  modelo,  -- Já era modelo, mantém
  prefixo, 
  ano_fabricacao,
  COALESCE(status, 'ATIVO') as status,
  observacoes,
  COALESCE(ativo, 1) as ativo,
  created_at, 
  updated_at, 
  deleted_at
FROM aeronaves;

-- Dropar tabela antiga
DROP TABLE aeronaves;

-- Renomear tabela nova
ALTER TABLE aeronaves_new RENAME TO aeronaves;

-- Recriar índices
CREATE INDEX IF NOT EXISTS idx_aeronaves_modelo ON aeronaves(modelo);
CREATE INDEX IF NOT EXISTS idx_aeronaves_ativo ON aeronaves(ativo);
CREATE INDEX IF NOT EXISTS idx_aeronaves_prefixo ON aeronaves(prefixo);

-- ============================================================================
-- PARTE 3: ATUALIZAR FUNCIONARIOS - Usar modelo ao invés de aeronave
-- ============================================================================

-- Adicionar coluna modelo_aeronave se não existir
-- (já existe modelo_aeronave_id que aponta para modelos_aeronave.id)
-- Vamos garantir que existe e remover a coluna "aeronave" antiga se houver

-- Nota: A coluna modelo_aeronave_id já existe e aponta para modelos_aeronave.id
-- Não precisa fazer alterações em funcionarios

-- ============================================================================
-- PARTE 4: DADOS DE EXEMPLO - Preencher modelos faltantes
-- ============================================================================

-- Garantir que os modelos comuns existam
INSERT OR IGNORE INTO modelos_aeronave (modelo, fabricante, tipo, categoria, ativo) VALUES
('AW139', 'Leonardo (AgustaWestland)', 'Helicóptero', 'Executivo', 1),
('S76', 'Sikorsky', 'Helicóptero', 'Comercial', 1),
('EC135', 'Airbus Helicopters', 'Helicóptero', 'Executivo', 1),
('Bell 407', 'Bell Helicopter', 'Helicóptero', 'Executivo', 1),
('A320', 'Airbus', 'Jato', 'Comercial', 1),
('B737', 'Boeing', 'Jato', 'Comercial', 1),
('E195', 'Embraer', 'Jato', 'Comercial', 1);

-- ============================================================================
-- VERIFICAÇÕES
-- ============================================================================

-- Verificar estrutura das tabelas
SELECT '=== MODELOS_AERONAVE ===' as info;
SELECT sql FROM sqlite_master WHERE type='table' AND name='modelos_aeronave';

SELECT '=== AERONAVES ===' as info;
SELECT sql FROM sqlite_master WHERE type='table' AND name='aeronaves';

-- Listar modelos cadastrados
SELECT '=== MODELOS CADASTRADOS ===' as info;
SELECT * FROM modelos_aeronave WHERE deleted_at IS NULL ORDER BY modelo;
