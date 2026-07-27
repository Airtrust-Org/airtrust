-- Follow-up to 0445_simuladores_matriz_aw139_reconciliacao.sql.
--
-- OPERATIONAL MARKERS (guard:operational-sql-sources):
-- source_reference: post-apply verification of 0445 against live production
--   (2026-07-27, empresa_id=6). 0445 was built and dry-run against an
--   archived production snapshot dated 2026-07-25T02:29:40Z. That snapshot
--   predates a same-day remediation batch (2026-07-25 17:38:51,
--   remediation_uuid f524c7cf-eec9-4934-9a84-49d2fced2acf, migration 0443)
--   which created 9 brand-new physical modelos_sessao rows (ids 145-153) as
--   the new is_current=1 row for 9 of the 30 AW139 canonical codes,
--   retiring their predecessors (which happened to be exactly the rows
--   0445 targeted for those 9 codes). 0445's aggregate preflight guard
--   (COUNT(*) = 30 with nome = codigo_canonico) still passed after 0445 ran
--   the renames on the wrong (already-retired) 9 rows, because the total
--   count of matching rows never changed — it does not verify per-code
--   ID currency, only the aggregate. This migration fixes the actual
--   current rows.
-- operational_decision: rename the true-current rows for the 9 affected
--   codes (145,146,147,148,149,150,151,152,153); add the 2 missing FAP
--   links to the true-current row for A139-S-02/02-C3 (id 153) —
--   IFR-139/79 and FAP05.2-139/77, the same pair already present on its
--   sibling cycles (111, 117). The FAP links 0445 already added to the
--   now-superseded id 123 are NOT removed: id 123 was the current model
--   for roughly 15 hours (2026-07-25 02:29-17:38) and may be referenced by
--   sessions/fichas created in that window, so its FAP linkage must stay
--   intact for their history — this is purely additive on top, not a
--   correction of a wrong write.
-- dry_run_required: guarded by a preflight identical in shape to 0445's,
--   scoped to the exact 9 ids and 2 FAP rows involved; aborts if production
--   has drifted further since this audit.
-- rollback_plan_required: see 0446_..._rollback.sql. Same caveat as 0445:
--   this migration does not flip any is_current flag, so every part of it
--   is cleanly reversible (renames back to codigo_canonico, FAP link
--   removed), unlike 0445's fix 2.

CREATE TABLE IF NOT EXISTS _0446_preflight_guard (
  id INTEGER PRIMARY KEY CHECK(id = 1)
);
CREATE TRIGGER IF NOT EXISTS _0446_preflight_validate
BEFORE INSERT ON _0446_preflight_guard
BEGIN
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM modelos_sessao ms
    JOIN modelos_sessao_versionamento msv ON msv.modelo_id = ms.id
    WHERE ms.empresa_id = 6 AND msv.is_current = 1 AND ms.nome = msv.codigo_canonico
      AND ms.id IN (145, 146, 147, 148, 149, 150, 151, 152, 153)
  ) <> 9 THEN RAISE(ABORT, '0446 preflight: esperados exatamente 9 modelos correntes com nome = codigo') END;

  SELECT CASE WHEN (
    SELECT COUNT(*) FROM modelos_sessao_checks
    WHERE modelo_id = 153 AND deleted_at IS NULL
  ) <> 0 THEN RAISE(ABORT, '0446 preflight: id 153 já possui vínculo FAP; migration já aplicada ou estado divergente') END;
END;
INSERT INTO _0446_preflight_guard(id) VALUES (1);
DROP TRIGGER IF EXISTS _0446_preflight_validate;
DROP TABLE IF EXISTS _0446_preflight_guard;

UPDATE modelos_sessao SET nome = 'AFCS, air data e reversão para voo manual',                    updated_at = datetime('now') WHERE id = 145 AND empresa_id = 6 AND nome = 'A139-I-06/12';
UPDATE modelos_sessao SET nome = 'Rotor, transmissão, hidráulico e rotor de cauda',               updated_at = datetime('now') WHERE id = 146 AND empresa_id = 6 AND nome = 'A139-I-08/12';
UPDATE modelos_sessao SET nome = 'VFR, emergências e aplicação do QRH',                          updated_at = datetime('now') WHERE id = 147 AND empresa_id = 6 AND nome = 'A139-P-01/04-C1';
UPDATE modelos_sessao SET nome = 'Offshore, CAT A, TDP/LDP, ditching e autorrotação',             updated_at = datetime('now') WHERE id = 148 AND empresa_id = 6 AND nome = 'A139-P-02/04-C1-OFFSHORE';
UPDATE modelos_sessao SET nome = 'VFR, emergências e aplicação do QRH',                          updated_at = datetime('now') WHERE id = 149 AND empresa_id = 6 AND nome = 'A139-P-01/04-C2';
UPDATE modelos_sessao SET nome = 'Offshore, CAT A, TDP/LDP, ditching e autorrotação',             updated_at = datetime('now') WHERE id = 150 AND empresa_id = 6 AND nome = 'A139-P-02/04-C2-OFFSHORE';
UPDATE modelos_sessao SET nome = 'VFR, emergências e aplicação do QRH',                          updated_at = datetime('now') WHERE id = 151 AND empresa_id = 6 AND nome = 'A139-P-01/04-C3';
UPDATE modelos_sessao SET nome = 'Offshore, CAT A, TDP/LDP, ditching e autorrotação',             updated_at = datetime('now') WHERE id = 152 AND empresa_id = 6 AND nome = 'A139-P-02/04-C3-OFFSHORE';
UPDATE modelos_sessao SET nome = 'Consolidação IFR e sistemas',                                  updated_at = datetime('now') WHERE id = 153 AND empresa_id = 6 AND nome = 'A139-S-02/02-C3';

INSERT INTO modelos_sessao_checks (modelo_id, qualificacao_tipo_id)
SELECT 153, q FROM (SELECT 79 AS q UNION SELECT 77) x
WHERE NOT EXISTS (SELECT 1 FROM modelos_sessao_checks WHERE modelo_id = 153 AND qualificacao_tipo_id = x.q AND deleted_at IS NULL);
