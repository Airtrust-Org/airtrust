-- 0338_lms_indexes.sql
-- Módulo LMS: índices de performance para as queries mais frequentes

-- ── lms_cursos ───────────────────────────────────────────────────────────────

-- Listar cursos por empresa (catálogo)
CREATE INDEX IF NOT EXISTS idx_lms_cursos_empresa_publicado
  ON lms_cursos (empresa_id, publicado, ativo)
  WHERE deleted_at IS NULL;

-- Busca por categoria dentro da empresa
CREATE INDEX IF NOT EXISTS idx_lms_cursos_empresa_categoria
  ON lms_cursos (empresa_id, categoria)
  WHERE deleted_at IS NULL AND ativo = 1;

-- Vínculo com qualificacao_tipo (para reconciliação)
CREATE INDEX IF NOT EXISTS idx_lms_cursos_qualificacao_tipo
  ON lms_cursos (qualificacao_tipo_id)
  WHERE deleted_at IS NULL;

-- ── lms_matriculas ───────────────────────────────────────────────────────────

-- Matrículas por funcionário (aba "Meus Cursos")
CREATE INDEX IF NOT EXISTS idx_lms_matriculas_funcionario
  ON lms_matriculas (funcionario_id, empresa_id, status)
  WHERE deleted_at IS NULL;

-- Matrículas por curso (relatório de conclusão)
CREATE INDEX IF NOT EXISTS idx_lms_matriculas_curso_status
  ON lms_matriculas (curso_id, empresa_id, status)
  WHERE deleted_at IS NULL;

-- Lookup único curso+funcionário+empresa
CREATE INDEX IF NOT EXISTS idx_lms_matriculas_lookup
  ON lms_matriculas (curso_id, funcionario_id, empresa_id)
  WHERE deleted_at IS NULL;

-- Matrículas pendentes (para relatório de inatividade)
CREATE INDEX IF NOT EXISTS idx_lms_matriculas_inicio
  ON lms_matriculas (empresa_id, data_inicio, status)
  WHERE deleted_at IS NULL;

-- ── lms_progresso_scorm ──────────────────────────────────────────────────────

-- Lookup por matrícula (hot path do SCORM commit)
CREATE INDEX IF NOT EXISTS idx_lms_progresso_matricula
  ON lms_progresso_scorm (matricula_id);

-- Por empresa + último commit (relatório de atividade)
CREATE INDEX IF NOT EXISTS idx_lms_progresso_empresa_commit
  ON lms_progresso_scorm (empresa_id, last_commit_at);
