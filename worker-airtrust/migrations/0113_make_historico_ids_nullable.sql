-- ================================================================
-- Migration 0113: Tornar funcionario_id e qualificacao_id nullable
-- Data: 2025-11-25
-- Objetivo: Permitir usar APENAS funcionario_cpf e qualificacao_codigo
--           (sistema v2 usa FKs textuais em vez de IDs numéricos)
-- ================================================================

-- SQLite não suporta ALTER COLUMN diretamente
-- Estratégia: recriar tabela sem NOT NULL constraints nas colunas antigas

-- 1. Criar tabela temporária
CREATE TABLE IF NOT EXISTS qualificacoes_historico_new AS SELECT * FROM qualificacoes_historico;

-- 2. Dropar tabela original
DROP TABLE qualificacoes_historico;

-- 3. Recriar sem NOT NULL em funcionario_id e qualificacao_id
CREATE TABLE qualificacoes_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER, -- AGORA NULLABLE
  qualificacao_id INTEGER, -- AGORA NULLABLE
  tipo_codigo TEXT,
  codigo TEXT,
  categoria TEXT,
  validade TEXT,
  numero_certificado TEXT,
  observacoes TEXT,
  arquivo_url TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  data_conclusao TEXT,
  validade_meses INTEGER,
  instrutor TEXT,
  local TEXT,
  modalidade TEXT CHECK(modalidade IS NULL OR modalidade IN ('PRESENCIAL', 'EAD', 'HIBRIDO')),
  nota REAL CHECK(nota IS NULL OR (nota >= 1.0 AND nota <= 5.0)),
  carga_horaria REAL CHECK(carga_horaria IS NULL OR carga_horaria > 0),
  data_vencimento TEXT,
  renovada INTEGER DEFAULT 0,
  certificado_arquivo_id TEXT,
  funcionario_cpf TEXT, -- Nova coluna v2
  qualificacao_codigo TEXT COLLATE NOCASE -- Nova coluna v2
);

-- 4. Restaurar dados
INSERT INTO qualificacoes_historico SELECT * FROM qualificacoes_historico_new;

-- 5. Limpar temporária
DROP TABLE qualificacoes_historico_new;

-- 6. Recriar índices
CREATE INDEX IF NOT EXISTS idx_historico_func_cpf ON qualificacoes_historico(funcionario_cpf) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_historico_qual_codigo ON qualificacoes_historico(qualificacao_codigo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_historico_data_conclusao ON qualificacoes_historico(data_conclusao) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_historico_data_vencimento ON qualificacoes_historico(data_vencimento) WHERE deleted_at IS NULL;

-- Auditoria
SELECT '0113_make_historico_ids_nullable' AS migration_applied,
       COUNT(*) AS total_registros
FROM qualificacoes_historico;
