-- GAP 7 (PRC-OPS-009 §6.3.3): Ciência do recebimento da escala
CREATE TABLE IF NOT EXISTS escala_confirmacoes (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  escala_id TEXT NOT NULL,
  funcionario_id INTEGER NOT NULL,
  confirmado_em TEXT NOT NULL DEFAULT (datetime('now')),
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT DEFAULT NULL,
  FOREIGN KEY (escala_id) REFERENCES escalas_mensais(id),
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_escala_confirmacoes_unique
  ON escala_confirmacoes(escala_id, funcionario_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_escala_confirmacoes_escala
  ON escala_confirmacoes(escala_id)
  WHERE deleted_at IS NULL;
