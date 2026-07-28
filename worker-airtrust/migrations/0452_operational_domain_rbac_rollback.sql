-- Rollback for 0452_operational_domain_rbac.sql.
--
-- NEUTRALIZE, DO NOT DROP the new columns on setores /
-- qualificacoes_categorias / lms_cursos / empresas. Verified locally that
-- SQLite's ALTER TABLE ... DROP COLUMN performs a full schema-consistency
-- rewrite that validates every trigger in the database, not just the ones
-- on the target table. This local D1 snapshot already has a pre-existing,
-- unrelated broken trigger (trg_matriz_manobra_resolution_mesmo_tenant,
-- references manobras.empresa_id and fails to resolve it) which makes
-- DROP COLUMN fail on ANY table right now — confirmed via a local dry run.
-- Since production may carry the same or a similar landmine, this rollback
-- avoids DROP COLUMN entirely: it disables the flag, clears the
-- classification values, and drops the now-unused catalog table/indexes.
-- The four leftover columns are inert (NULL / 0, never read once
-- dominios_operacionais and the guard code are gone) and additive, so they
-- do not need to be physically removed for the rollback to be complete.
--
-- OPERATIONAL MARKERS (guard:operational-sql-sources):
-- source_reference: same as 0452 — no new source data, reverses that
--   migration's own additive schema changes; also documents a pre-existing,
--   unrelated broken trigger found while testing this rollback locally
--   (trg_matriz_manobra_resolution_mesmo_tenant) — out of scope to fix here.
-- operational_decision: set operational_domain_rbac_enabled = 0 on every
--   empresa, clear dominio_codigo on setores / qualificacoes_categorias /
--   lms_cursos, drop dominios_operacionais and its indexes. No historical
--   row in any pre-existing business table is touched.
-- dry_run_required: run against a local D1 copy after 0452 has been
--   applied; must leave every tenant's operational_domain_rbac_enabled = 0
--   and every dominio_codigo NULL.
-- rollback_plan_required: this file is the rollback plan.

UPDATE empresas SET operational_domain_rbac_enabled = 0;
UPDATE lms_cursos SET dominio_codigo = NULL WHERE dominio_codigo IS NOT NULL;
UPDATE qualificacoes_categorias SET dominio_codigo = NULL WHERE dominio_codigo IS NOT NULL;
UPDATE setores SET dominio_codigo = NULL WHERE dominio_codigo IS NOT NULL;

DROP INDEX IF EXISTS idx_lms_cursos_dominio_codigo;
DROP INDEX IF EXISTS idx_qualificacoes_categorias_dominio_codigo;
DROP INDEX IF EXISTS idx_setores_dominio_codigo;

DROP TABLE IF EXISTS dominios_operacionais;
