-- Migration 0063: Align qualificacoes_tipos schema - CLEAN VERSION
-- Date: 26 November 2025
-- Purpose: Rename columns to match import table structure exactly

-- DISABLE SAFETY CHECKS
PRAGMA foreign_keys = OFF;
PRAGMA defer_foreign_keys = TRUE;

-- DROP ALL VIEWS (comprehensive list)
DROP VIEW IF EXISTS qualificacoes_historico_v;
DROP VIEW IF EXISTS v_qualificacoes_tipos;
DROP VIEW IF EXISTS v_qualificacoes;
DROP VIEW IF EXISTS qualificacoes_risco_v;
DROP VIEW IF EXISTS qualificacoes_historico_risco_v;
DROP VIEW IF EXISTS qualificacoes_historico_filtrado_v;
DROP VIEW IF EXISTS qualificacoes_vencimento_v;
DROP VIEW IF EXISTS audit_qualificacoes_v;
DROP VIEW IF EXISTS audit_tipos_v;

-- DROP ALL TRIGGERS (comprehensive list)
DROP TRIGGER IF EXISTS trg_apply_reclassification;
DROP TRIGGER IF EXISTS audit_insert_qualificacoes_tipos;
DROP TRIGGER IF EXISTS audit_update_qualificacoes_tipos;
DROP TRIGGER IF EXISTS audit_delete_qualificacoes_tipos;
DROP TRIGGER IF EXISTS trg_qualificacoes_tipos_update;
DROP TRIGGER IF EXISTS trg_qualificacoes_tipos_insert;
DROP TRIGGER IF EXISTS trg_qualificacoes_tipos_delete;

-- CREATE BACKUP
CREATE TABLE IF NOT EXISTS qualificacoes_tipos_backup_0063 AS 
SELECT * FROM qualificacoes_tipos;

-- RENAME OLD TABLE
ALTER TABLE qualificacoes_tipos RENAME TO qualificacoes_tipos_old;

-- CREATE NEW TABLE WITH CORRECT SCHEMA (MATCHING IMPORT TABLE EXACTLY)
CREATE TABLE qualificacoes_tipos (
  id TEXT PRIMARY KEY,
  tipo TEXT,
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  descricao TEXT,
  categoria TEXT NOT NULL,
  carga_horaria REAL,
  validade INTEGER,
  observacoes TEXT,
  ativo INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- COPY DATA (map validade_meses to validade)
INSERT INTO qualificacoes_tipos (
  id, tipo, codigo, nome, descricao, categoria, carga_horaria, validade, observacoes, ativo, created_at, updated_at, deleted_at
)
SELECT 
  id, tipo, codigo, nome, descricao, categoria, carga_horaria, validade_meses, NULL, ativo, created_at, updated_at, deleted_at
FROM qualificacoes_tipos_old;

-- RECREATE INDEXES
CREATE INDEX IF NOT EXISTS idx_qualificacoes_tipos_categoria ON qualificacoes_tipos(categoria) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_tipos_codigo ON qualificacoes_tipos(codigo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_tipos_deleted_at ON qualificacoes_tipos(deleted_at);

-- REENABLE SAFETY
PRAGMA foreign_keys = ON;

SELECT 'Migration 0063 complete - qualificacoes_tipos schema aligned with import table' as status;
