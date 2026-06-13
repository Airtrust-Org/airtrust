-- 0408_lms_cursos_setores.sql
-- Tabela N:N entre lms_cursos e setores.
-- Permite que um curso sirva a múltiplos setores de forma independente
-- da qualificação vinculada (qualificacao_tipo_id).

CREATE TABLE IF NOT EXISTS lms_cursos_setores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  curso_id INTEGER NOT NULL,
  setor_id INTEGER NOT NULL,
  empresa_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  deleted_at TEXT,
  FOREIGN KEY (curso_id) REFERENCES lms_cursos(id),
  FOREIGN KEY (setor_id) REFERENCES setores(id),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lms_cursos_setores_unique_active
  ON lms_cursos_setores(curso_id, setor_id, empresa_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_lms_cursos_setores_curso
  ON lms_cursos_setores(curso_id, empresa_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_lms_cursos_setores_setor
  ON lms_cursos_setores(setor_id, empresa_id)
  WHERE deleted_at IS NULL;
