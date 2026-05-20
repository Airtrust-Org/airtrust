-- Tabela para armazenar configurações gerais da integração EdApp (ex: webhook_id)
CREATE TABLE IF NOT EXISTS integracoes_edapp_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chave TEXT NOT NULL UNIQUE,
  valor TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_edapp_config_chave ON integracoes_edapp_config(chave, deleted_at);

CREATE TRIGGER IF NOT EXISTS trg_edapp_config_updated
AFTER UPDATE ON integracoes_edapp_config FOR EACH ROW
BEGIN
  UPDATE integracoes_edapp_config SET updated_at=datetime('now') WHERE id=NEW.id;
END;
