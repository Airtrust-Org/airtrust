-- Migration 0473: Multi-profile session (usuarios_empresas_perfis)

CREATE TABLE IF NOT EXISTS usuarios_empresas_perfis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL,
  empresa_id INTEGER NOT NULL,
  perfil TEXT NOT NULL,
  ativo INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(usuario_id, empresa_id, perfil)
);

CREATE INDEX IF NOT EXISTS idx_usuarios_empresas_perfis_lookup 
  ON usuarios_empresas_perfis(usuario_id, empresa_id, ativo);

-- Backfill data based on the current canonical role (for backward compatibility and avoiding downtime)
-- We insert the current `role` from `usuarios_empresas` as an explicit profile.
INSERT OR IGNORE INTO usuarios_empresas_perfis (usuario_id, empresa_id, perfil, ativo, created_at, updated_at)
SELECT usuario_id, empresa_id, role, 1, datetime('now'), datetime('now')
FROM usuarios_empresas
WHERE role IS NOT NULL AND role != '';


-- Forçar atribuição de perfis múltiplos para Wilson Neri, se ele existir
INSERT OR IGNORE INTO usuarios_empresas_perfis (usuario_id, empresa_id, perfil, ativo, created_at, updated_at)
SELECT u.id, ue.empresa_id, 'GESTOR', 1, datetime('now'), datetime('now')
FROM usuarios u
JOIN usuarios_empresas ue ON ue.usuario_id = u.id
WHERE u.email = 'wilson.nery@voecostadosol.com.br';

INSERT OR IGNORE INTO usuarios_empresas_perfis (usuario_id, empresa_id, perfil, ativo, created_at, updated_at)
SELECT u.id, ue.empresa_id, 'INSTRUTOR', 1, datetime('now'), datetime('now')
FROM usuarios u
JOIN usuarios_empresas ue ON ue.usuario_id = u.id
WHERE u.email = 'wilson.nery@voecostadosol.com.br';

INSERT OR IGNORE INTO usuarios_empresas_perfis (usuario_id, empresa_id, perfil, ativo, created_at, updated_at)
SELECT u.id, ue.empresa_id, 'ALUNO', 1, datetime('now'), datetime('now')
FROM usuarios u
JOIN usuarios_empresas ue ON ue.usuario_id = u.id
WHERE u.email = 'wilson.nery@voecostadosol.com.br';
