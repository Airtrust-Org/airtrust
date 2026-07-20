-- Migration: 0437_setores_gestores_gestor_id_optional
-- Date: 2026-07-19
-- Description: Torna gestor_id opcional no caminho moderno (usuario_id),
--   preservando 100% dos registros legados. Exige que ao menos um dos dois
--   (gestor_id OU usuario_id) esteja preenchido via CHECK constraint.
--   Versiona os 7 índices tenant-safe que existiam apenas em drift.
--   Corrige a view vw_setores_gestores_ativo para LEFT JOIN incluindo
--   gestores vinculados somente por usuario_id.
--
-- source_reference: 02_migration_plan_setores_gestores_gestor_id_optional.md
-- operational_decision: MANAGER_OPERATIONS_FIX_GO - tornar gestor_id opcional
--   com CHECK constraint, versionar indices em drift, corrigir view
-- dry_run_required: sim - executar em staging antes de producao
-- rollback_plan_required: 0437_setores_gestores_gestor_id_optional_rollback.sql

PRAGMA foreign_keys = OFF;

-- =========================================================================
-- 0. Remover view antes do rebuild para evitar revalidação de schema
--    contra tabela temporariamente ausente (SQLite 3.37 compat).
-- =========================================================================

DROP VIEW IF EXISTS vw_setores_gestores_ativo;

-- =========================================================================
-- 1. Rebuild com gestor_id opcional + CHECK constraint
-- =========================================================================

CREATE TABLE setores_gestores_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  setor_id INTEGER NOT NULL,
  gestor_id INTEGER,
  empresa_id INTEGER NOT NULL,
  role TEXT DEFAULT 'manager',
  ativo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  usuario_id INTEGER REFERENCES usuarios(id),

  FOREIGN KEY (setor_id) REFERENCES setores(id),
  FOREIGN KEY (gestor_id) REFERENCES notificacoes_convocacao_cc_gestores(id),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),

  CHECK (gestor_id IS NOT NULL OR usuario_id IS NOT NULL)
);

INSERT INTO setores_gestores_new
  (id, setor_id, gestor_id, empresa_id, role, ativo, created_at, updated_at, deleted_at, usuario_id)
SELECT
  id, setor_id, gestor_id, empresa_id, role, ativo, created_at, updated_at, deleted_at, usuario_id
FROM setores_gestores;

DROP TABLE setores_gestores;
ALTER TABLE setores_gestores_new RENAME TO setores_gestores;

-- =========================================================================
-- 2. Índices tenant-safe (versionando o que existia em drift nos 3 ambientes)
-- =========================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_setores_gestores_unique
  ON setores_gestores(setor_id, gestor_id, empresa_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_setores_gestores_setor
  ON setores_gestores(setor_id, empresa_id, ativo)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_setores_gestores_gestor
  ON setores_gestores(gestor_id, empresa_id, ativo)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_setores_gestores_empresa
  ON setores_gestores(empresa_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_setores_gestores_role
  ON setores_gestores(role, ativo)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_setores_gestores_usuario
  ON setores_gestores(usuario_id, empresa_id, ativo)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_setores_gestores_usuario_unique
  ON setores_gestores(setor_id, usuario_id, empresa_id)
  WHERE deleted_at IS NULL AND usuario_id IS NOT NULL;

-- =========================================================================
-- 3. View corrigida: LEFT JOIN para não excluir gestores usuario_id-only
-- =========================================================================

CREATE VIEW vw_setores_gestores_ativo AS
SELECT
  sg.id,
  sg.setor_id,
  sg.gestor_id,
  sg.usuario_id,
  sg.empresa_id,
  sg.role,
  s.nome AS setor_nome,
  s.codigo AS setor_codigo,
  COALESCE(u.nome, g.nome) AS gestor_nome,
  COALESCE(u.email, g.email) AS gestor_email,
  g.cargo AS gestor_cargo,
  sg.created_at
FROM setores_gestores sg
INNER JOIN setores s ON s.id = sg.setor_id
LEFT JOIN notificacoes_convocacao_cc_gestores g
  ON g.id = sg.gestor_id AND g.deleted_at IS NULL AND g.ativo = 1
LEFT JOIN usuarios u
  ON u.id = sg.usuario_id AND u.deleted_at IS NULL
WHERE sg.deleted_at IS NULL
  AND sg.ativo = 1
  AND s.deleted_at IS NULL
  AND s.ativo = 1
  AND (g.id IS NOT NULL OR u.id IS NOT NULL);

PRAGMA foreign_keys = ON;
SELECT
  sg.id,
  sg.setor_id,
  sg.gestor_id,
  sg.usuario_id,
  sg.empresa_id,
  sg.role,
  s.nome AS setor_nome,
  s.codigo AS setor_codigo,
  COALESCE(u.nome, g.nome) AS gestor_nome,
  COALESCE(u.email, g.email) AS gestor_email,
  g.cargo AS gestor_cargo,
  sg.created_at
FROM setores_gestores sg
INNER JOIN setores s ON s.id = sg.setor_id
LEFT JOIN notificacoes_convocacao_cc_gestores g
  ON g.id = sg.gestor_id AND g.deleted_at IS NULL AND g.ativo = 1
LEFT JOIN usuarios u
  ON u.id = sg.usuario_id AND u.deleted_at IS NULL
WHERE sg.deleted_at IS NULL
  AND sg.ativo = 1
  AND s.deleted_at IS NULL
  AND s.ativo = 1
  AND (g.id IS NOT NULL OR u.id IS NOT NULL);

PRAGMA foreign_keys = ON;
