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

DROP INDEX IF EXISTS ux_qualificacoes_tipos_codigo;
DROP INDEX IF EXISTS ux_funcionarios_cpf;
DROP INDEX IF EXISTS idx_funcionarios_cpf;
DROP INDEX IF EXISTS ux_funcionarios_matricula;
DROP INDEX IF EXISTS idx_funcionarios_matricula;
DROP INDEX IF EXISTS ux_funcionarios_email;

CREATE UNIQUE INDEX IF NOT EXISTS ux_funcionarios_cpf_empresa_active
  ON funcionarios(empresa_id, cpf)
  WHERE deleted_at IS NULL AND cpf IS NOT NULL AND trim(cpf) != '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_funcionarios_matricula_empresa_active
  ON funcionarios(empresa_id, matricula)
  WHERE deleted_at IS NULL AND matricula IS NOT NULL AND trim(matricula) != '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_funcionarios_email_empresa_active
  ON funcionarios(empresa_id, LOWER(TRIM(email)))
  WHERE deleted_at IS NULL AND email IS NOT NULL AND trim(email) != '';
