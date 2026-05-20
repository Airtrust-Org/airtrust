-- 0339_lms_h5p_xapi.sql
-- Módulo LMS: suporte a H5P e xAPI (Tin Can)
-- Extende lms_cursos com tipo_conteudo, adiciona tabelas de conteúdo H5P e statements xAPI.

-- 1. Adicionar tipo_conteudo em lms_cursos
ALTER TABLE lms_cursos ADD COLUMN tipo_conteudo TEXT NOT NULL DEFAULT 'scorm' CHECK (tipo_conteudo IN ('scorm', 'h5p', 'video'));

-- 2. Tabela de conteúdos H5P
CREATE TABLE IF NOT EXISTS lms_h5p_conteudos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  titulo TEXT NOT NULL,
  -- Tipo H5P: ex. 'InteractiveVideo', 'CoursePresentation', 'QuestionSet', 'Column'
  tipo_h5p TEXT NOT NULL DEFAULT 'CoursePresentation',
  r2_key TEXT,                              -- chave R2 do .h5p descompactado: lms/h5p/{empresa_id}/{id}/
  versao TEXT,                              -- versão da biblioteca H5P, ex: 'H5P.CoursePresentation 1.24'
  ativo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

CREATE TRIGGER IF NOT EXISTS trg_lms_h5p_conteudos_updated_at
AFTER UPDATE ON lms_h5p_conteudos
FOR EACH ROW
BEGIN
  UPDATE lms_h5p_conteudos SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- 3. Tabela de statements xAPI (Tin Can)
CREATE TABLE IF NOT EXISTS lms_xapi_statements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  matricula_id INTEGER NOT NULL,            -- FK → lms_matriculas.id

  -- Campos xAPI principais (armazenados como TEXT/JSON para flexibilidade)
  actor_json TEXT NOT NULL,                 -- { "mbox": "mailto:...", "name": "..." }
  verb_id TEXT NOT NULL,                    -- ex: "http://adlnet.gov/expapi/verbs/completed"
  verb_display TEXT,                        -- label localizado, ex: "completou"
  object_id TEXT NOT NULL,                  -- IRI do objeto (curso/atividade)
  object_type TEXT DEFAULT 'Activity',      -- 'Activity' | 'Agent' | 'Group' | 'StatementRef'
  result_json TEXT,                         -- { "success": true, "completion": true, "score": {...} }
  context_json TEXT,                        -- { "contextActivities": {...}, ... }
  timestamp TEXT,                           -- ISO 8601 do momento da ação no cliente

  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (matricula_id) REFERENCES lms_matriculas(id)
);

-- Indexes para lms_h5p_conteudos
CREATE INDEX IF NOT EXISTS idx_lms_h5p_empresa ON lms_h5p_conteudos (empresa_id) WHERE deleted_at IS NULL;

-- Indexes para lms_xapi_statements
CREATE INDEX IF NOT EXISTS idx_lms_xapi_matricula    ON lms_xapi_statements (matricula_id);
CREATE INDEX IF NOT EXISTS idx_lms_xapi_empresa_verb ON lms_xapi_statements (empresa_id, verb_id);
CREATE INDEX IF NOT EXISTS idx_lms_xapi_timestamp    ON lms_xapi_statements (empresa_id, timestamp);
