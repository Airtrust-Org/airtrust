-- 0348_edapp_config_tenant_scope.sql
-- Permite chaves globais opcionais e overrides por empresa no EdApp.

DROP TRIGGER IF EXISTS trg_edapp_config_updated;

ALTER TABLE integracoes_edapp_config RENAME TO integracoes_edapp_config_old;

CREATE TABLE integracoes_edapp_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER REFERENCES empresas(id),
  chave TEXT NOT NULL,
  valor TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

INSERT INTO integracoes_edapp_config (id, empresa_id, chave, valor, created_at, updated_at, deleted_at)
SELECT id, empresa_id, chave, valor, created_at, updated_at, deleted_at
  FROM integracoes_edapp_config_old;

CREATE UNIQUE INDEX idx_edapp_config_global_unique
  ON integracoes_edapp_config(chave)
  WHERE empresa_id IS NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX idx_edapp_config_empresa_unique
  ON integracoes_edapp_config(empresa_id, chave)
  WHERE empresa_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_edapp_config_lookup
  ON integracoes_edapp_config(chave, empresa_id, deleted_at);

CREATE TRIGGER trg_edapp_config_updated
AFTER UPDATE ON integracoes_edapp_config FOR EACH ROW
BEGIN
  UPDATE integracoes_edapp_config SET updated_at = datetime('now') WHERE id = NEW.id;
END;

DROP TABLE integracoes_edapp_config_old;