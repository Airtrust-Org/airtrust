-- Migration: 0359_setores_gestores_many_to_many
-- Date: 2026-05-04
-- Description: Create many-to-many relationship between setores and gestores_cc
-- This enables assigning multiple CC managers to each department/sector

-- 1. Create the junction table
CREATE TABLE IF NOT EXISTS setores_gestores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  setor_id INTEGER NOT NULL,
  gestor_id INTEGER NOT NULL,
  empresa_id INTEGER NOT NULL,
  role TEXT DEFAULT 'manager', -- 'manager', 'backup', 'observer'
  ativo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  
  -- Foreign keys
  FOREIGN KEY (setor_id) REFERENCES setores(id),
  FOREIGN KEY (gestor_id) REFERENCES notificacoes_convocacao_cc_gestores(id),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

-- 2. Create UNIQUE constraint to prevent duplicate assignments (excluding soft-deleted)
CREATE UNIQUE INDEX IF NOT EXISTS idx_setores_gestores_unique
  ON setores_gestores(setor_id, gestor_id, empresa_id)
  WHERE deleted_at IS NULL;

-- 3. Create indexes for performance
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

-- 4. Create a view for easy querying of gestor-setor mappings
CREATE VIEW IF NOT EXISTS vw_setores_gestores_ativo AS
SELECT 
  sg.id,
  sg.setor_id,
  sg.gestor_id,
  sg.empresa_id,
  sg.role,
  s.nome as setor_nome,
  s.codigo as setor_codigo,
  g.nome as gestor_nome,
  g.email as gestor_email,
  g.cargo as gestor_cargo,
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

-- 5. Create a view for querying gestores by setor
CREATE VIEW IF NOT EXISTS vw_gestores_por_setor AS
SELECT 
  f.setor_id,
  s.nome as setor_nome,
  s.empresa_id,
  sg.gestor_id,
  g.id,
  g.nome,
  g.email,
  g.cargo,
  g.empresa,
  sg.role
FROM funcionarios f
INNER JOIN setores s ON s.id = f.setor_id
INNER JOIN setores_gestores sg ON sg.setor_id = s.id AND sg.empresa_id = s.empresa_id
INNER JOIN notificacoes_convocacao_cc_gestores g ON g.id = sg.gestor_id
WHERE f.deleted_at IS NULL
  AND s.deleted_at IS NULL
  AND sg.deleted_at IS NULL
  AND sg.ativo = 1
  AND s.ativo = 1
  AND g.deleted_at IS NULL
  AND g.ativo = 1;
