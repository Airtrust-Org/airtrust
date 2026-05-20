-- ================================================================
-- Migration 0125: Converter qualificacoes_tipos TEXT IDs → INTEGER IDs
-- Data: 2025-11-28
-- Objetivo: Corrigir incompatibilidade de tipos (TEXT → INTEGER)
-- CRÍTICO: Preservar TODOS os dados e relações do histórico
-- ================================================================

-- FASE 1: Criar tabela temporária com mapeamento TEXT → INTEGER
CREATE TABLE IF NOT EXISTS qualificacoes_tipos_id_map (
  old_id TEXT PRIMARY KEY,
  new_id INTEGER NOT NULL,
  codigo TEXT NOT NULL
);

-- FASE 2: Backup da tabela atual
DROP TABLE IF EXISTS qualificacoes_tipos_backup_20251128;
CREATE TABLE IF NOT EXISTS qualificacoes_tipos_backup_20251128 AS 
SELECT * FROM qualificacoes_tipos;

-- FASE 3: Criar nova tabela com INTEGER IDs
DROP TABLE IF EXISTS qualificacoes_tipos_new;
CREATE TABLE IF NOT EXISTS qualificacoes_tipos_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT,
  codigo TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nome TEXT NOT NULL CHECK(length(trim(nome)) >= 3),
  descricao TEXT,
  categoria TEXT,
  carga_horaria REAL CHECK(carga_horaria IS NULL OR carga_horaria > 0),
  validade INTEGER CHECK(validade IS NULL OR validade > 0),
  vencimento_fim_mes INTEGER DEFAULT 0 CHECK(vencimento_fim_mes IN (0, 1)),
  observacoes TEXT,
  ativo INTEGER DEFAULT 1 CHECK(ativo IN (0, 1)),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL
);

-- FASE 4: Migrar dados e construir mapeamento ID
INSERT INTO qualificacoes_tipos_new (
  tipo, codigo, nome, descricao, categoria, 
  carga_horaria, validade, vencimento_fim_mes, 
  observacoes, ativo, created_at, updated_at, deleted_at
)
SELECT 
  tipo, codigo, nome, descricao, categoria,
  carga_horaria, validade, vencimento_fim_mes,
  observacoes, ativo, created_at, updated_at, deleted_at
FROM qualificacoes_tipos
ORDER BY created_at ASC;

-- FASE 5: Popular tabela de mapeamento
INSERT INTO qualificacoes_tipos_id_map (old_id, new_id, codigo)
SELECT 
  old.id as old_id,
  new.id as new_id,
  old.codigo as codigo
FROM qualificacoes_tipos_backup_20251128 old
INNER JOIN qualificacoes_tipos_new new ON UPPER(old.codigo) = UPPER(new.codigo);

-- FASE 6: Substituir tabela antiga pela nova
DROP TABLE qualificacoes_tipos;
ALTER TABLE qualificacoes_tipos_new RENAME TO qualificacoes_tipos;

-- FASE 7: Recriar índices
CREATE UNIQUE INDEX IF NOT EXISTS idx_qualificacoes_tipos_codigo 
ON qualificacoes_tipos(codigo) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_qualificacoes_tipos_nome 
ON qualificacoes_tipos(nome) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_qualificacoes_tipos_categoria 
ON qualificacoes_tipos(categoria) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_qualificacoes_tipos_tipo 
ON qualificacoes_tipos(tipo) WHERE deleted_at IS NULL;

-- FASE 8: Atualizar qualificacoes_historico.qualificacao_id usando mapeamento
-- Primeiro, garantir que a coluna existe e é do tipo correto
-- (já deve existir, mas vamos confirmar)

-- Atualizar IDs usando o mapeamento via código
UPDATE qualificacoes_historico
SET qualificacao_id = (
  SELECT new_id 
  FROM qualificacoes_tipos_id_map 
  WHERE UPPER(qualificacoes_tipos_id_map.codigo) = UPPER(qualificacoes_historico.qualificacao_codigo)
  LIMIT 1
)
WHERE qualificacao_codigo IS NOT NULL
AND deleted_at IS NULL;

-- FASE 9: Criar índice composto para performance de JOINs
CREATE INDEX IF NOT EXISTS idx_qualificacoes_historico_fk_ids 
ON qualificacoes_historico(funcionario_id, qualificacao_id)
WHERE deleted_at IS NULL;

-- FASE 10: Limpar tabela de mapeamento (opcional - manter para auditoria)
-- DROP TABLE qualificacoes_tipos_id_map;

-- ================================================================
-- VALIDAÇÕES PÓS-MIGRATION (executar manualmente via console)
-- ================================================================
-- 1. Verificar tipos compatíveis:
--    SELECT typeof(id) FROM qualificacoes_tipos LIMIT 1; -- deve ser 'integer'
--    SELECT typeof(qualificacao_id) FROM qualificacoes_historico WHERE qualificacao_id IS NOT NULL LIMIT 1; -- deve ser 'integer'

-- 2. Verificar dados preservados:
--    SELECT COUNT(*) FROM qualificacoes_tipos; -- deve ter MESMA quantidade que backup
--    SELECT COUNT(*) FROM qualificacoes_tipos_backup_20251128;

-- 3. Verificar relações funcionando:
--    SELECT COUNT(*) FROM qualificacoes_historico WHERE qualificacao_id IS NOT NULL; -- deve ser > 600
--    
--    SELECT qh.id, qt.nome, qt.codigo 
--    FROM qualificacoes_historico qh
--    INNER JOIN qualificacoes_tipos qt ON qh.qualificacao_id = qt.id
--    WHERE qh.deleted_at IS NULL
--    LIMIT 5; -- deve retornar registros com nomes

-- 4. Verificar mapeamento preservado:
--    SELECT old_id, new_id, codigo FROM qualificacoes_tipos_id_map LIMIT 10;
