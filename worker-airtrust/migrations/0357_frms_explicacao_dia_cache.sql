CREATE TABLE IF NOT EXISTS frms_explicacao_dia_cache (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER,
  tripulante_id TEXT NOT NULL,
  data_ref TEXT NOT NULL,
  origem_tela TEXT NOT NULL DEFAULT 'desconhecida',
  payload_json TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT,
  deleted_at TEXT,
  UNIQUE (empresa_id, tripulante_id, data_ref, origem_tela)
);

CREATE INDEX IF NOT EXISTS idx_frms_explicacao_cache_lookup
  ON frms_explicacao_dia_cache(empresa_id, tripulante_id, data_ref, origem_tela, expires_at);
