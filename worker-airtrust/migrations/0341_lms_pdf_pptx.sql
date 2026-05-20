-- 0341_lms_pdf_pptx.sql
-- Expande tipo_conteudo para suportar 'pdf' e 'pptx'
-- Adiciona colunas para armazenamento de arquivos PDF/PPTX no R2
-- SQLite não suporta DROP CONSTRAINT, portanto recriamos a tabela lms_cursos.

PRAGMA foreign_keys = OFF;

CREATE TABLE lms_cursos_v341 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  titulo TEXT NOT NULL,
  descricao TEXT,
  categoria TEXT,
  carga_horaria_minutos INTEGER DEFAULT 0,
  idioma TEXT DEFAULT 'pt-BR',
  thumbnail_r2_key TEXT,
  scorm_versao TEXT CHECK (scorm_versao IN ('1.2', '2004', NULL)),
  scorm_package_r2_prefix TEXT,
  scorm_launch_file TEXT,
  scorm_mastery_score INTEGER DEFAULT 70,
  qualificacao_tipo_id INTEGER,
  gerar_qualificacao_ao_concluir INTEGER NOT NULL DEFAULT 0,
  ativo INTEGER NOT NULL DEFAULT 1,
  publicado INTEGER NOT NULL DEFAULT 0,
  version_tag TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  tipo_conteudo TEXT NOT NULL DEFAULT 'scorm'
    CHECK (tipo_conteudo IN ('scorm', 'h5p', 'video', 'pdf', 'pptx')),
  conteudo_programatico TEXT,
  observacoes TEXT,
  carga_horaria_inicial_horas REAL,
  carga_horaria_recorrente_horas REAL,
  -- Novas colunas para conteúdo PDF e PPTX
  pdf_r2_key TEXT,
  pptx_r2_key TEXT,
  pptx_slide_count INTEGER DEFAULT 0,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (qualificacao_tipo_id) REFERENCES qualificacoes_tipos(id)
);

INSERT INTO lms_cursos_v341 SELECT
  id, empresa_id, titulo, descricao, categoria, carga_horaria_minutos,
  idioma, thumbnail_r2_key, scorm_versao, scorm_package_r2_prefix,
  scorm_launch_file, scorm_mastery_score, qualificacao_tipo_id,
  gerar_qualificacao_ao_concluir, ativo, publicado, version_tag,
  created_at, updated_at, deleted_at, tipo_conteudo,
  conteudo_programatico, observacoes, carga_horaria_inicial_horas,
  carga_horaria_recorrente_horas,
  NULL, NULL, 0
FROM lms_cursos;

DROP TABLE lms_cursos;
ALTER TABLE lms_cursos_v341 RENAME TO lms_cursos;

DROP TRIGGER IF EXISTS trg_lms_cursos_updated_at;
CREATE TRIGGER trg_lms_cursos_updated_at
AFTER UPDATE ON lms_cursos
FOR EACH ROW
BEGIN
  UPDATE lms_cursos SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- Recriar índices
CREATE INDEX IF NOT EXISTS idx_lms_cursos_empresa_publicado
  ON lms_cursos (empresa_id, publicado, ativo)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_lms_cursos_empresa_categoria
  ON lms_cursos (empresa_id, categoria)
  WHERE deleted_at IS NULL AND ativo = 1;

CREATE INDEX IF NOT EXISTS idx_lms_cursos_qualificacao_tipo
  ON lms_cursos (qualificacao_tipo_id)
  WHERE deleted_at IS NULL;

PRAGMA foreign_keys = ON;
