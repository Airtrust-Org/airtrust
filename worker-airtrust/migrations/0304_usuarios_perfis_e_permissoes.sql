-- ============================================================
-- MIGRATION 0304: Sistema completo de Usuários, Perfis e Permissões
-- Data: 2026-03-26
-- Descrição:
--   1. Atualiza constraint do perfil em usuarios para novos papéis
--      (ADMINISTRADOR, GESTOR, INSTRUTOR, ALUNO)
--   2. Cria tabela usuario_permissoes para overrides por usuário
-- ============================================================

-- ============================================================
-- 1. ATUALIZAR PERFIL EM USUARIOS
--    SQLite não suporta ALTER COLUMN — recriar a tabela
-- ============================================================

DROP VIEW IF EXISTS vw_backups_monitoramento;

CREATE TABLE IF NOT EXISTS usuarios_v304 (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  email                  TEXT    NOT NULL UNIQUE,
  password_hash          TEXT    NOT NULL,
  nome                   TEXT    NOT NULL,
  perfil                 TEXT    NOT NULL DEFAULT 'ALUNO'
                         CHECK(perfil IN (
                           'ADMIN','ADMINISTRADOR',
                           'GESTOR',
                           'INSTRUTOR',
                           'ALUNO',
                           'COMPLIANCE',
                           'USUARIO'
                         )),
  funcionario_id         INTEGER,
  deleted_at             TEXT    DEFAULT NULL,
  created_at             TEXT    DEFAULT (datetime('now')),
  updated_at             TEXT    DEFAULT (datetime('now')),
  active                 INTEGER DEFAULT 1,
  last_login             TEXT,
  failed_login_attempts  INTEGER DEFAULT 0,
  locked_until           TEXT,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);

INSERT INTO usuarios_v304
  SELECT
    id, email, password_hash, nome,
    CASE perfil
      WHEN 'ADMIN'       THEN 'ADMINISTRADOR'
      WHEN 'GESTOR'      THEN 'GESTOR'
      WHEN 'COMPLIANCE'  THEN 'GESTOR'
      WHEN 'USUARIO'     THEN 'ALUNO'
      ELSE perfil
    END AS perfil,
    funcionario_id, deleted_at, created_at, updated_at,
    active, last_login, failed_login_attempts, locked_until
  FROM usuarios;

DROP TABLE usuarios;
ALTER TABLE usuarios_v304 RENAME TO usuarios;

-- Recriar índices
CREATE INDEX IF NOT EXISTS idx_usuarios_email      ON usuarios(email);
CREATE INDEX IF NOT EXISTS idx_usuarios_ativo      ON usuarios(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_usuarios_perfil     ON usuarios(perfil);
CREATE INDEX IF NOT EXISTS idx_usuarios_funcionario ON usuarios(funcionario_id);

-- ============================================================
-- 2. TABELA DE PERMISSÕES POR USUÁRIO
--    Overrides individuais sobre as permissões padrão do perfil
-- ============================================================

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

-- ============================================================
-- 3. ATUALIZAR usuarios_empresas PARA USAR PERFIL NORMALIZADO
-- ============================================================

-- Normalizar roles em usuarios_empresas (se existir)
UPDATE usuarios_empresas SET role = 'ADMINISTRADOR' WHERE role IN ('admin', 'ADMIN');
UPDATE usuarios_empresas SET role = 'GESTOR'        WHERE role IN ('manager', 'MANAGER', 'compliance', 'COMPLIANCE');
UPDATE usuarios_empresas SET role = 'INSTRUTOR'     WHERE role IN ('instructor', 'INSTRUCTOR');
UPDATE usuarios_empresas SET role = 'ALUNO'         WHERE role IN ('student', 'STUDENT', 'user', 'USER', 'viewer', 'VIEWER', 'editor', 'EDITOR', 'usuario', 'USUARIO');

CREATE VIEW IF NOT EXISTS vw_backups_monitoramento AS
SELECT 
  bc.id,
  bc.uuid,
  bc.tipo,
  bc.escopo,
  bc.status,
  bc.tamanho_bytes,
  bc.total_registros,
  bc.duracao_segundos,
  bc.triggered_by,
  bc.retention_policy,
  bc.expires_at,
  bc.created_at,
  bc.restaurado_em,
  u1.nome as criado_por_nome,
  u2.nome as restaurado_por_nome,
  CASE 
    WHEN bc.expires_at < datetime('now') THEN 'EXPIRADO'
    WHEN bc.expires_at < datetime('now', '+30 days') THEN 'EXPIRANDO_EM_BREVE'
    ELSE 'ATIVO'
  END as status_retencao,
  (SELECT COUNT(*) FROM backups_logs WHERE backups_controle_id = bc.id AND nivel = 'ERROR') as total_erros
FROM backups_controle bc
LEFT JOIN usuarios u1 ON bc.usuarios_id = u1.id
LEFT JOIN usuarios u2 ON bc.restaurado_por = u2.id
WHERE bc.deleted_at IS NULL
ORDER BY bc.created_at DESC;

SELECT 'Migration 0304 completed: usuarios perfil atualizado + usuario_permissoes criada' as message;
