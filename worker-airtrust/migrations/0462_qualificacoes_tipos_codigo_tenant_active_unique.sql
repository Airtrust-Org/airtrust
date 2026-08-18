-- Migration 0462: scope qualificacoes_tipos.codigo uniqueness by tenant + active lifecycle.
-- source_reference: overnight P0 audit 20260817/20260818 — Qualification Writer Convergence
--   pre-check found migration 0402 recreated idx_qualificacoes_tipos_codigo as a GLOBAL
--   (not tenant-scoped) unique index on `codigo`, confirmed empirically in a disposable
--   SQLite file to block two different tenants from both holding an active code (e.g. CMA).
--   Same bug class already fixed for a different table by migration 0455
--   (0455_aeronaves_codigo_tenant_active_unique.sql).
-- operational_decision: unlike 0455's table, qualificacoes_tipos.codigo is NOT a
--   column-level UNIQUE constraint — it is only enforced by this separate, droppable
--   index — so no table rebuild is required, just DROP + recreate the index tenant-scoped.
-- dry_run_required: yes; before applying in any environment, run:
--     SELECT empresa_id, codigo, COUNT(*) FROM qualificacoes_tipos
--      WHERE deleted_at IS NULL GROUP BY empresa_id, codigo HAVING COUNT(*) > 1;
--   and confirm zero rows before proceeding.
-- rollback_plan_required: yes; run in this exact order:
--     DROP INDEX IF EXISTS idx_qualificacoes_tipos_codigo_empresa_active;
--     CREATE UNIQUE INDEX IF NOT EXISTS idx_qualificacoes_tipos_codigo
--       ON qualificacoes_tipos(codigo) WHERE deleted_at IS NULL;
--   (restores the original global-uniqueness behavior; only safe if no cross-tenant
--   duplicate codes were created while the tenant-scoped index was active).
--
-- NOT APPLIED as part of this change. Apply manually per CLAUDE.md — local via
-- `wrangler d1 execute ... --local`, remote only via
-- scripts/apply-migration-production.sh with explicit authorization.

DROP INDEX IF EXISTS idx_qualificacoes_tipos_codigo;

CREATE UNIQUE INDEX IF NOT EXISTS idx_qualificacoes_tipos_codigo_empresa_active
  ON qualificacoes_tipos(empresa_id, codigo COLLATE NOCASE)
  WHERE deleted_at IS NULL;
