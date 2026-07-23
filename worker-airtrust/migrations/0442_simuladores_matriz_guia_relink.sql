-- Separate, small, atomic executor for the 51 simuladores_modelos_sessao_guias
-- links only. Purely additive: does not touch modelos_sessao, manobras,
-- modelos_sessao_manobras, modelos_sessao_versionamento or any table from
-- migrations 0440/0441.
--
-- OPERATIONAL MARKERS (guard:operational-sql-sources):
-- source_reference: nenhum dado de tenant é inserido por esta migration.
-- operational_decision: manter a ativação da matriz (0440/0441) e o relink
--   dos 51 guias em transações D1 batch() atômicas separadas e pequenas, em
--   vez de uma única transação gigante cobrindo matriz+guias.
-- dry_run_required: nenhuma escrita de dados por esta migration; a tabela é
--   populada apenas pelo executor worker-airtrust/src/routes/admin-simuladores-guias-relink-executor.ts.
-- rollback_plan_required: DROP do trigger e das duas tabelas abaixo; nenhuma
--   outra tabela é afetada.

CREATE TABLE IF NOT EXISTS simuladores_matriz_guia_relink (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  empresa_id INTEGER NOT NULL,
  versao_matriz TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('APPLYING', 'APPLIED', 'ROLLED_BACK', 'FAILED')),
  expected_hash TEXT NOT NULL CHECK(length(expected_hash) = 64),
  expected_counts_json TEXT NOT NULL CHECK(json_valid(expected_counts_json) AND length(expected_counts_json) <= 4096),
  failure_reason TEXT,
  rollback_uuid TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applied_at TEXT,
  rolled_back_at TEXT,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);
CREATE INDEX IF NOT EXISTS idx_simuladores_matriz_guia_relink_tenant
  ON simuladores_matriz_guia_relink(empresa_id, created_at DESC);

CREATE TABLE IF NOT EXISTS simuladores_matriz_guia_relink_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  relink_id INTEGER NOT NULL,
  guia_id INTEGER NOT NULL,
  modelo_sessao_id INTEGER,
  operacao TEXT NOT NULL CHECK(operacao IN (
    'GUIDE_LINK_DEACTIVATE', 'GUIDE_LINK_INSERT', 'GUIDE_LINK_RESTORE', 'GUIDE_LINK_COMPENSATE'
  )),
  before_json TEXT CHECK(before_json IS NULL OR (json_valid(before_json) AND length(before_json) <= 4096)),
  after_json TEXT CHECK(after_json IS NULL OR (json_valid(after_json) AND length(after_json) <= 4096)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (relink_id) REFERENCES simuladores_matriz_guia_relink(id)
);
CREATE INDEX IF NOT EXISTS idx_simuladores_matriz_guia_relink_changes_relink
  ON simuladores_matriz_guia_relink_changes(relink_id);
CREATE INDEX IF NOT EXISTS idx_simuladores_matriz_guia_relink_changes_guia
  ON simuladores_matriz_guia_relink_changes(guia_id);

-- A change row is an audited historical fact once written.
CREATE TRIGGER IF NOT EXISTS trg_guia_relink_changes_imutavel
BEFORE UPDATE ON simuladores_matriz_guia_relink_changes
BEGIN
  SELECT RAISE(ABORT, 'auditoria de relink de guias é imutável');
END;

-- Terminal assertion for the flip to APPLIED. D1 executes a batch()
-- atomically; RAISE(ABORT) here rolls back every earlier statement in the
-- same batch (deactivations and inserts included), so APPLIED can never
-- describe a partial or invalid relink. Mirrors the proven pattern already
-- used by migration 0440/0441's executor for the matrix itself.
CREATE TRIGGER IF NOT EXISTS trg_guia_relink_applied_assertions
BEFORE UPDATE OF status ON simuladores_matriz_guia_relink
WHEN OLD.status = 'APPLYING' AND NEW.status = 'APPLIED'
BEGIN
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM simuladores_matriz_guia_relink_changes
    WHERE relink_id = NEW.id AND operacao = 'GUIDE_LINK_INSERT'
  ) = 0 THEN RAISE(ABORT, 'guia relink assertion: nenhum vínculo inserido') END;

  SELECT CASE WHEN (
    SELECT COUNT(*) FROM simuladores_modelos_sessao_guias g
    JOIN modelos_sessao_versionamento v ON v.modelo_id = g.modelo_sessao_id
    WHERE g.empresa_id = NEW.empresa_id AND g.deleted_at IS NULL AND v.is_current = 1
      AND v.versao_matriz = NEW.versao_matriz
      AND g.guia_id IN (SELECT guia_id FROM simuladores_matriz_guia_relink_changes WHERE relink_id = NEW.id AND operacao = 'GUIDE_LINK_INSERT')
  ) <> (SELECT json_extract(NEW.expected_counts_json, '$.total'))
    THEN RAISE(ABORT, 'guia relink assertion: total de vínculos ativos diverge do esperado') END;

  SELECT CASE WHEN EXISTS (
    SELECT guia_id FROM simuladores_modelos_sessao_guias
    WHERE empresa_id = NEW.empresa_id AND deleted_at IS NULL
      AND guia_id IN (SELECT guia_id FROM simuladores_matriz_guia_relink_changes WHERE relink_id = NEW.id AND operacao = 'GUIDE_LINK_INSERT')
    GROUP BY guia_id HAVING COUNT(*) <> 1
  ) THEN RAISE(ABORT, 'guia relink assertion: guia sem vínculo ativo único') END;

  SELECT CASE WHEN EXISTS (
    SELECT modelo_sessao_id FROM simuladores_modelos_sessao_guias
    WHERE empresa_id = NEW.empresa_id AND deleted_at IS NULL
      AND modelo_sessao_id IN (
        SELECT modelo_sessao_id FROM simuladores_matriz_guia_relink_changes
        WHERE relink_id = NEW.id AND operacao = 'GUIDE_LINK_INSERT' AND modelo_sessao_id IS NOT NULL
      )
    GROUP BY modelo_sessao_id HAVING COUNT(*) <> 1
  ) THEN RAISE(ABORT, 'guia relink assertion: modelo com mais de um guia principal') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM simuladores_modelos_sessao_guias g
    JOIN modelos_sessao_versionamento v ON v.modelo_id = g.modelo_sessao_id
    WHERE g.empresa_id = NEW.empresa_id AND g.deleted_at IS NULL AND v.is_current = 0
      AND g.guia_id IN (SELECT guia_id FROM simuladores_matriz_guia_relink_changes WHERE relink_id = NEW.id AND operacao = 'GUIDE_LINK_INSERT')
  ) THEN RAISE(ABORT, 'guia relink assertion: vínculo ativo para versão histórica') END;
END;

-- Terminal assertion for the flip to ROLLED_BACK: every link this relink
-- inserted must now be inactive, and every link it deactivated must now be
-- active again — otherwise the compensation is incomplete and the whole
-- rollback batch aborts, leaving the relink APPLIED.
CREATE TRIGGER IF NOT EXISTS trg_guia_relink_rolled_back_assertions
BEFORE UPDATE OF status ON simuladores_matriz_guia_relink
WHEN OLD.status = 'APPLIED' AND NEW.status = 'ROLLED_BACK'
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM simuladores_matriz_guia_relink_changes c
    WHERE c.relink_id = NEW.id AND c.operacao = 'GUIDE_LINK_INSERT'
      AND EXISTS (
        SELECT 1 FROM simuladores_modelos_sessao_guias g
        WHERE g.empresa_id = NEW.empresa_id AND g.deleted_at IS NULL
          AND g.guia_id = c.guia_id AND g.modelo_sessao_id = c.modelo_sessao_id
      )
  ) THEN RAISE(ABORT, 'guia relink rollback assertion: vínculo inserido pelo relink ainda ativo') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM simuladores_matriz_guia_relink_changes c
    WHERE c.relink_id = NEW.id AND c.operacao = 'GUIDE_LINK_DEACTIVATE'
      AND NOT EXISTS (
        SELECT 1 FROM simuladores_modelos_sessao_guias g
        WHERE g.empresa_id = NEW.empresa_id AND g.deleted_at IS NULL
          AND g.guia_id = c.guia_id AND g.modelo_sessao_id = c.modelo_sessao_id
      )
  ) THEN RAISE(ABORT, 'guia relink rollback assertion: vínculo anterior não restaurado') END;
END;
