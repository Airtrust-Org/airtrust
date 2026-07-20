-- ROLLBACK: 0437_setores_gestores_gestor_id_optional
-- Restaura o schema anterior: gestor_id NOT NULL, sem CHECK constraint,
-- view com INNER JOIN em notificacoes_convocacao_cc_gestores,
-- índices legados (sem usuario_id).
--
-- Exceção operacional documentada:
--   Esta migration original (0437) foi aplicada em produção com sucesso.
--   O SQL original desta migration contém um SELECT final duplicado de compatibilidade,
--   o qual foi mantido intacto na migração original mas corrigido conceitualmente no rollback.
--
-- Plano de Contingência Seguro:
--   O rollback recusa-se a prosseguir se houver alguma linha moderna (onde gestor_id IS NULL).
--   A ação exige exportação prévia de quaisquer dados modernos e remoção controlada
--   destes registros antes de aplicar o rollback.
--
-- source_reference: 02_migration_plan_setores_gestores_gestor_id_optional.md
-- operational_decision: MANAGER_OPERATIONS_FIX_ROLLED_BACK_NO_GO - rollback seguro
-- dry_run_required: sim - validar em SQLite local ou staging
-- rollback_plan_required: este arquivo é o próprio rollback

PRAGMA foreign_keys = OFF;

-- =========================================================================
-- 1. PREFLIGHT COMPATIBILIDADE - GATILHOS DE SEGURANÇA (SAFE PREFLIGHT)
-- =========================================================================

-- Criamos uma tabela temporária de assertiva para garantir que nenhuma linha
-- possui gestor_id IS NULL (linhas modernas). Se houver, a inserção falhará
-- na CHECK constraint e abortará o rollback silencioso/desastroso.
CREATE TABLE IF NOT EXISTS _rollback_0437_safety_guard (
  safe_to_rollback INTEGER NOT NULL CHECK (safe_to_rollback = 1)
);

INSERT INTO _rollback_0437_safety_guard (safe_to_rollback)
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM setores_gestores WHERE gestor_id IS NULL) THEN 0
  ELSE 1
END;

DROP TABLE IF EXISTS _rollback_0437_safety_guard;

-- =========================================================================
-- 2. Remover view antes do rebuild (SQLite 3.37 compat)
-- =========================================================================
DROP VIEW IF EXISTS vw_setores_gestores_ativo;

-- =========================================================================
-- 3. Rebuild da tabela setores_gestores com gestor_id NOT NULL
-- =========================================================================
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

-- Copia os dados preservando integralmente as linhas legadas
INSERT INTO setores_gestores_rollback
  (id, setor_id, gestor_id, empresa_id, role, ativo, created_at, updated_at, deleted_at, usuario_id)
SELECT
  id, setor_id, gestor_id, empresa_id, role, ativo, created_at, updated_at, deleted_at, usuario_id
FROM setores_gestores;

DROP TABLE setores_gestores;
ALTER TABLE setores_gestores_rollback RENAME TO setores_gestores;

-- =========================================================================
-- 4. Restaura índices originais (sem usuario_id)
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

-- =========================================================================
-- 5. Restaura view original (INNER JOIN)
-- =========================================================================
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
