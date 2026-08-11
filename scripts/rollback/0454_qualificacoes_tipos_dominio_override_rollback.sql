-- Rollback for 0454_qualificacoes_tipos_dominio_override.sql.
--
-- NEUTRALIZE, DO NOT DROP the new column, following the same precedent as
-- 0452_operational_domain_rbac_rollback.sql: this local D1 snapshot has a
-- pre-existing, unrelated broken trigger
-- (trg_matriz_manobra_resolution_mesmo_tenant, references
-- manobras.empresa_id and fails to resolve it) that makes SQLite's
-- ALTER TABLE ... DROP COLUMN fail on ANY table, because it performs a
-- full schema-consistency rewrite that validates every trigger in the
-- database, not just the ones on the target table. Production may carry
-- the same landmine, so this rollback avoids DROP COLUMN entirely: it
-- clears every override value and drops the now-unused index. The leftover
-- column is inert (NULL, never read once resolveResourceDomain's
-- tipo-override precedence step is reverted in code) and additive, so it
-- does not need to be physically removed for the rollback to be complete.
--
-- OPERATIONAL MARKERS (guard:operational-sql-sources):
--   source_reference: same as 0454 — reverses only that migration's own
--     additive schema change; no new production data referenced.
--   operational_decision: clear qualificacoes_tipos.dominio_codigo on every
--     row (there should be none set unless a human explicitly classified a
--     tipo via the admin tool after this migration was applied) and drop
--     the index. No other column or table is touched.
--   dry_run_required: run against a local D1 copy after 0454 has been
--     applied; must leave every qualificacoes_tipos row with
--     dominio_codigo NULL.
--   rollback_plan_required: this file is the rollback plan.

UPDATE qualificacoes_tipos SET dominio_codigo = NULL WHERE dominio_codigo IS NOT NULL;

DROP INDEX IF EXISTS idx_qualificacoes_tipos_dominio_codigo;
