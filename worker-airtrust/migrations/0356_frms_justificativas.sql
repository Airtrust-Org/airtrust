CREATE TABLE IF NOT EXISTS frms_justificativas (
  id TEXT PRIMARY KEY,
  tripulante_id TEXT NOT NULL,
  data_voo TEXT NOT NULL,
  empresa_id INTEGER NOT NULL,
  gerado_por_id TEXT NOT NULL,
  gerado_por_nome TEXT NOT NULL,
  decisao_tomada TEXT NOT NULL,
  observacoes TEXT,
  documento_json TEXT NOT NULL,
  assinatura_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_frms_just_empresa_trip
  ON frms_justificativas(empresa_id, tripulante_id, data_voo);
