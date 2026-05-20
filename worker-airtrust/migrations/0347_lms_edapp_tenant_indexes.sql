-- 0347_lms_edapp_tenant_indexes.sql
-- Performance indexes for tenant-scoped LMS/EdApp queries

CREATE INDEX IF NOT EXISTS idx_edapp_usuarios_empresa_user_active
  ON integracoes_edapp_usuarios(empresa_id, edapp_user_id, ativo)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_edapp_cursos_empresa_course_active
  ON integracoes_edapp_cursos(empresa_id, edapp_course_id, ativo)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_edapp_eventos_empresa_processado_created
  ON integracoes_edapp_eventos(empresa_id, processado, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_edapp_eventos_empresa_lookup
  ON integracoes_edapp_eventos(empresa_id, tipo_evento, edapp_user_id, edapp_course_id, created_at DESC)
  WHERE deleted_at IS NULL;