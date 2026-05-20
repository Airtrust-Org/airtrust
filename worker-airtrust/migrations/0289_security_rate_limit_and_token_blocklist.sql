-- ============================================================
-- MIGRATION 0289: Rate Limit Store + Token Blocklist + JTI
-- Audit fix: distributed rate limiting and JWT invalidation
-- ============================================================

-- Tabela de rate limiting distribuído (compartilhada entre worker instances)
CREATE TABLE IF NOT EXISTS rate_limit_store (
  key       TEXT PRIMARY KEY,
  count     INTEGER NOT NULL DEFAULT 0,
  reset_at  TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_limit_reset ON rate_limit_store(reset_at);

-- Tabela de blocklist de tokens JWT (para logout real)
-- JTI é revogado quando o usuário faz logout; verificado em cada request autenticado
CREATE TABLE IF NOT EXISTS token_blocklist (
  jti        TEXT PRIMARY KEY,
  revoked_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_token_blocklist_expires ON token_blocklist(expires_at);

-- Adicionar coluna jti em refresh_tokens (relaciona access token ao refresh)
-- Permite revogar o access token associado quando logout com refresh token
ALTER TABLE refresh_tokens ADD COLUMN access_token_jti TEXT;
