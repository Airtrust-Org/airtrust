-- Reconcile the FAP06/IFR check-qualification rule for AW139/S-76
-- (empresa_id=6), per the canonical rule: initial/periodic checks must
-- generate FAP06 + IFR; semestral checks must generate IFR only, never
-- FAP06.
--
-- OPERATIONAL MARKERS (guard:operational-sql-sources):
-- source_reference: read-only production audit (2026-07-27, empresa_id=6).
--   qualificacoes_tipos already has the four qualifications the rule
--   names: FAP6-139 (id 164, 'FAP 06 - Habilitacao de Voo por Instrumentos
--   - AW139', validade 12 — note the tenant's existing code is 'FAP6-139',
--   not 'FAP06-139'; this migration does not rename it, only references
--   it by id), IFR-139 (id 79, validade 6), FAP06-76 (id 78, validade 12),
--   IFR-SK76 (id 114, validade 6).
-- operational_decision: two independent, additive-only fixes, each
--   guarded by a preflight that aborts if production has drifted:
--   1. FAP6-139 (164) and IFR-SK76 (114) have is_check=0, unlike every
--      sibling FAP-type qualification (FAP05.2-139, FAP06-76, IFR-139,
--      FAP13-139, FAP14-139 — all is_check=1). This is why they don't
--      appear as "Checks FAP" options in the modelo-sessao edit modal
--      (`simuladores-modelos.ts` / the modal filters on is_check). Flips
--      only the is_check flag; codigo/nome/validade/categoria untouched.
--   2. modelos_sessao_checks is missing links required by the canonical
--      rule, confirmed absent via a direct query against
--      modelos_sessao_checks for the exact (modelo_id, qualificacao_tipo_id)
--      pairs below:
--        AW139 inicial/periodico check (105, 109, 115, 121): add FAP6-139;
--          IFR-139 already present on all four, untouched.
--        AW139 semestral check (111, 117, 153): intentionally NOT given
--          FAP6-139 — matches "não renovar FAP06 no check semestral".
--        SK76 inicial check (135): add FAP06-76 AND IFR-SK76 (had zero
--          FAP links of any kind before this migration).
--        SK76 periodico check (142): add IFR-SK76 (already had FAP06-76
--          from migration 0446).
--        SK76 semestral check (144): add IFR-SK76 only (had zero FAP
--          links before this migration) — matches "somente IFR-SK76".
-- dry_run_required: guarded by a preflight requiring the exact absent/
--   present state confirmed by the audit; aborts if production has
--   drifted since.
-- rollback_plan_required: see 0449_..._rollback.sql; reverses the
--   is_check flips and removes exactly the links this migration added.
--   Additive-only migration, touches no other table or historical row.

CREATE TABLE IF NOT EXISTS _0449_preflight_guard (
  id INTEGER PRIMARY KEY CHECK(id = 1)
);
CREATE TRIGGER IF NOT EXISTS _0449_preflight_validate
BEFORE INSERT ON _0449_preflight_guard
BEGIN
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM qualificacoes_tipos
    WHERE empresa_id = 6 AND is_check = 0
      AND id = 164 AND codigo = 'FAP6-139'
  ) <> 1 THEN RAISE(ABORT, '0449 preflight: FAP6-139 (164) nao esta no estado auditado (is_check=0)') END;

  SELECT CASE WHEN (
    SELECT COUNT(*) FROM qualificacoes_tipos
    WHERE empresa_id = 6 AND is_check = 0
      AND id = 114 AND codigo = 'IFR-SK76'
  ) <> 1 THEN RAISE(ABORT, '0449 preflight: IFR-SK76 (114) nao esta no estado auditado (is_check=0)') END;

  SELECT CASE WHEN (
    SELECT COUNT(*) FROM modelos_sessao_checks
    WHERE deleted_at IS NULL AND qualificacao_tipo_id = 164
      AND modelo_id IN (105, 109, 115, 121)
  ) <> 0 THEN RAISE(ABORT, '0449 preflight: FAP6-139 ja vinculada a algum check AW139 inicial/periodico') END;

  SELECT CASE WHEN (
    SELECT COUNT(*) FROM modelos_sessao_checks
    WHERE deleted_at IS NULL AND modelo_id = 135
  ) <> 0 THEN RAISE(ABORT, '0449 preflight: SK76-I-12/12 (135) ja possui vinculo FAP') END;

  SELECT CASE WHEN (
    SELECT COUNT(*) FROM modelos_sessao_checks
    WHERE deleted_at IS NULL AND qualificacao_tipo_id = 114 AND modelo_id = 142
  ) <> 0 THEN RAISE(ABORT, '0449 preflight: IFR-SK76 ja vinculada a SK76-P-CHECK (142)') END;

  SELECT CASE WHEN (
    SELECT COUNT(*) FROM modelos_sessao_checks
    WHERE deleted_at IS NULL AND modelo_id = 144
  ) <> 0 THEN RAISE(ABORT, '0449 preflight: SK76-S-02/02 (144) ja possui vinculo FAP') END;
END;
INSERT INTO _0449_preflight_guard(id) VALUES (1);
DROP TRIGGER IF EXISTS _0449_preflight_validate;
DROP TABLE IF EXISTS _0449_preflight_guard;

-- Fix 1: classify FAP6-139 and IFR-SK76 as Check-type qualifications,
-- matching every sibling FAP.
UPDATE qualificacoes_tipos SET is_check = 1, updated_at = datetime('now')
WHERE empresa_id = 6 AND id = 164 AND codigo = 'FAP6-139' AND is_check = 0;

UPDATE qualificacoes_tipos SET is_check = 1, updated_at = datetime('now')
WHERE empresa_id = 6 AND id = 114 AND codigo = 'IFR-SK76' AND is_check = 0;

-- Fix 2: add the missing FAP links per the canonical FAP06/IFR rule.
INSERT INTO modelos_sessao_checks (modelo_id, qualificacao_tipo_id)
SELECT m, 164 FROM (SELECT 105 AS m UNION SELECT 109 UNION SELECT 115 UNION SELECT 121) x
WHERE NOT EXISTS (SELECT 1 FROM modelos_sessao_checks WHERE modelo_id = x.m AND qualificacao_tipo_id = 164 AND deleted_at IS NULL);

INSERT INTO modelos_sessao_checks (modelo_id, qualificacao_tipo_id)
SELECT 135, q FROM (SELECT 78 AS q UNION SELECT 114) x
WHERE NOT EXISTS (SELECT 1 FROM modelos_sessao_checks WHERE modelo_id = 135 AND qualificacao_tipo_id = x.q AND deleted_at IS NULL);

INSERT INTO modelos_sessao_checks (modelo_id, qualificacao_tipo_id)
SELECT 142, 114
WHERE NOT EXISTS (SELECT 1 FROM modelos_sessao_checks WHERE modelo_id = 142 AND qualificacao_tipo_id = 114 AND deleted_at IS NULL);

INSERT INTO modelos_sessao_checks (modelo_id, qualificacao_tipo_id)
SELECT 144, 114
WHERE NOT EXISTS (SELECT 1 FROM modelos_sessao_checks WHERE modelo_id = 144 AND qualificacao_tipo_id = 114 AND deleted_at IS NULL);
