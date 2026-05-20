CREATE TABLE IF NOT EXISTS alertas_whatsapp_delivery (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER,
  qualificacao_historico_id INTEGER,
  funcionario_id INTEGER,
  provider TEXT NOT NULL,
  provider_message_id TEXT NOT NULL UNIQUE,
  telefone_destino TEXT,
  telefone_origem TEXT,
  status TEXT NOT NULL,
  error_code TEXT,
  error_message TEXT,
  payload_json TEXT,
  accepted_at TEXT,
  delivered_at TEXT,
  failed_at TEXT,
  last_event_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_alertas_whatsapp_delivery_empresa_status
  ON alertas_whatsapp_delivery (empresa_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_alertas_whatsapp_delivery_historico
  ON alertas_whatsapp_delivery (qualificacao_historico_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_alertas_whatsapp_delivery_funcionario
  ON alertas_whatsapp_delivery (funcionario_id, updated_at DESC);