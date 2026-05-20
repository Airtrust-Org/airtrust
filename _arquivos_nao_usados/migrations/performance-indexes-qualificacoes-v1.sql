-- Migration: Qualificacoes Performance Optimization + Schema Fix
-- Date: 2025-11-06
-- Purpose: Fix schema divergence and add performance indexes

-- Step 1: Rename qualificacoes_old_28col to qualificacoes_registros for clarity
ALTER TABLE qualificacoes_old_28col RENAME TO qualificacoes_registros;

-- Step 2: Update foreign key reference in certificados_qualificacoes
-- SQLite doesn't support direct foreign key updates, so we'll need to handle via code
-- But first, recreate the table with correct reference
DROP TABLE IF EXISTS certificados_qualificacoes_new;
CREATE TABLE certificados_qualificacoes_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  qualificacao_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  arquivo_url TEXT NOT NULL,
  nome_arquivo TEXT NOT NULL,
  tipo_certificado VARCHAR(50) NOT NULL DEFAULT 'GERADO',
  versao INTEGER NOT NULL DEFAULT 1,
  eh_anterior BOOLEAN NOT NULL DEFAULT FALSE,
  data_geracao TIMESTAMP,
  data_upload TIMESTAMP,
  criado_por_usuario_id INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  FOREIGN KEY (qualificacao_id) REFERENCES qualificacoes_registros(id),
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (criado_por_usuario_id) REFERENCES usuarios(id),
  UNIQUE(qualificacao_id, versao, deleted_at)
);

-- Copy data
INSERT INTO certificados_qualificacoes_new SELECT * FROM certificados_qualificacoes;

-- Drop old, rename new
DROP TABLE certificados_qualificacoes;
ALTER TABLE certificados_qualificacoes_new RENAME TO certificados_qualificacoes;

-- Step 3: Create performance indexes on qualificacoes_registros
-- Composite index for main query JOIN + DELETE filter
CREATE INDEX IF NOT EXISTS idx_qual_reg_funcionario_deleted ON qualificacoes_registros(funcionario_id, deleted_at);

-- Index for date range queries (expiry alerts)
CREATE INDEX IF NOT EXISTS idx_qual_reg_vencimento_status ON qualificacoes_registros(data_vencimento, status, deleted_at);

-- Index for search queries
CREATE INDEX IF NOT EXISTS idx_qual_reg_codigo_tipo ON qualificacoes_registros(codigo, tipo, deleted_at);

-- Index for renewal checks
CREATE INDEX IF NOT EXISTS idx_qual_reg_renovada ON qualificacoes_registros(is_renovada, deleted_at);

-- Index for status-based queries
CREATE INDEX IF NOT EXISTS idx_qual_reg_status_deleted ON qualificacoes_registros(status, deleted_at);

-- Step 4: Create index on qualificacoes (templates) for template lookups
CREATE INDEX IF NOT EXISTS idx_qualif_codigo ON qualificacoes(codigo, deleted_at);
