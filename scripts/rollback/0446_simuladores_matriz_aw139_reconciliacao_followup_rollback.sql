-- Rollback for 0446_simuladores_matriz_aw139_reconciliacao_followup.sql.
--
-- OPERATIONAL MARKERS (guard:operational-sql-sources):
-- source_reference: same as 0446 — no new source data, reverses that
--   migration's own writes by exact prior value.
-- operational_decision: revert the 9 renames and the 1 FAP-link insert
--   pair, each scoped by id + exact value 0446 wrote.
-- dry_run_required: run against a local D1 copy seeded from a production
--   export taken after 0446, before use.
-- rollback_plan_required: this file is the rollback plan; both directions
--   are idempotent by construction (no is_current flip involved here,
--   unlike 0445's fix 2).

DELETE FROM modelos_sessao_checks WHERE modelo_id = 153 AND qualificacao_tipo_id IN (79, 77);

UPDATE modelos_sessao SET nome = 'A139-I-06/12',              updated_at = datetime('now') WHERE id = 145 AND empresa_id = 6 AND nome = 'AFCS, air data e reversão para voo manual';
UPDATE modelos_sessao SET nome = 'A139-I-08/12',              updated_at = datetime('now') WHERE id = 146 AND empresa_id = 6 AND nome = 'Rotor, transmissão, hidráulico e rotor de cauda';
UPDATE modelos_sessao SET nome = 'A139-P-01/04-C1',           updated_at = datetime('now') WHERE id = 147 AND empresa_id = 6 AND nome = 'VFR, emergências e aplicação do QRH';
UPDATE modelos_sessao SET nome = 'A139-P-02/04-C1-OFFSHORE',  updated_at = datetime('now') WHERE id = 148 AND empresa_id = 6 AND nome = 'Offshore, CAT A, TDP/LDP, ditching e autorrotação';
UPDATE modelos_sessao SET nome = 'A139-P-01/04-C2',           updated_at = datetime('now') WHERE id = 149 AND empresa_id = 6 AND nome = 'VFR, emergências e aplicação do QRH';
UPDATE modelos_sessao SET nome = 'A139-P-02/04-C2-OFFSHORE',  updated_at = datetime('now') WHERE id = 150 AND empresa_id = 6 AND nome = 'Offshore, CAT A, TDP/LDP, ditching e autorrotação';
UPDATE modelos_sessao SET nome = 'A139-P-01/04-C3',           updated_at = datetime('now') WHERE id = 151 AND empresa_id = 6 AND nome = 'VFR, emergências e aplicação do QRH';
UPDATE modelos_sessao SET nome = 'A139-P-02/04-C3-OFFSHORE',  updated_at = datetime('now') WHERE id = 152 AND empresa_id = 6 AND nome = 'Offshore, CAT A, TDP/LDP, ditching e autorrotação';
UPDATE modelos_sessao SET nome = 'A139-S-02/02-C3',           updated_at = datetime('now') WHERE id = 153 AND empresa_id = 6 AND nome = 'Consolidação IFR e sistemas';
