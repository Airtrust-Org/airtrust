-- Fill in tipo_sessao_id and modelo_aeronave for the 51 AW139/S-76 canonical
-- session models (empresa_id=6), which have shown as "-" / "-" in the
-- Tipo/Modelo columns of /simuladores?tab=gestao since the versioned matrix
-- import (migrations 0440-0443) created them.
--
-- OPERATIONAL MARKERS (guard:operational-sql-sources):
-- source_reference: read-only production audit (2026-07-27, empresa_id=6).
--   tipos_sessao already has the three classifications needed — id 14
--   'Inicial'/INI, id 9 'Periódico'/PER, id 21 'Semestral'/SEM — and 6
--   non-canonical AW139/S-76 models (A139-NOT-01/02, A139-REQ-01,
--   S76-NOT-01/02, S76-REQ-01) already carry tipo_sessao_id=9 and
--   modelo_aeronave='AW139'/'SK76' from before the matrix import, proving
--   this is the existing, established convention rather than a new value
--   invented for this migration. modelos_aeronave has id 5 'AW139' and id 6
--   'SK76' (modelo_aeronave itself is a free-text column on modelos_sessao,
--   not a FK, and the 6 existing rows already use the bare model string,
--   not the modelos_aeronave.id).
-- operational_decision: classify by canonical code prefix only (I- ->
--   Inicial, P- -> Periódico, S- -> Semestral), matching the codigo_canonico
--   segment already validated in 0440-0446 (e.g. A139-I-01/12, A139-P-...,
--   A139-S-...). Explicit id IN (...) lists per (tipo, aeronave) pair —
--   no LIKE-based matching — built from a read-only query that confirmed
--   all 51 rows currently have both fields NULL.
-- dry_run_required: guarded by a preflight requiring exactly 51 current
--   AW139/S-76 rows with tipo_sessao_id IS NULL; aborts otherwise.
-- rollback_plan_required: see 0447_..._rollback.sql; purely reverses the
--   two columns back to NULL on the same 51 ids, additive-only migration
--   so no other table or historical row is touched.

CREATE TABLE IF NOT EXISTS _0447_preflight_guard (
  id INTEGER PRIMARY KEY CHECK(id = 1)
);
CREATE TRIGGER IF NOT EXISTS _0447_preflight_validate
BEFORE INSERT ON _0447_preflight_guard
BEGIN
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM modelos_sessao ms
    JOIN modelos_sessao_versionamento msv ON msv.modelo_id = ms.id
    WHERE ms.empresa_id = 6 AND msv.is_current = 1
      AND ms.tipo_sessao_id IS NULL AND ms.modelo_aeronave IS NULL
      AND (msv.codigo_canonico LIKE 'A139%' OR msv.codigo_canonico LIKE 'SK76%' OR msv.codigo_canonico LIKE 'S76%')
  ) <> 51 THEN RAISE(ABORT, '0447 preflight: esperados exatamente 51 modelos correntes sem tipo/modelo') END;

  SELECT CASE WHEN (
    SELECT COUNT(*) FROM tipos_sessao
    WHERE empresa_id = 6 AND deleted_at IS NULL AND id IN (9, 14, 21)
      AND ((id = 9 AND codigo = 'PER') OR (id = 14 AND codigo = 'INI') OR (id = 21 AND codigo = 'SEM'))
  ) <> 3 THEN RAISE(ABORT, '0447 preflight: tipos_sessao 9/14/21 nao correspondem a PER/INI/SEM') END;
END;
INSERT INTO _0447_preflight_guard(id) VALUES (1);
DROP TRIGGER IF EXISTS _0447_preflight_validate;
DROP TABLE IF EXISTS _0447_preflight_guard;

-- AW139 Inicial (12)
UPDATE modelos_sessao SET tipo_sessao_id = 14, modelo_aeronave = 'AW139', updated_at = datetime('now')
WHERE empresa_id = 6 AND tipo_sessao_id IS NULL AND modelo_aeronave IS NULL
  AND id IN (94, 95, 96, 97, 98, 145, 100, 146, 102, 103, 104, 105);

-- AW139 Periodico (12)
UPDATE modelos_sessao SET tipo_sessao_id = 9, modelo_aeronave = 'AW139', updated_at = datetime('now')
WHERE empresa_id = 6 AND tipo_sessao_id IS NULL AND modelo_aeronave IS NULL
  AND id IN (147, 149, 151, 148, 150, 152, 108, 114, 120, 109, 115, 121);

-- AW139 Semestral (6)
UPDATE modelos_sessao SET tipo_sessao_id = 21, modelo_aeronave = 'AW139', updated_at = datetime('now')
WHERE empresa_id = 6 AND tipo_sessao_id IS NULL AND modelo_aeronave IS NULL
  AND id IN (110, 116, 122, 111, 117, 153);

-- SK76 Inicial (12)
UPDATE modelos_sessao SET tipo_sessao_id = 14, modelo_aeronave = 'SK76', updated_at = datetime('now')
WHERE empresa_id = 6 AND tipo_sessao_id IS NULL AND modelo_aeronave IS NULL
  AND id IN (124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135);

-- SK76 Periodico (7)
UPDATE modelos_sessao SET tipo_sessao_id = 9, modelo_aeronave = 'SK76', updated_at = datetime('now')
WHERE empresa_id = 6 AND tipo_sessao_id IS NULL AND modelo_aeronave IS NULL
  AND id IN (136, 137, 138, 139, 140, 141, 142);

-- SK76 Semestral (2)
UPDATE modelos_sessao SET tipo_sessao_id = 21, modelo_aeronave = 'SK76', updated_at = datetime('now')
WHERE empresa_id = 6 AND tipo_sessao_id IS NULL AND modelo_aeronave IS NULL
  AND id IN (143, 144);
