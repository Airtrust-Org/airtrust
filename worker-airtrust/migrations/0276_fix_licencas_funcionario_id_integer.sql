-- Migration 0276: Corrigir licencas.funcionario_id TEXT → INTEGER
-- Data: 2026-03-15
-- Motivo: Type mismatch silencioso — JOINs com funcionarios.id (INTEGER) via
--         comparação TEXT/INTEGER podem falhar silenciosamente em SQLite
--         dependendo de affinity rules. Tabela está vazia (0 rows), migração
--         segura sem necessidade de backfill.

PRAGMA foreign_keys = OFF;

-- Recriar tabela com tipo correto
CREATE TABLE IF NOT EXISTS licencas_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  tipo        TEXT NOT NULL,
  numero      TEXT NOT NULL,
  data_emissao TEXT NOT NULL,
  data_vencimento TEXT NOT NULL,
  observacoes TEXT,
  created_at  TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
  updated_at  TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
  deleted_at  TEXT DEFAULT NULL,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);

-- Migrar dados existentes (atualmente 0 rows, mas safe para futuro)
INSERT INTO licencas_new
  SELECT id, CAST(funcionario_id AS INTEGER), tipo, numero,
         data_emissao, data_vencimento, observacoes,
         created_at, updated_at, deleted_at
  FROM licencas;

DROP TABLE licencas;
ALTER TABLE licencas_new RENAME TO licencas;

-- Índice de busca por funcionário
CREATE INDEX IF NOT EXISTS idx_licencas_funcionario ON licencas(funcionario_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_licencas_vencimento ON licencas(data_vencimento) WHERE deleted_at IS NULL;

PRAGMA foreign_keys = ON;
