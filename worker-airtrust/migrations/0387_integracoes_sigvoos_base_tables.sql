-- AirTrust - SIGVOOS base tables extracted from ensureSigvoosTables()
-- Scope: create the 3 base tables and 4 indexes still provisioned in runtime.
-- Intentionally additive and idempotent. No backfill. No destructive changes.
-- Note: this migration versions only the runtime-defined base schema; it does not
-- rewrite earlier migrations such as 0354 that patch integracoes_sigvoos_config.

CREATE TABLE IF NOT EXISTS integracoes_sigvoos_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER,
  chave TEXT NOT NULL,
  valor TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_integracoes_sigvoos_config_empresa_chave
  ON integracoes_sigvoos_config(empresa_id, chave);

CREATE TABLE IF NOT EXISTS integracoes_sigvoos_eventos (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER,
  tipo_evento TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT,
  resposta_json TEXT,
  erro_ultima TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_integracoes_sigvoos_eventos_empresa_created
  ON integracoes_sigvoos_eventos(empresa_id, created_at DESC);

CREATE TABLE IF NOT EXISTS integracoes_sigvoos_mapeamentos (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER,
  nome_sigvoos TEXT NOT NULL,
  canac_sigvoos TEXT,
  funcionario_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_integracoes_sigvoos_mapeamentos_empresa_nome
  ON integracoes_sigvoos_mapeamentos(empresa_id, nome_sigvoos);

CREATE INDEX IF NOT EXISTS idx_integracoes_sigvoos_mapeamentos_empresa_canac
  ON integracoes_sigvoos_mapeamentos(empresa_id, canac_sigvoos);
