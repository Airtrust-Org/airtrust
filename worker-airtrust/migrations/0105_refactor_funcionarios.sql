-- ================================================================
-- Migration 0105: Refatorar tabela FUNCIONARIOS
-- Data: 2025-11-25
-- Objetivo: Recriar tabela para seguir EXATAMENTE layout da planilha oficial
-- ================================================================

-- 1. Backup da tabela antiga
DROP TABLE IF EXISTS funcionarios_old;
ALTER TABLE funcionarios RENAME TO funcionarios_old;

-- 2. Criar tabela normalizada (sem acentos, snake_case)
CREATE TABLE funcionarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Campos da planilha oficial (ordem exata, sem acentos)
  nome TEXT NOT NULL CHECK(length(trim(nome)) >= 3),
  guerra TEXT,
  funcao TEXT,
  aeronave TEXT,
  cpf TEXT NOT NULL UNIQUE COLLATE NOCASE,
  data_nascimento TEXT, -- ISO date YYYY-MM-DD
  licenca TEXT,
  canac TEXT,
  sispat TEXT,
  prestserv TEXT,
  email TEXT,
  telefone TEXT,
  admissao TEXT, -- ISO date YYYY-MM-DD
  matricula TEXT NOT NULL UNIQUE COLLATE NOCASE,
  
  -- Auditoria
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL
);

-- 3. Índices para performance (idempotentes)
CREATE UNIQUE INDEX IF NOT EXISTS idx_funcionarios_cpf ON funcionarios(cpf) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_funcionarios_matricula ON funcionarios(matricula) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_funcionarios_nome ON funcionarios(nome) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_funcionarios_canac ON funcionarios(canac) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_funcionarios_email ON funcionarios(email) WHERE deleted_at IS NULL;

-- 4. Migrar dados compatíveis da tabela antiga
INSERT INTO funcionarios (
  cpf, 
  matricula, 
  nome, 
  email, 
  funcao,
  telefone,
  created_at, 
  updated_at
)
SELECT 
  cpf, 
  COALESCE(matricula, 'MAT' || substr(cpf, 1, 6)) as matricula,
  nome, 
  email, 
  cargo as funcao,
  telefone,
  created_at, 
  updated_at 
FROM funcionarios_old 
WHERE cpf IS NOT NULL 
  AND nome IS NOT NULL
  AND length(trim(nome)) >= 3
ON CONFLICT(cpf) DO NOTHING;

-- 5. Limpar backup
DROP TABLE funcionarios_old;

-- ================================================================
-- VALIDAÇÕES PÓS-MIGRATION
-- ================================================================
-- 1. SELECT COUNT(*) FROM funcionarios; -- verificar migração
-- 2. PRAGMA table_info('funcionarios'); -- verificar colunas
-- 3. SELECT * FROM funcionarios LIMIT 5; -- sample data
