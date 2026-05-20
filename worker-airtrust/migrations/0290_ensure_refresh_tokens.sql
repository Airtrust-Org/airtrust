-- ============================================================
-- MIGRATION 0290: Garante existência de refresh_tokens
-- Setup fresh: cria tabela se não existir.
-- Produção: no-op (tabela já existe).
-- ============================================================

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL,
  token        TEXT    NOT NULL UNIQUE,
  access_token_jti TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  expires_at   TEXT    NOT NULL,
  revoked_at   TEXT,
  FOREIGN KEY (user_id) REFERENCES usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user    ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token   ON refresh_tokens(token);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);

-- Convites de usuário (movido de DDL runtime para migration)
CREATE TABLE IF NOT EXISTS convites_usuarios (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  token      TEXT    NOT NULL UNIQUE,
  usuario_id INTEGER NOT NULL,
  empresa_id INTEGER NOT NULL,
  email      TEXT    NOT NULL,
  role       TEXT,
  created_by INTEGER,
  expires_at TEXT    NOT NULL,
  used_at    TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

CREATE INDEX IF NOT EXISTS idx_convites_token ON convites_usuarios(token);
