-- Rollback for 0447_simuladores_matriz_aw139_sk76_tipo_modelo.sql.
--
-- OPERATIONAL MARKERS (guard:operational-sql-sources):
-- source_reference: same as 0447 — no new source data, reverses that
--   migration's own writes.
-- operational_decision: clear tipo_sessao_id/modelo_aeronave back to NULL
--   on exactly the same 51 ids, guarded by the exact values 0447 wrote so a
--   row a human edited afterwards is left untouched.
-- dry_run_required: run against a local D1 copy seeded from a production
--   export taken after 0447, before use.
-- rollback_plan_required: this file is the rollback plan; idempotent in
--   both directions (no is_current flip, no historical row touched).

UPDATE modelos_sessao SET tipo_sessao_id = NULL, modelo_aeronave = NULL, updated_at = datetime('now')
WHERE empresa_id = 6 AND tipo_sessao_id = 14 AND modelo_aeronave = 'AW139'
  AND id IN (94, 95, 96, 97, 98, 145, 100, 146, 102, 103, 104, 105);

UPDATE modelos_sessao SET tipo_sessao_id = NULL, modelo_aeronave = NULL, updated_at = datetime('now')
WHERE empresa_id = 6 AND tipo_sessao_id = 9 AND modelo_aeronave = 'AW139'
  AND id IN (147, 149, 151, 148, 150, 152, 108, 114, 120, 109, 115, 121);

UPDATE modelos_sessao SET tipo_sessao_id = NULL, modelo_aeronave = NULL, updated_at = datetime('now')
WHERE empresa_id = 6 AND tipo_sessao_id = 21 AND modelo_aeronave = 'AW139'
  AND id IN (110, 116, 122, 111, 117, 153);

UPDATE modelos_sessao SET tipo_sessao_id = NULL, modelo_aeronave = NULL, updated_at = datetime('now')
WHERE empresa_id = 6 AND tipo_sessao_id = 14 AND modelo_aeronave = 'SK76'
  AND id IN (124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135);

UPDATE modelos_sessao SET tipo_sessao_id = NULL, modelo_aeronave = NULL, updated_at = datetime('now')
WHERE empresa_id = 6 AND tipo_sessao_id = 9 AND modelo_aeronave = 'SK76'
  AND id IN (136, 137, 138, 139, 140, 141, 142);

UPDATE modelos_sessao SET tipo_sessao_id = NULL, modelo_aeronave = NULL, updated_at = datetime('now')
WHERE empresa_id = 6 AND tipo_sessao_id = 21 AND modelo_aeronave = 'SK76'
  AND id IN (143, 144);
