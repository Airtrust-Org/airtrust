-- Migration 0452: Operational domain RBAC foundation
--
-- Introduces the canonical operational-domain catalog and additive,
-- nullable domain-classification columns for the "gestor operational
-- autonomy" RBAC (see docs/rbac/gestor-operational-autonomy.md).
--
-- Fail-closed by design, but SAFE ON APPLY: every new column defaults to
-- NULL/0 and grants NO new access and revokes nothing. The new
-- authorization layer only activates per tenant via
-- empresas.operational_domain_rbac_enabled (default 0 = legacy behavior
-- preserved). It can only be flipped to 1 by an ADMINISTRADOR, and only
-- after GET /api/admin/operational-domain-rbac/readiness reports no
-- blockers for that tenant.
--
-- Domain identity is the TEXT codigo (OPERACOES, MANUTENCAO, SGSO, FRMS,
-- CORPORATIVO), never a numeric id — see dominios_operacionais below.
--
-- OPERATIONAL MARKERS (guard:operational-sql-sources):
-- source_reference: none — this migration seeds a static, code-defined
--   catalog (the 5 canonical domain codes from the RBAC spec), not a
--   correction derived from production data.
-- operational_decision: seed dominios_operacionais with the 5 fixed rows.
--   No existing table's data is modified — setores / qualificacoes_categorias
--   / lms_cursos / empresas only gain new nullable or zero-default columns.
-- dry_run_required: run once against a local D1 copy; the seed INSERT is
--   idempotent (INSERT OR IGNORE) and the ALTERs are additive-only.
-- rollback_plan_required: see 0452_operational_domain_rbac_rollback.sql —
--   drops the new columns/table/indexes, additive-only reversal.

CREATE TABLE IF NOT EXISTS dominios_operacionais (
  codigo TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK(ativo IN (0,1))
);

INSERT OR IGNORE INTO dominios_operacionais (codigo, nome) VALUES
  ('OPERACOES', 'Operações'),
  ('MANUTENCAO', 'Manutenção'),
  ('SGSO', 'SGSO'),
  ('FRMS', 'FRMS'),
  ('CORPORATIVO', 'Corporativo');

-- setores.dominio_codigo: NULL means "no domain classified yet" and, once
-- the tenant flag is on, fails closed (no operational grant through that
-- setor). Backfill/classification is an explicit admin action, not done here.
-- No DB-level FOREIGN KEY/CHECK here on purpose: SQLite forbids
-- ALTER TABLE ... DROP COLUMN on a column bound by a FK or CHECK
-- constraint, which would make 0452_..._rollback.sql impossible without a
-- full table rebuild. Validity against dominios_operacionais is enforced
-- in the application layer (operational-domain-access.ts).
ALTER TABLE setores ADD COLUMN dominio_codigo TEXT;

-- qualificacoes_categorias.dominio_codigo: qualificacao_tipos and
-- qualificacoes_historico inherit domain via categoria_id -> this column,
-- reusing the classification work already done in migration 0412/0450
-- instead of adding a parallel per-tipo field.
ALTER TABLE qualificacoes_categorias ADD COLUMN dominio_codigo TEXT;

-- lms_cursos.dominio_codigo: explicit, NOT inherited. Discovery confirmed
-- lms_cursos rows can exist with both qualificacao_tipo_id and categoria
-- NULL (worker-airtrust/src/routes/lms-cursos.ts CursoCreateSchema makes
-- both optional), so forcing inheritance would silently misclassify or
-- unblock independent courses. A course with dominio_codigo NULL fails
-- closed once the tenant flag is enabled, same as an unclassified setor.
ALTER TABLE lms_cursos ADD COLUMN dominio_codigo TEXT;

-- Per-tenant rollout switch. Default 0 preserves current (legacy) behavior
-- for every existing tenant on migration apply — nobody loses access.
-- No CHECK constraint for the same DROP COLUMN reason as above; 0/1 is
-- enforced in the application layer.
ALTER TABLE empresas ADD COLUMN operational_domain_rbac_enabled INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_setores_dominio_codigo ON setores(dominio_codigo);
CREATE INDEX IF NOT EXISTS idx_qualificacoes_categorias_dominio_codigo ON qualificacoes_categorias(dominio_codigo);
CREATE INDEX IF NOT EXISTS idx_lms_cursos_dominio_codigo ON lms_cursos(dominio_codigo);
