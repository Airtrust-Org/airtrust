-- Script para migrar dados existentes para a nova estrutura
-- Data: 2026-01-13
-- Descrição: Atualiza referências de aeronaves em todo o sistema

-- ============================================================================
-- PARTE 1: ATUALIZAR FUNCIONARIOS
-- ============================================================================

-- Garantir que funcionarios.modelo_aeronave_id aponta para o modelo correto
-- Se houver campo aeronave, migrar para modelo_aeronave_id

-- Verificar se existe coluna 'aeronave' em funcionarios
-- Se existir, popular modelo_aeronave_id baseado no nome

-- Exemplo: se funcionario.aeronave = 'AW139', buscar id do modelo AW139
UPDATE funcionarios
SET modelo_aeronave_id = (
  SELECT id FROM modelos_aeronave 
  WHERE modelo = funcionarios.aeronave 
  AND deleted_at IS NULL 
  LIMIT 1
)
WHERE aeronave IS NOT NULL 
  AND modelo_aeronave_id IS NULL
  AND EXISTS (SELECT 1 FROM modelos_aeronave WHERE modelo = funcionarios.aeronave AND deleted_at IS NULL);

-- ============================================================================
-- PARTE 2: ATUALIZAR SESSOES E FICHAS
-- ============================================================================

-- Se houver referências a aeronaves em sessoes ou fichas_sessao, 
-- atualizar para usar o modelo

-- Atualizar tipo_aeronave em sessoes se houver
UPDATE sessoes
SET tipo_aeronave = (
  SELECT modelo FROM aeronaves 
  WHERE aeronaves.modelo = sessoes.tipo_aeronave
  AND aeronaves.deleted_at IS NULL
  LIMIT 1
)
WHERE tipo_aeronave IS NOT NULL
  AND EXISTS (SELECT 1 FROM aeronaves WHERE modelo = sessoes.tipo_aeronave AND deleted_at IS NULL);

-- ============================================================================
-- PARTE 3: ATUALIZAR MODELOS_SESSAO - Usar modelo ao invés de código
-- ============================================================================

-- Renomear codigo_aeronave para modelo_aeronave em modelos_sessao
-- Esta é uma alteração de schema que requer recriar a tabela

-- Verificar se a tabela modelos_sessao existe
-- Se sim, criar nova estrutura

-- Backup da tabela atual
CREATE TABLE IF NOT EXISTS modelos_sessao_backup_20260113 AS 
SELECT * FROM modelos_sessao WHERE 1=1;

-- Criar nova tabela com modelo_aeronave
CREATE TABLE IF NOT EXISTS modelos_sessao_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  tipo_sessao_id INTEGER NOT NULL,
  modelo_aeronave TEXT NOT NULL,  -- ALTERADO de codigo_aeronave
  descricao TEXT,
  duracao_estimada INTEGER,
  gera_qualificacao INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME,
  FOREIGN KEY (tipo_sessao_id) REFERENCES tipos_sessao(id)
);

-- Copiar dados (codigo_aeronave -> modelo_aeronave)
INSERT INTO modelos_sessao_new 
  (id, codigo, nome, tipo_sessao_id, modelo_aeronave, descricao, duracao_estimada, gera_qualificacao, created_at, updated_at, deleted_at)
SELECT 
  id, 
  codigo, 
  nome, 
  tipo_sessao_id, 
  codigo_aeronave as modelo_aeronave,  -- RENOMEANDO
  descricao, 
  duracao_estimada, 
  gera_qualificacao, 
  created_at, 
  updated_at, 
  deleted_at
FROM modelos_sessao;

-- Dropar tabela antiga
DROP TABLE modelos_sessao;

-- Renomear tabela nova
ALTER TABLE modelos_sessao_new RENAME TO modelos_sessao;

-- Recriar índices
CREATE INDEX IF NOT EXISTS idx_modelos_sessao_tipo_sessao ON modelos_sessao(tipo_sessao_id);
CREATE INDEX IF NOT EXISTS idx_modelos_sessao_modelo ON modelos_sessao(modelo_aeronave);
CREATE INDEX IF NOT EXISTS idx_modelos_sessao_codigo ON modelos_sessao(codigo);

-- ============================================================================
-- PARTE 4: ATUALIZAR MANOBRAS - tipo_aeronave usa modelo
-- ============================================================================

-- A coluna tipo_aeronave em manobras já deve usar o modelo
-- Apenas garantir que os valores estão corretos

-- Atualizar valores antigos se houver códigos ao invés de modelos
-- Por exemplo: 'AW139' deve permanecer 'AW139' (que é o modelo)

-- Nenhuma ação necessária, tipo_aeronave já usa nome do modelo

-- ============================================================================
-- PARTE 5: ATUALIZAR QUALIFICACOES - garantir que usa modelo_aeronave_id
-- ============================================================================

-- A tabela qualificacoes já usa modelo_aeronave_id (FK para modelos_aeronave)
-- Nenhuma ação necessária

-- ============================================================================
-- PARTE 6: POPULAR MODELOS_AERONAVE com dados comuns
-- ============================================================================

-- Garantir que modelos comuns do sistema existem
INSERT OR IGNORE INTO modelos_aeronave (modelo, fabricante, tipo, categoria, ativo) VALUES
('AW139', 'Leonardo (AgustaWestland)', 'Helicóptero', 'Executivo', 1),
('S76', 'Sikorsky', 'Helicóptero', 'Comercial', 1),
('EC135', 'Airbus Helicopters', 'Helicóptero', 'Executivo', 1),
('Bell 407', 'Bell Helicopter', 'Helicóptero', 'Executivo', 1),
('A320', 'Airbus', 'Jato', 'Comercial', 1),
('B737', 'Boeing', 'Jato', 'Comercial', 1),
('E195', 'Embraer', 'Jato', 'Comercial', 1),
('ATR72', 'ATR Aircraft', 'Turboélice', 'Comercial', 1);

-- ============================================================================
-- VERIFICAÇÕES FINAIS
-- ============================================================================

SELECT '=== MODELOS_SESSAO - Primeiros 10 registros ===' as info;
SELECT id, codigo, nome, tipo_sessao_id, modelo_aeronave, gera_qualificacao 
FROM modelos_sessao 
WHERE deleted_at IS NULL 
ORDER BY id 
LIMIT 10;

SELECT '=== FUNCIONARIOS com modelo_aeronave ===' as info;
SELECT COUNT(*) as total_com_modelo
FROM funcionarios 
WHERE modelo_aeronave_id IS NOT NULL 
AND deleted_at IS NULL;

SELECT '=== MODELOS CADASTRADOS ===' as info;
SELECT * FROM modelos_aeronave WHERE deleted_at IS NULL ORDER BY modelo;
