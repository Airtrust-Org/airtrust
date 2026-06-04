-- RBAC/Suporte v2 foundation: platform roles persistidos e grants/sessoes de suporte auditaveis.
-- Aditivo e local-only nesta etapa. Nao remove fallback legado nem ativa enforcement runtime por padrao.

CREATE TABLE IF NOT EXISTS user_platform_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  role_code TEXT NOT NULL
    CHECK(role_code IN ('platform_admin', 'support_read_only', 'support_elevated')),
  granted_by_user_id INTEGER,
  granted_reason TEXT NOT NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT,
  revoked_by_user_id INTEGER,
  revoked_reason TEXT,
  FOREIGN KEY (user_id) REFERENCES usuarios(id),
  FOREIGN KEY (granted_by_user_id) REFERENCES usuarios(id),
  FOREIGN KEY (revoked_by_user_id) REFERENCES usuarios(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_platform_roles_active_unique
  ON user_platform_roles (user_id, role_code)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_platform_roles_lookup
  ON user_platform_roles (role_code, user_id, expires_at, revoked_at);

CREATE TABLE IF NOT EXISTS support_access_grants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  empresa_id INTEGER NOT NULL,
  access_level TEXT NOT NULL
    CHECK(access_level IN ('read_only', 'elevated')),
  granted_by_user_id INTEGER,
  granted_reason TEXT NOT NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT,
  revoked_by_user_id INTEGER,
  revoked_reason TEXT,
  FOREIGN KEY (user_id) REFERENCES usuarios(id),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (granted_by_user_id) REFERENCES usuarios(id),
  FOREIGN KEY (revoked_by_user_id) REFERENCES usuarios(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_support_access_grants_active_unique
  ON support_access_grants (user_id, empresa_id, access_level)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_support_access_grants_lookup
  ON support_access_grants (empresa_id, user_id, access_level, expires_at, revoked_at);

CREATE TABLE IF NOT EXISTS support_access_sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  empresa_id INTEGER NOT NULL,
  access_level TEXT NOT NULL
    CHECK(access_level IN ('read_only', 'elevated')),
  support_reason TEXT NOT NULL,
  request_id TEXT,
  correlation_id TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES usuarios(id),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

CREATE INDEX IF NOT EXISTS idx_support_access_sessions_active
  ON support_access_sessions (empresa_id, user_id, ended_at, started_at);

CREATE INDEX IF NOT EXISTS idx_support_access_sessions_request
  ON support_access_sessions (request_id);
