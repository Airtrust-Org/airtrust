-- Migration 0489: A-02 - Natural keys tenant-scoped / unicidades globais legadas
-- Requires a read-only preflight proving there are no conflicting ACTIVE rows
-- inside the same tenant under the exact key semantics below.
--
-- Runtime contract:
--   cpf       -> stored/compared as normalized digits; exact equality
--   matricula -> sanitized/trimmed by the canonical CRUD; exact case-sensitive equality
--   email     -> canonical identity/linkage is case-insensitive and trim-insensitive
--
-- Cross-tenant reuse is intentionally allowed.
--
-- Safety ordering: create the replacement tenant-scoped constraints FIRST.
-- Only after all three CREATEs succeed are the known global legacy UNIQUE
-- indexes dropped. This keeps the migration fail-closed even if an apply
-- executor does not wrap the whole file in one transaction.

CREATE UNIQUE INDEX IF NOT EXISTS ux_funcionarios_cpf_empresa_active
  ON funcionarios(empresa_id, cpf)
  WHERE deleted_at IS NULL AND cpf IS NOT NULL AND trim(cpf) != '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_funcionarios_matricula_empresa_active
  ON funcionarios(empresa_id, matricula)
  WHERE deleted_at IS NULL AND matricula IS NOT NULL AND trim(matricula) != '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_funcionarios_email_empresa_active
  ON funcionarios(empresa_id, LOWER(TRIM(email)))
  WHERE deleted_at IS NULL AND email IS NOT NULL AND trim(email) != '';

-- Known global UNIQUE names from historical migrations. Ambiguous historical
-- idx_funcionarios_cpf / idx_funcionarios_matricula names are intentionally
-- NOT dropped: if they exist remotely, preflight is NO-GO pending metadata
-- inspection because those names were both unique and non-unique historically.
DROP INDEX IF EXISTS ux_funcionarios_cpf;
DROP INDEX IF EXISTS ux_funcionarios_matricula;
DROP INDEX IF EXISTS ux_funcionarios_email;

-- qualificacoes_tipos already has the tenant-scoped replacement from 0462.
DROP INDEX IF EXISTS ux_qualificacoes_tipos_codigo;
