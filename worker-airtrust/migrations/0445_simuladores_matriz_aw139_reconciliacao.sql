-- Reconciliation of the AW139/S-76 session-model catalogue for empresa_id=6,
-- following the versioned-matrix import done by migrations 0440-0443.
--
-- OPERATIONAL MARKERS (guard:operational-sql-sources):
-- source_reference: read-only production audit 2026-07-27 (empresa_id=6),
--   cross-checked against Matriz_AW139_CORRIGIDA_LOFT.xlsx (Inicial — Visão
--   Geral, Programa Anual) — canonical titles are not stored in this repo,
--   only the resulting 30 (id -> nome) pairs below.
-- operational_decision: three independent, ID-scoped fixes, each guarded by
--   a preflight that ABORTs if production has drifted from the audited
--   state:
--   1. 30 AW139 current models have `nome` literally equal to
--      `codigo_canonico` (name-equals-code regression). S-76's 21 current
--      models already have correct descriptive names and are untouched.
--   2. 7 pre-existing AW139 model rows (ids 27, 29, 31, 33, 34, 51, 52, 53)
--      were never retired when the versioned import created their
--      cycle-split canonical successors; of those, 29/31/33/34/51/52/53
--      are still flagged is_current=1 in modelos_sessao_versionamento in
--      parallel with the new canonical current rows for the same logical
--      session (duplicate "current" state). Only these 7 are flipped to
--      is_current=0 here; id 27 was already correctly retired.
--   3. FAP check-qualification links (modelos_sessao_checks) for check
--      sessions are still attached only to the old rows (27, 34, 44, 53),
--      including two (27, 44) that are already correctly retired. The new
--      current rows that replaced them (105; 109/115/121; 142) have zero
--      FAP links. This is purely additive: new modelos_sessao_checks rows
--      are inserted for the current models, the old rows' links are left
--      untouched as historical record.
-- dry_run_required: run against a local D1 copy seeded from a production
--   export first; the preflight guard trigger aborts the whole batch if
--   any of the 30+7+11 expected rows do not match exactly, so a stale copy
--   fails closed instead of silently reconciling the wrong data.
-- rollback_plan_required: see 0445_simuladores_matriz_aw139_reconciliacao_rollback.sql.
--   The is_current retirement (fix 2) is NOT reversible by this rollback:
--   trg_modelo_versao_integridade_update explicitly forbids a historical
--   version (is_current=0) from becoming current again in place ("versão
--   histórica não pode voltar a vigente; crie versão de reversão
--   auditada") — this is deliberate system design, not an oversight of
--   this migration. Reversing fix 2 requires a new audited entry, not a
--   raw UPDATE; the rollback file documents this instead of attempting it.
--
-- SK76-I-12/12 (135) and SK76-S-02/02 (144) are explicitly OUT OF SCOPE:
-- no FAP link was found for them anywhere (old or new, retired or
-- current). Inventing one from code/name similarity would violate the
-- "não criar vínculo de FAP somente porque o nome contém CHECK" rule; they
-- need a separate, human-confirmed decision and are left untouched.

CREATE TABLE IF NOT EXISTS _0445_preflight_guard (
  id INTEGER PRIMARY KEY CHECK(id = 1)
);
CREATE TRIGGER IF NOT EXISTS _0445_preflight_validate
BEFORE INSERT ON _0445_preflight_guard
BEGIN
  -- Exactly the 30 AW139 current models must still have nome = codigo_canonico.
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM modelos_sessao ms
    JOIN modelos_sessao_versionamento msv ON msv.modelo_id = ms.id
    WHERE ms.empresa_id = 6 AND msv.is_current = 1 AND ms.nome = msv.codigo_canonico
      AND msv.codigo_canonico LIKE 'A139%'
  ) <> 30 THEN RAISE(ABORT, '0445 preflight: esperado exatamente 30 modelos AW139 correntes com nome = codigo') END;

  -- The 7 old duplicate-current rows must still be exactly these, still current.
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM modelos_sessao_versionamento
    WHERE empresa_id = 6 AND is_current = 1
      AND modelo_id IN (29, 31, 33, 34, 51, 52, 53)
      AND codigo_canonico IN (
        'A139-P-02/04-C1', 'A139-P-02/04-C2', 'A139-P-02/04-C3',
        'A139-P-04/04-CHECK', 'A139-P-03/04-OFFSHOR',
        'A139-S-01/02', 'A139-S-02/02'
      )
  ) <> 7 THEN RAISE(ABORT, '0445 preflight: os 7 modelos antigos duplicados não correspondem ao estado auditado') END;

  -- The FAP source rows (27, 34, 44, 53) must still hold exactly the audited links.
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM modelos_sessao_checks
    WHERE deleted_at IS NULL AND (
      (modelo_id = 27 AND qualificacao_tipo_id IN (84, 77, 79)) OR
      (modelo_id = 34 AND qualificacao_tipo_id IN (77, 79, 84, 83)) OR
      (modelo_id = 44 AND qualificacao_tipo_id IN (76, 78)) OR
      (modelo_id = 53 AND qualificacao_tipo_id IN (79, 77))
    )
  ) <> 11 THEN RAISE(ABORT, '0445 preflight: vínculos FAP de origem não correspondem ao estado auditado') END;

  -- The 11 target rows (current models) must not already have these FAP links
  -- (idempotency: a second run of this migration must be a no-op, not a duplicate).
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM modelos_sessao_checks
    WHERE deleted_at IS NULL AND (
      (modelo_id = 105 AND qualificacao_tipo_id IN (84, 77, 79)) OR
      (modelo_id IN (109, 115, 121) AND qualificacao_tipo_id IN (77, 79, 84, 83)) OR
      (modelo_id = 142 AND qualificacao_tipo_id IN (76, 78)) OR
      (modelo_id IN (111, 117, 123) AND qualificacao_tipo_id IN (79, 77))
    )
  ) <> 0 THEN RAISE(ABORT, '0445 preflight: vínculos FAP já existem nos modelos correntes; migration já aplicada') END;
END;
INSERT INTO _0445_preflight_guard(id) VALUES (1);
DROP TRIGGER IF EXISTS _0445_preflight_validate;
DROP TABLE IF EXISTS _0445_preflight_guard;

-- Fix 1: rename the 30 AW139 current models to their canonical titles.
-- Every UPDATE is scoped by id + empresa_id + the exact current (buggy)
-- nome value, so it is a no-op (0 rows) rather than a silent overwrite if
-- the row has already been fixed or has changed since the audit.
UPDATE modelos_sessao SET nome = 'Familiarização, procedimentos normais e voo visual básico', updated_at = datetime('now') WHERE id = 94  AND empresa_id = 6 AND nome = 'A139-I-01/12';
UPDATE modelos_sessao SET nome = 'Partidas anormais, voo visual e perfis CAT B',                updated_at = datetime('now') WHERE id = 95  AND empresa_id = 6 AND nome = 'A139-I-02/12';
UPDATE modelos_sessao SET nome = 'Categoria A — clear area, short field e helideck',             updated_at = datetime('now') WHERE id = 96  AND empresa_id = 6 AND nome = 'A139-I-03/12';
UPDATE modelos_sessao SET nome = 'Powerplant, voo monomotor e autorrotações',                    updated_at = datetime('now') WHERE id = 97  AND empresa_id = 6 AND nome = 'A139-I-04/12';
UPDATE modelos_sessao SET nome = 'Sistema elétrico, barras e integração de displays',            updated_at = datetime('now') WHERE id = 98  AND empresa_id = 6 AND nome = 'A139-I-05/12';
UPDATE modelos_sessao SET nome = 'AFCS, air data e reversão para voo manual',                    updated_at = datetime('now') WHERE id = 99  AND empresa_id = 6 AND nome = 'A139-I-06/12';
UPDATE modelos_sessao SET nome = 'IFR/PBN, FMS, navegação e aproximações',                       updated_at = datetime('now') WHERE id = 100 AND empresa_id = 6 AND nome = 'A139-I-07/12';
UPDATE modelos_sessao SET nome = 'Rotor, transmissão, hidráulico e rotor de cauda',               updated_at = datetime('now') WHERE id = 101 AND empresa_id = 6 AND nome = 'A139-I-08/12';
UPDATE modelos_sessao SET nome = 'Fogo, fumaça, combustível e pouso de emergência',               updated_at = datetime('now') WHERE id = 102 AND empresa_id = 6 AND nome = 'A139-I-09/12';
UPDATE modelos_sessao SET nome = 'Operação offshore, helideck, OEI e ditching',                   updated_at = datetime('now') WHERE id = 103 AND empresa_id = 6 AND nome = 'A139-I-10/12';
UPDATE modelos_sessao SET nome = 'LOFT — treinamento integrado de linha',                        updated_at = datetime('now') WHERE id = 104 AND empresa_id = 6 AND nome = 'A139-I-11/12';
UPDATE modelos_sessao SET nome = 'LOFT/Check — verificação final de proficiência',                updated_at = datetime('now') WHERE id = 105 AND empresa_id = 6 AND nome = 'A139-I-12/12';

UPDATE modelos_sessao SET nome = 'VFR, emergências e aplicação do QRH',                          updated_at = datetime('now') WHERE id = 106 AND empresa_id = 6 AND nome = 'A139-P-01/04-C1';
UPDATE modelos_sessao SET nome = 'Offshore, CAT A, TDP/LDP, ditching e autorrotação',             updated_at = datetime('now') WHERE id = 107 AND empresa_id = 6 AND nome = 'A139-P-02/04-C1-OFFSHORE';
UPDATE modelos_sessao SET nome = 'LOFT IFR — treinamento',                                       updated_at = datetime('now') WHERE id = 108 AND empresa_id = 6 AND nome = 'A139-P-03/04-C1-IFR-LOFT';
UPDATE modelos_sessao SET nome = 'LOFT IFR — check',                                             updated_at = datetime('now') WHERE id = 109 AND empresa_id = 6 AND nome = 'A139-P-04/04-C1-CHECK';
UPDATE modelos_sessao SET nome = 'LOFT offshore/noturno',                                        updated_at = datetime('now') WHERE id = 110 AND empresa_id = 6 AND nome = 'A139-S-01/02-C1';
UPDATE modelos_sessao SET nome = 'Consolidação IFR e sistemas',                                  updated_at = datetime('now') WHERE id = 111 AND empresa_id = 6 AND nome = 'A139-S-02/02-C1';

UPDATE modelos_sessao SET nome = 'VFR, emergências e aplicação do QRH',                          updated_at = datetime('now') WHERE id = 112 AND empresa_id = 6 AND nome = 'A139-P-01/04-C2';
UPDATE modelos_sessao SET nome = 'Offshore, CAT A, TDP/LDP, ditching e autorrotação',             updated_at = datetime('now') WHERE id = 113 AND empresa_id = 6 AND nome = 'A139-P-02/04-C2-OFFSHORE';
UPDATE modelos_sessao SET nome = 'LOFT IFR — treinamento',                                       updated_at = datetime('now') WHERE id = 114 AND empresa_id = 6 AND nome = 'A139-P-03/04-C2-IFR-LOFT';
UPDATE modelos_sessao SET nome = 'LOFT IFR — check',                                             updated_at = datetime('now') WHERE id = 115 AND empresa_id = 6 AND nome = 'A139-P-04/04-C2-CHECK';
UPDATE modelos_sessao SET nome = 'LOFT offshore/noturno',                                        updated_at = datetime('now') WHERE id = 116 AND empresa_id = 6 AND nome = 'A139-S-01/02-C2';
UPDATE modelos_sessao SET nome = 'Consolidação IFR e sistemas',                                  updated_at = datetime('now') WHERE id = 117 AND empresa_id = 6 AND nome = 'A139-S-02/02-C2';

UPDATE modelos_sessao SET nome = 'VFR, emergências e aplicação do QRH',                          updated_at = datetime('now') WHERE id = 118 AND empresa_id = 6 AND nome = 'A139-P-01/04-C3';
UPDATE modelos_sessao SET nome = 'Offshore, CAT A, TDP/LDP, ditching e autorrotação',             updated_at = datetime('now') WHERE id = 119 AND empresa_id = 6 AND nome = 'A139-P-02/04-C3-OFFSHORE';
UPDATE modelos_sessao SET nome = 'LOFT IFR — treinamento',                                       updated_at = datetime('now') WHERE id = 120 AND empresa_id = 6 AND nome = 'A139-P-03/04-C3-IFR-LOFT';
UPDATE modelos_sessao SET nome = 'LOFT IFR — check',                                             updated_at = datetime('now') WHERE id = 121 AND empresa_id = 6 AND nome = 'A139-P-04/04-C3-CHECK';
UPDATE modelos_sessao SET nome = 'LOFT offshore/noturno',                                        updated_at = datetime('now') WHERE id = 122 AND empresa_id = 6 AND nome = 'A139-S-01/02-C3';
UPDATE modelos_sessao SET nome = 'Consolidação IFR e sistemas',                                  updated_at = datetime('now') WHERE id = 123 AND empresa_id = 6 AND nome = 'A139-S-02/02-C3';

-- Fix 2: retire the 7 old rows that are duplicated by a newer canonical
-- successor. Each UPDATE is scoped by modelo_id + empresa_id + the exact
-- codigo_canonico audited above, so a row that has already been retired,
-- or whose code no longer matches, is left untouched (0 rows affected).
UPDATE modelos_sessao_versionamento SET is_current = 0, efetivo_ate = datetime('now') WHERE modelo_id = 29 AND empresa_id = 6 AND is_current = 1 AND codigo_canonico = 'A139-P-02/04-C1';
UPDATE modelos_sessao_versionamento SET is_current = 0, efetivo_ate = datetime('now') WHERE modelo_id = 31 AND empresa_id = 6 AND is_current = 1 AND codigo_canonico = 'A139-P-02/04-C2';
UPDATE modelos_sessao_versionamento SET is_current = 0, efetivo_ate = datetime('now') WHERE modelo_id = 33 AND empresa_id = 6 AND is_current = 1 AND codigo_canonico = 'A139-P-02/04-C3';
UPDATE modelos_sessao_versionamento SET is_current = 0, efetivo_ate = datetime('now') WHERE modelo_id = 34 AND empresa_id = 6 AND is_current = 1 AND codigo_canonico = 'A139-P-04/04-CHECK';
UPDATE modelos_sessao_versionamento SET is_current = 0, efetivo_ate = datetime('now') WHERE modelo_id = 51 AND empresa_id = 6 AND is_current = 1 AND codigo_canonico = 'A139-P-03/04-OFFSHOR';
UPDATE modelos_sessao_versionamento SET is_current = 0, efetivo_ate = datetime('now') WHERE modelo_id = 52 AND empresa_id = 6 AND is_current = 1 AND codigo_canonico = 'A139-S-01/02';
UPDATE modelos_sessao_versionamento SET is_current = 0, efetivo_ate = datetime('now') WHERE modelo_id = 53 AND empresa_id = 6 AND is_current = 1 AND codigo_canonico = 'A139-S-02/02';

-- Fix 3: carry FAP check-qualification links forward from the old rows to
-- the current rows that replaced them. Purely additive (INSERT only); the
-- source rows (27, 34, 44, 53) and their existing links are untouched.
-- Guarded by NOT EXISTS so a second run is idempotent.
INSERT INTO modelos_sessao_checks (modelo_id, qualificacao_tipo_id)
SELECT 105, q FROM (SELECT 84 AS q UNION SELECT 77 UNION SELECT 79) x
WHERE NOT EXISTS (SELECT 1 FROM modelos_sessao_checks WHERE modelo_id = 105 AND qualificacao_tipo_id = x.q AND deleted_at IS NULL);

INSERT INTO modelos_sessao_checks (modelo_id, qualificacao_tipo_id)
SELECT m, q FROM (SELECT 109 AS m UNION SELECT 115 UNION SELECT 121) models,
                 (SELECT 77 AS q UNION SELECT 79 UNION SELECT 84 UNION SELECT 83) quals
WHERE NOT EXISTS (SELECT 1 FROM modelos_sessao_checks WHERE modelo_id = models.m AND qualificacao_tipo_id = quals.q AND deleted_at IS NULL);

INSERT INTO modelos_sessao_checks (modelo_id, qualificacao_tipo_id)
SELECT 142, q FROM (SELECT 76 AS q UNION SELECT 78) x
WHERE NOT EXISTS (SELECT 1 FROM modelos_sessao_checks WHERE modelo_id = 142 AND qualificacao_tipo_id = x.q AND deleted_at IS NULL);

INSERT INTO modelos_sessao_checks (modelo_id, qualificacao_tipo_id)
SELECT m, q FROM (SELECT 111 AS m UNION SELECT 117 UNION SELECT 123) models,
                 (SELECT 79 AS q UNION SELECT 77) quals
WHERE NOT EXISTS (SELECT 1 FROM modelos_sessao_checks WHERE modelo_id = models.m AND qualificacao_tipo_id = quals.q AND deleted_at IS NULL);
