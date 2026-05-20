-- ============================================================
-- D1 LOCAL SEED: Auth schema mínimo + usuário admin
-- Uso: wrangler d1 execute airtrust-db-dev --local --file scripts/d1-seed-auth.sql
-- ============================================================

PRAGMA foreign_keys=ON;

-- Tabela de Usuários (compatível com worker-airtrust/src/routes/auth.ts)
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nome TEXT NOT NULL,
  perfil TEXT NOT NULL DEFAULT 'USUARIO' CHECK(perfil IN ('ADMIN','GESTOR','USUARIO','COMPLIANCE')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);
CREATE INDEX IF NOT EXISTS idx_usuarios_active ON usuarios(active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_usuarios_deleted ON usuarios(deleted_at);

-- Tabela de Refresh Tokens
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT,
  FOREIGN KEY (user_id) REFERENCES usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);

-- Usuário admin padrão (senha: Admin@123)
INSERT INTO usuarios (email, password_hash, nome, perfil, active)
SELECT 'admin@airtrust.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY8h5N1fK5CZY8e', 'Administrador AirTrust', 'ADMIN', 1
WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE email = 'admin@airtrust.com');

-- Usuário manager (senha: Manager@123)
INSERT INTO usuarios (email, password_hash, nome, perfil, active)
SELECT 'manager@airtrust.com', '$2b$12$N9qo8uLOickgQ2ZEgzJ8TOcGFyHITJqxKZ4v.NG/2tQz5gLxK3l7e', 'Gerente AirTrust', 'GESTOR', 1
WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE email = 'manager@airtrust.com');

-- Usuário padrão (senha: User@123)
INSERT INTO usuarios (email, password_hash, nome, perfil, active)
SELECT 'user@airtrust.com', '$2b$12$wKJ8WBfVmYsX9qYZ7vN6/.Qv5gYfW8X1Ey4lP6zQ3mN7oT8kR9sL2', 'Usuário AirTrust', 'USUARIO', 1
WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE email = 'user@airtrust.com');

-- Diagnóstico rápido
SELECT 'usuarios' AS table_name, COUNT(*) AS total FROM usuarios;
SELECT 'refresh_tokens' AS table_name, COUNT(*) AS total FROM refresh_tokens;
