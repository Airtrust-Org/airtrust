-- Migration 0489: A-02 - Natural keys tenant-scoped / unicidades globais legadas
-- Preflight requirements: verify no cross-tenant collisions on CPF, Matricula, Email using validation scripts.

DROP INDEX IF EXISTS ux_qualificacoes_tipos_codigo;
DROP INDEX IF EXISTS ux_funcionarios_cpf;
DROP INDEX IF EXISTS idx_funcionarios_cpf;
DROP INDEX IF EXISTS ux_funcionarios_matricula;
DROP INDEX IF EXISTS idx_funcionarios_matricula;
DROP INDEX IF EXISTS ux_funcionarios_email;

-- Create explicit tenant-scoped partial indexes for active records, maintaining case insensitivity
CREATE UNIQUE INDEX IF NOT EXISTS ux_funcionarios_cpf_empresa_active 
  ON funcionarios(empresa_id, cpf COLLATE NOCASE) 
  WHERE deleted_at IS NULL AND cpf IS NOT NULL AND trim(cpf) != '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_funcionarios_matricula_empresa_active 
  ON funcionarios(empresa_id, matricula COLLATE NOCASE) 
  WHERE deleted_at IS NULL AND matricula IS NOT NULL AND trim(matricula) != '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_funcionarios_email_empresa_active 
  ON funcionarios(empresa_id, email COLLATE NOCASE) 
  WHERE deleted_at IS NULL AND email IS NOT NULL AND trim(email) != '';
