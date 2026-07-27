-- Rollback for worker-airtrust/migrations/0449_simuladores_check_faps_reconciliacao.sql.
--
-- Deliberately kept OUTSIDE worker-airtrust/migrations/: Wrangler discovers
-- every .sql file in that directory as an applicable migration, and a
-- same-directory rollback file risks being applied as the "next" migration,
-- silently undoing 0449 in the same pipeline run. Apply this file manually,
-- by explicit operator action, never through the migrations runner.
--
-- Like 0449, every target row is re-resolved here by canonical code and
-- tenant-safe join — no hardcoded production IDs. The rollback validates
-- the exact post-migration state before touching anything and aborts on
-- any drift, including new legitimate usage added since 0449 applied.

CREATE TABLE IF NOT EXISTS _0449rb_tenant (empresa_id INTEGER PRIMARY KEY);
DELETE FROM _0449rb_tenant;
INSERT INTO _0449rb_tenant (empresa_id)
SELECT ms.empresa_id
FROM modelos_sessao ms
JOIN modelos_sessao_versionamento msv
  ON msv.modelo_id = ms.id AND msv.empresa_id = ms.empresa_id AND msv.is_current = 1
WHERE msv.codigo_canonico IN (
  'A139-I-12/12',
  'A139-P-04/04-C1-CHECK', 'A139-P-04/04-C2-CHECK', 'A139-P-04/04-C3-CHECK',
  'A139-S-02/02-C1', 'A139-S-02/02-C2', 'A139-S-02/02-C3',
  'SK76-I-12/12', 'SK76-P-CHECK', 'SK76-S-02/02'
)
GROUP BY ms.empresa_id
HAVING COUNT(DISTINCT msv.codigo_canonico) = 10;

CREATE TABLE IF NOT EXISTS _0449rb_models (role TEXT PRIMARY KEY, modelo_id INTEGER NOT NULL);
DELETE FROM _0449rb_models;
INSERT INTO _0449rb_models (role, modelo_id) SELECT 'AW_INI', ms.id FROM modelos_sessao_versionamento msv JOIN modelos_sessao ms ON ms.id = msv.modelo_id AND ms.empresa_id = msv.empresa_id WHERE msv.codigo_canonico = 'A139-I-12/12' AND msv.is_current = 1 AND msv.empresa_id = (SELECT empresa_id FROM _0449rb_tenant);
INSERT INTO _0449rb_models (role, modelo_id) SELECT 'AW_PER_C1', ms.id FROM modelos_sessao_versionamento msv JOIN modelos_sessao ms ON ms.id = msv.modelo_id AND ms.empresa_id = msv.empresa_id WHERE msv.codigo_canonico = 'A139-P-04/04-C1-CHECK' AND msv.is_current = 1 AND msv.empresa_id = (SELECT empresa_id FROM _0449rb_tenant);
INSERT INTO _0449rb_models (role, modelo_id) SELECT 'AW_PER_C2', ms.id FROM modelos_sessao_versionamento msv JOIN modelos_sessao ms ON ms.id = msv.modelo_id AND ms.empresa_id = msv.empresa_id WHERE msv.codigo_canonico = 'A139-P-04/04-C2-CHECK' AND msv.is_current = 1 AND msv.empresa_id = (SELECT empresa_id FROM _0449rb_tenant);
INSERT INTO _0449rb_models (role, modelo_id) SELECT 'AW_PER_C3', ms.id FROM modelos_sessao_versionamento msv JOIN modelos_sessao ms ON ms.id = msv.modelo_id AND ms.empresa_id = msv.empresa_id WHERE msv.codigo_canonico = 'A139-P-04/04-C3-CHECK' AND msv.is_current = 1 AND msv.empresa_id = (SELECT empresa_id FROM _0449rb_tenant);
INSERT INTO _0449rb_models (role, modelo_id) SELECT 'SK_INI', ms.id FROM modelos_sessao_versionamento msv JOIN modelos_sessao ms ON ms.id = msv.modelo_id AND ms.empresa_id = msv.empresa_id WHERE msv.codigo_canonico = 'SK76-I-12/12' AND msv.is_current = 1 AND msv.empresa_id = (SELECT empresa_id FROM _0449rb_tenant);
INSERT INTO _0449rb_models (role, modelo_id) SELECT 'SK_PER', ms.id FROM modelos_sessao_versionamento msv JOIN modelos_sessao ms ON ms.id = msv.modelo_id AND ms.empresa_id = msv.empresa_id WHERE msv.codigo_canonico = 'SK76-P-CHECK' AND msv.is_current = 1 AND msv.empresa_id = (SELECT empresa_id FROM _0449rb_tenant);
INSERT INTO _0449rb_models (role, modelo_id) SELECT 'SK_SEM', ms.id FROM modelos_sessao_versionamento msv JOIN modelos_sessao ms ON ms.id = msv.modelo_id AND ms.empresa_id = msv.empresa_id WHERE msv.codigo_canonico = 'SK76-S-02/02' AND msv.is_current = 1 AND msv.empresa_id = (SELECT empresa_id FROM _0449rb_tenant);

CREATE TABLE IF NOT EXISTS _0449rb_quals (role TEXT PRIMARY KEY, qual_id INTEGER NOT NULL);
DELETE FROM _0449rb_quals;
INSERT INTO _0449rb_quals (role, qual_id) SELECT 'AW_FAP06', id FROM qualificacoes_tipos WHERE codigo = 'FAP6-139' AND empresa_id = (SELECT empresa_id FROM _0449rb_tenant) AND deleted_at IS NULL;
INSERT INTO _0449rb_quals (role, qual_id) SELECT 'SK_FAP06', id FROM qualificacoes_tipos WHERE codigo = 'FAP06-76' AND empresa_id = (SELECT empresa_id FROM _0449rb_tenant) AND deleted_at IS NULL;
INSERT INTO _0449rb_quals (role, qual_id) SELECT 'SK_IFR', id FROM qualificacoes_tipos WHERE codigo = 'IFR-SK76' AND empresa_id = (SELECT empresa_id FROM _0449rb_tenant) AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS _0449rb_preflight_guard (id INTEGER PRIMARY KEY CHECK(id = 1));
CREATE TRIGGER IF NOT EXISTS _0449rb_preflight_validate
BEFORE INSERT ON _0449rb_preflight_guard
BEGIN
  SELECT CASE WHEN (SELECT COUNT(*) FROM _0449rb_tenant) <> 1
    THEN RAISE(ABORT, '0449 rollback preflight: tenant nao resolvido de forma unica') END;
  SELECT CASE WHEN (SELECT COUNT(*) FROM _0449rb_models) <> 7
    THEN RAISE(ABORT, '0449 rollback preflight: nem todos os 7 modelos resolveram de forma unica') END;
  SELECT CASE WHEN (SELECT COUNT(*) FROM _0449rb_quals) <> 3
    THEN RAISE(ABORT, '0449 rollback preflight: nem todos os 3 codigos de qualificacao resolveram de forma unica') END;

  -- is_check must currently be 1 (the state 0449 created) for both flags.
  SELECT CASE WHEN (
    SELECT is_check FROM qualificacoes_tipos WHERE id = (SELECT qual_id FROM _0449rb_quals WHERE role = 'AW_FAP06')
  ) <> 1 THEN RAISE(ABORT, '0449 rollback preflight: FAP6-139 nao esta em is_check=1; nada a reverter ou estado ja divergente') END;
  SELECT CASE WHEN (
    SELECT is_check FROM qualificacoes_tipos WHERE id = (SELECT qual_id FROM _0449rb_quals WHERE role = 'SK_IFR')
  ) <> 1 THEN RAISE(ABORT, '0449 rollback preflight: IFR-SK76 nao esta em is_check=1; nada a reverter ou estado ja divergente') END;

  -- The exact 4 FAP6-139 links from 0449 must be active, and no others —
  -- if the count is anything other than exactly 4, either 0449 wasn't
  -- fully applied or something else has used this qualification since;
  -- abort either way rather than guess.
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM modelos_sessao_checks
    WHERE qualificacao_tipo_id = (SELECT qual_id FROM _0449rb_quals WHERE role = 'AW_FAP06') AND deleted_at IS NULL
  ) <> 4 THEN RAISE(ABORT, '0449 rollback preflight: numero de vinculos ativos de FAP6-139 nao e exatamente 4 (drift ou uso adicional desde a aplicacao)') END;

  SELECT CASE WHEN (
    SELECT COUNT(*) FROM modelos_sessao_checks msc
    JOIN _0449rb_models m ON m.modelo_id = msc.modelo_id AND m.role IN ('AW_INI', 'AW_PER_C1', 'AW_PER_C2', 'AW_PER_C3')
    WHERE msc.qualificacao_tipo_id = (SELECT qual_id FROM _0449rb_quals WHERE role = 'AW_FAP06') AND msc.deleted_at IS NULL
  ) <> 4 THEN RAISE(ABORT, '0449 rollback preflight: os 4 vinculos ativos de FAP6-139 nao correspondem exatamente aos 4 modelos esperados') END;

  SELECT CASE WHEN (
    SELECT COUNT(*) FROM modelos_sessao_checks
    WHERE qualificacao_tipo_id = (SELECT qual_id FROM _0449rb_quals WHERE role = 'SK_IFR') AND deleted_at IS NULL
  ) <> 3 THEN RAISE(ABORT, '0449 rollback preflight: numero de vinculos ativos de IFR-SK76 nao e exatamente 3 (drift ou uso adicional desde a aplicacao)') END;

  SELECT CASE WHEN (
    SELECT COUNT(*) FROM modelos_sessao_checks msc
    JOIN _0449rb_models m ON m.modelo_id = msc.modelo_id AND m.role IN ('SK_INI', 'SK_PER', 'SK_SEM')
    WHERE msc.qualificacao_tipo_id = (SELECT qual_id FROM _0449rb_quals WHERE role = 'SK_IFR') AND msc.deleted_at IS NULL
  ) <> 3 THEN RAISE(ABORT, '0449 rollback preflight: os 3 vinculos ativos de IFR-SK76 nao correspondem exatamente aos 3 modelos esperados') END;

  -- SK76-I-12/12's FAP06-76 link must also be exactly the one 0449 added
  -- (only 2 active links total for FAP06-76 tenant-wide: SK76-P-CHECK,
  -- which predates 0449, and SK76-I-12/12, which 0449 added).
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM modelos_sessao_checks msc
    JOIN _0449rb_models m ON m.modelo_id = msc.modelo_id AND m.role = 'SK_INI'
    WHERE msc.qualificacao_tipo_id = (SELECT qual_id FROM _0449rb_quals WHERE role = 'SK_FAP06') AND msc.deleted_at IS NULL
  ) <> 1 THEN RAISE(ABORT, '0449 rollback preflight: SK76-I-12/12 nao possui o vinculo FAP06-76 esperado') END;
END;
INSERT INTO _0449rb_preflight_guard(id) VALUES (1);
DROP TRIGGER IF EXISTS _0449rb_preflight_validate;
DROP TABLE IF EXISTS _0449rb_preflight_guard;

-- Remove exactly the links 0449 added.
DELETE FROM modelos_sessao_checks
WHERE qualificacao_tipo_id = (SELECT qual_id FROM _0449rb_quals WHERE role = 'AW_FAP06')
  AND modelo_id IN (SELECT modelo_id FROM _0449rb_models WHERE role IN ('AW_INI', 'AW_PER_C1', 'AW_PER_C2', 'AW_PER_C3'));

DELETE FROM modelos_sessao_checks
WHERE qualificacao_tipo_id = (SELECT qual_id FROM _0449rb_quals WHERE role = 'SK_FAP06')
  AND modelo_id = (SELECT modelo_id FROM _0449rb_models WHERE role = 'SK_INI');

DELETE FROM modelos_sessao_checks
WHERE qualificacao_tipo_id = (SELECT qual_id FROM _0449rb_quals WHERE role = 'SK_IFR')
  AND modelo_id IN (SELECT modelo_id FROM _0449rb_models WHERE role IN ('SK_INI', 'SK_PER', 'SK_SEM'));

UPDATE qualificacoes_tipos SET is_check = 0, updated_at = datetime('now')
WHERE id = (SELECT qual_id FROM _0449rb_quals WHERE role = 'AW_FAP06') AND is_check = 1;

UPDATE qualificacoes_tipos SET is_check = 0, updated_at = datetime('now')
WHERE id = (SELECT qual_id FROM _0449rb_quals WHERE role = 'SK_IFR') AND is_check = 1;

DROP TABLE IF EXISTS _0449rb_models;
DROP TABLE IF EXISTS _0449rb_quals;
DROP TABLE IF EXISTS _0449rb_tenant;
