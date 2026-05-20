-- 0350_lms_composite_deleted_at_indexes.sql
-- Composite indexes including deleted_at for the most frequent LMS/qualificacoes queries.
-- Every hot-path query uses WHERE empresa_id = ? AND deleted_at IS NULL — without a
-- composite index D1 falls back to a full-scan on deleted_at after the empresa_id lookup.

-- ── lms_matriculas ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_lms_matriculas_empresa_deleted
  ON lms_matriculas (empresa_id, deleted_at);

-- ── lms_cursos ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_lms_cursos_empresa_deleted
  ON lms_cursos (empresa_id, deleted_at);

-- ── qualificacoes_historico ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_qualificacoes_historico_empresa_deleted
  ON qualificacoes_historico (empresa_id, deleted_at);
