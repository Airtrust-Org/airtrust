-- 0335_lms_cursos.sql
-- Módulo LMS nativo: catálogo de cursos
-- Suporta SCORM 1.2 e SCORM 2004; vínculo opcional com qualificacao_tipo para
-- geração automática de qualificação ao concluir o curso.

CREATE TABLE IF NOT EXISTS lms_cursos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,

  -- Identificação
  titulo TEXT NOT NULL,
  descricao TEXT,
  categoria TEXT,                          -- ex: 'segurança_operacional', 'regulatório', 'comportamental'
  carga_horaria_minutos INTEGER DEFAULT 0,
  idioma TEXT DEFAULT 'pt-BR',
  thumbnail_r2_key TEXT,                   -- chave R2 da imagem de capa

  -- SCORM
  scorm_versao TEXT CHECK (scorm_versao IN ('1.2', '2004', NULL)), -- NULL = não é SCORM (PDF/vídeo)
  scorm_package_r2_prefix TEXT,            -- prefixo R2: lms/scorm/{empresa_id}/{curso_id}/
  scorm_launch_file TEXT,                  -- arquivo HTML de lançamento (relativo ao prefixo)
  scorm_mastery_score INTEGER DEFAULT 70,  -- pontuação mínima para aprovação (%)

  -- Vínculo com qualificação automática
  qualificacao_tipo_id INTEGER,            -- FK para qualificacoes_tipos.id
  gerar_qualificacao_ao_concluir INTEGER NOT NULL DEFAULT 0, -- 1 = sim

  -- Controle
  ativo INTEGER NOT NULL DEFAULT 1,
  publicado INTEGER NOT NULL DEFAULT 0,    -- cursos não publicados não aparecem no catálogo
  version_tag TEXT,                        -- ex: 'v1.2.3' para controle de versão do pacote

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,

  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (qualificacao_tipo_id) REFERENCES qualificacoes_tipos(id)
);

-- Trigger updated_at
CREATE TRIGGER IF NOT EXISTS trg_lms_cursos_updated_at
AFTER UPDATE ON lms_cursos
FOR EACH ROW
BEGIN
  UPDATE lms_cursos SET updated_at = datetime('now') WHERE id = NEW.id;
END;
