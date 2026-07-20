-- ROLLBACK: 0437_setores_gestores_gestor_id_optional
-- Restaura schema anterior: gestor_id NOT NULL, sem CHECK constraint,
-- view com INNER JOIN em notificacoes_convocacao_cc_gestores,
-- índices legados (sem usuario_id).
--
-- source_reference: 02_migration_plan_setores_gestores_gestor_id_optional.md
-- operational_decision: MANAGER_OPERATIONS_FIX_ROLLED_BACK_NO_GO - rollback
--   restaura schema e dados identicos ao pre-migration
-- dry_run_required: nao (rollback)
-- rollback_plan_required: este arquivo eh o proprio rollback

PRAGMA foreign_keys = OFF;

-- Remove view antes do rebuild (SQLite 3.37 compat)
DROP VIEW IF EXISTS vw_setores_gestores_ativo;

CREATE TABLE setores_gestores_rollback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  setor_id INTEGER NOT NULL,
  gestor_id INTEGER NOT NULL,
  empresa_id INTEGER NOT NULL,
  role TEXT DEFAULT 'manager',
  ativo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  usuario_id INTEGER REFERENCES usuarios(id),

  FOREIGN KEY (setor_id) REFERENCES setores(id),
  FOREIGN KEY (gestor_id) REFERENCES notificacoes_convocacao_cc_gestores(id),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

INSERT INTO setores_gestores_rollback
  (id, setor_id, gestor_id, empresa_id, role, ativo, created_at, updated_at, deleted_at, usuario_id)
SELECT
  id, setor_id, gestor_id, empresa_id, role, ativo, created_at, updated_at, deleted_at, usuario_id
FROM setores_gestores;

DROP TABLE setores_gestores;
ALTER TABLE setores_gestores_rollback RENAME TO setores_gestores;

-- Restaura índices originais (sem usuario_id)
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

-- Restaura view original (INNER JOIN)
CREATE VIEW vw_setores_gestores_ativo AS
SELECT
  sg.id,
  sg.setor_id,
  sg.gestor_id,
  sg.empresa_id,
  sg.role,
  s.nome AS setor_nome,
  s.codigo AS setor_codigo,
  g.nome AS gestor_nome,
  g.email AS gestor_email,
  g.cargo AS gestor_cargo,
  sg.created_at
FROM setores_gestores sg
INNER JOIN setores s ON s.id = sg.setor_id
INNER JOIN notificacoes_convocacao_cc_gestores g ON g.id = sg.gestor_id
WHERE sg.deleted_at IS NULL
  AND sg.ativo = 1
  AND s.deleted_at IS NULL
  AND s.ativo = 1
  AND g.deleted_at IS NULL
  AND g.ativo = 1;

PRAGMA foreign_keys = ON;
SELECT
  sg.id,
  sg.setor_id,
  sg.gestor_id,
  sg.empresa_id,
  sg.role,
  s.nome AS setor_nome,
  s.codigo AS setor_codigo,
  g.nome AS gestor_nome,
  g.email AS gestor_email,
  g.cargo AS gestor_cargo,
  sg.created_at
FROM setores_gestores sg
INNER JOIN setores s ON s.id = sg.setor_id
INNER JOIN notificacoes_convocacao_cc_gestores g ON g.id = sg.gestor_id
WHERE sg.deleted_at IS NULL
  AND sg.ativo = 1
  AND s.deleted_at IS NULL
  AND s.ativo = 1
  AND g.deleted_at IS NULL
  AND g.ativo = 1;

PRAGMA foreign_keys = ON;
