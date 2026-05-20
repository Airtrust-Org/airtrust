-- ============================================================
-- MIGRATION 0305: Adiciona tabelas que faltaram em 0304
-- Cria convites_usuarios e usuario_permissoes que não puderam
-- ser criadas via migration 0304 devido a FK constraint
-- ============================================================

-- Convites de usuário
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

-- Permissões individuais por usuário (overrides GRANT/DENY sobre o role)
CREATE TABLE IF NOT EXISTS usuario_permissoes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  permissao   TEXT    NOT NULL,
  tipo        TEXT    NOT NULL DEFAULT 'GRANT'
              CHECK(tipo IN ('GRANT', 'DENY')),
  created_by  INTEGER REFERENCES usuarios(id),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(usuario_id, permissao)
);

CREATE INDEX IF NOT EXISTS idx_usuario_permissoes_usuario ON usuario_permissoes(usuario_id);

-- Normalizar perfil em usuarios (UPDATE, sem recriar a tabela)
UPDATE usuarios SET perfil = 'ADMINISTRADOR' WHERE perfil = 'ADMIN';
UPDATE usuarios SET perfil = 'GESTOR'        WHERE perfil = 'COMPLIANCE';
UPDATE usuarios SET perfil = 'ALUNO'         WHERE perfil = 'USUARIO';

-- Normalizar roles em usuarios_empresas (se existir)
UPDATE usuarios_empresas SET role = 'ADMINISTRADOR' WHERE role IN ('admin', 'ADMIN');
UPDATE usuarios_empresas SET role = 'GESTOR'        WHERE role IN ('manager', 'MANAGER', 'compliance', 'COMPLIANCE');
UPDATE usuarios_empresas SET role = 'INSTRUTOR'     WHERE role IN ('instructor', 'INSTRUCTOR');
UPDATE usuarios_empresas SET role = 'ALUNO'         WHERE role IN ('student', 'STUDENT', 'user', 'USER', 'viewer', 'VIEWER', 'editor', 'EDITOR', 'usuario', 'USUARIO');

SELECT 'Migration 0305 completed: convites_usuarios + usuario_permissoes criadas, perfis normalizados' as message;
