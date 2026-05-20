-- ================================================================
-- Migration 0242: Alertas persistidos de Escalas
-- ================================================================

CREATE TABLE IF NOT EXISTS escala_alertas (
  id TEXT PRIMARY KEY,
  escala_id TEXT NOT NULL REFERENCES escalas_mensais(id),
  empresa_id INTEGER NOT NULL,
  tipo TEXT NOT NULL,
  funcionario_id TEXT,
  mensagem TEXT NOT NULL,
  resolvido INTEGER NOT NULL DEFAULT 0,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_escala_alertas_escala
  ON escala_alertas(escala_id, resolvido, deleted_at);

CREATE INDEX IF NOT EXISTS idx_escala_alertas_empresa
  ON escala_alertas(empresa_id, resolvido, created_at);
