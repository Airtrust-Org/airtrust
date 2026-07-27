-- Restore gera_qualificacao/qualificacao_tipo_id on the current AW139/S-76
-- check-session models (empresa_id=6), lost the same way the FAP links
-- fixed in migration 0446 were: the versioned matrix import (0440-0443)
-- created new physical rows for these logical check sessions without
-- carrying these two columns forward from their predecessors.
--
-- OPERATIONAL MARKERS (guard:operational-sql-sources):
-- source_reference: read-only production audit (2026-07-27, empresa_id=6).
--   For each check-session code, the historical predecessor row already
--   has gera_qualificacao=1 with a specific qualificacao_tipo_id, while the
--   current row (post-import) has gera_qualificacao=0 and NULL:
--     A139-P-04/04-C{1,2,3}-CHECK (current 109,115,121) <- predecessor 34
--       (gera_qualificacao=1, qualificacao_tipo_id=33, 'G1' AW139 FFS)
--     A139-S-02/02-C{1,2,3}       (current 111,117,153) <- predecessors
--       91/92/93 (gera_qualificacao=1, qualificacao_tipo_id=106, 'G1-SEM')
--     SK76-P-CHECK                (current 142)         <- predecessor 44
--       (gera_qualificacao=1, qualificacao_tipo_id=40, 'G2' SK76 FFS)
--   A139-I-12/12 (current 105) already has gera_qualificacao=1/
--   qualificacao_tipo_id=33 carried over correctly and needs no change.
--   SK76-I-12/12 (current 135, predecessor 74) and SK76-S-02/02 (current
--   144, predecessor 76) have gera_qualificacao=0 on BOTH current and
--   predecessor rows — there is no historical value to restore, so they
--   are deliberately left untouched rather than inventing one.
-- operational_decision: set gera_qualificacao=1 and qualificacao_tipo_id on
--   exactly the 7 current rows above, matching their predecessor's value
--   verbatim. Explicit id-scoped UPDATEs, guarded by the exact current
--   (0/NULL) state, so a row already fixed or changed since the audit is
--   left untouched (0 rows affected) rather than silently overwritten.
-- dry_run_required: guarded by a preflight requiring exactly these 7 rows
--   to still be gera_qualificacao=0/qualificacao_tipo_id NULL; aborts if
--   production has drifted.
-- rollback_plan_required: see 0448_..._rollback.sql; reverses these two
--   columns back to 0/NULL on the same 7 ids, additive-only, touches no
--   other table or historical row.

CREATE TABLE IF NOT EXISTS _0448_preflight_guard (
  id INTEGER PRIMARY KEY CHECK(id = 1)
);
CREATE TRIGGER IF NOT EXISTS _0448_preflight_validate
BEFORE INSERT ON _0448_preflight_guard
BEGIN
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM modelos_sessao
    WHERE empresa_id = 6 AND gera_qualificacao = 0 AND qualificacao_tipo_id IS NULL
      AND id IN (109, 115, 121, 111, 117, 153, 142)
  ) <> 7 THEN RAISE(ABORT, '0448 preflight: os 7 modelos correntes nao estao no estado auditado (gera_qualificacao=0)') END;

  SELECT CASE WHEN (
    SELECT COUNT(*) FROM modelos_sessao
    WHERE id IN (34, 91, 92, 93, 44) AND empresa_id = 6 AND gera_qualificacao = 1
      AND ((id = 34 AND qualificacao_tipo_id = 33)
        OR (id IN (91, 92, 93) AND qualificacao_tipo_id = 106)
        OR (id = 44 AND qualificacao_tipo_id = 40))
  ) <> 5 THEN RAISE(ABORT, '0448 preflight: predecessores historicos nao correspondem ao estado auditado') END;
END;
INSERT INTO _0448_preflight_guard(id) VALUES (1);
DROP TRIGGER IF EXISTS _0448_preflight_validate;
DROP TABLE IF EXISTS _0448_preflight_guard;

UPDATE modelos_sessao SET gera_qualificacao = 1, qualificacao_tipo_id = 33, updated_at = datetime('now')
WHERE empresa_id = 6 AND gera_qualificacao = 0 AND qualificacao_tipo_id IS NULL
  AND id IN (109, 115, 121);

UPDATE modelos_sessao SET gera_qualificacao = 1, qualificacao_tipo_id = 106, updated_at = datetime('now')
WHERE empresa_id = 6 AND gera_qualificacao = 0 AND qualificacao_tipo_id IS NULL
  AND id IN (111, 117, 153);

UPDATE modelos_sessao SET gera_qualificacao = 1, qualificacao_tipo_id = 40, updated_at = datetime('now')
WHERE empresa_id = 6 AND gera_qualificacao = 0 AND qualificacao_tipo_id IS NULL
  AND id IN (142);
