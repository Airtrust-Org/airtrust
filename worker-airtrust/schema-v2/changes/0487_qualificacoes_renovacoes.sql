-- 0487_qualificacoes_renovacoes.sql
-- Canonical backing table for the active /api/qualificacoes/renovacoes routes.
-- Additive only. Tenant isolation is inherited through qualificacao_historico_id;
-- every runtime route joins qualificacoes_historico -> funcionarios and filters empresa_id.

CREATE TABLE IF NOT EXISTS qualificacoes_renovacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  qualificacao_historico_id INTEGER NOT NULL,
  data_renovacao_solicitada TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'aprovada', 'rejeitada')),
  observacoes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (qualificacao_historico_id) REFERENCES qualificacoes_historico(id)
);

CREATE INDEX IF NOT EXISTS idx_qualificacoes_renovacoes_historico
  ON qualificacoes_renovacoes (qualificacao_historico_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_qualificacoes_renovacoes_status_data
  ON qualificacoes_renovacoes (status, data_renovacao_solicitada DESC)
  WHERE deleted_at IS NULL;
