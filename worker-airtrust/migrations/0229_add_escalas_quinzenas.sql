-- Migration 0229: Add escalas_quinzenas table
-- Allows pre-defining quinzena date ranges per month/year (with holiday adjustments)

CREATE TABLE IF NOT EXISTS escalas_quinzenas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL,       -- 1-12
  numero INTEGER NOT NULL,   -- 1 = first half, 2 = second half
  data_inicio TEXT NOT NULL, -- YYYY-MM-DD
  data_fim TEXT NOT NULL,    -- YYYY-MM-DD
  observacoes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  UNIQUE(empresa_id, ano, mes, numero)
);

CREATE INDEX IF NOT EXISTS idx_escalas_quinzenas_empresa_ano
  ON escalas_quinzenas(empresa_id, ano);
