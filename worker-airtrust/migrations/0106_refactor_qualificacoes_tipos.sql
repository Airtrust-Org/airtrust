-- ================================================================
-- Migration 0106: Refatorar tabela QUALIFICACOES_TIPOS
-- Data: 2025-11-25
-- Objetivo: Recriar tabela para seguir EXATAMENTE layout da planilha oficial
-- ================================================================

-- 1. Backup da tabela antiga
DROP TABLE IF EXISTS qualificacoes_tipos_old;
ALTER TABLE qualificacoes_tipos RENAME TO qualificacoes_tipos_old;

-- 2. Criar tabela normalizada
CREATE TABLE qualificacoes_tipos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Campos da planilha oficial (ordem exata)
  tipo TEXT,
  codigo TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nome TEXT NOT NULL CHECK(length(trim(nome)) >= 3),
  descricao TEXT,
  categoria TEXT,
  carga_horaria REAL CHECK(carga_horaria IS NULL OR carga_horaria > 0),
  validade INTEGER CHECK(validade IS NULL OR validade > 0), -- em meses
  observacoes TEXT,
  
  -- Auditoria
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL
);

-- 3. Índices para performance (idempotentes)
CREATE UNIQUE INDEX IF NOT EXISTS idx_qualificacoes_tipos_codigo ON qualificacoes_tipos(codigo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_tipos_nome ON qualificacoes_tipos(nome) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_tipos_categoria ON qualificacoes_tipos(categoria) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_tipos_tipo ON qualificacoes_tipos(tipo) WHERE deleted_at IS NULL;

-- 4. Migrar dados compatíveis da tabela antiga
INSERT INTO qualificacoes_tipos (
  codigo,
  nome,
  tipo,
  categoria,
  descricao,
  validade,
  carga_horaria,
  created_at,
  updated_at
)
SELECT 
  UPPER(codigo) as codigo,
  nome,
  tipo,
  categoria,
  descricao,
  validade_meses as validade,
  carga_horaria_padrao as carga_horaria,
  created_at,
  updated_at
FROM qualificacoes_tipos_old 
WHERE codigo IS NOT NULL 
  AND nome IS NOT NULL
  AND length(trim(nome)) >= 3
ON CONFLICT(codigo) DO NOTHING;

-- 5. Limpar backup
DROP TABLE qualificacoes_tipos_old;

-- ================================================================
-- VALIDAÇÕES PÓS-MIGRATION
-- ================================================================
-- 1. SELECT COUNT(*) FROM qualificacoes_tipos; -- verificar migração
-- 2. PRAGMA table_info('qualificacoes_tipos'); -- verificar colunas
-- 3. SELECT * FROM qualificacoes_tipos LIMIT 5; -- sample data
