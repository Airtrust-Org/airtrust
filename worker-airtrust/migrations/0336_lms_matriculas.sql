-- 0336_lms_matriculas.sql
-- Módulo LMS nativo: vínculo entre funcionário e curso (matrícula)

CREATE TABLE IF NOT EXISTS lms_matriculas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  curso_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,

  -- Status do ciclo de vida
  -- 'NAO_INICIADO' | 'EM_ANDAMENTO' | 'CONCLUIDO' | 'REPROVADO' | 'CANCELADO'
  status TEXT NOT NULL DEFAULT 'NAO_INICIADO',

  -- Progresso
  progresso_pct INTEGER DEFAULT 0,         -- 0 a 100
  score_final INTEGER,                     -- score de conclusão do SCORM (0-100)
  tentativas INTEGER NOT NULL DEFAULT 0,

  -- Datas
  data_inicio TEXT,                        -- quando o aluno acessou pela primeira vez
  data_conclusao TEXT,                     -- quando status = CONCLUIDO ou REPROVADO
  data_expiracao TEXT,                     -- prazo para conclusão (opcional)
  data_matricula TEXT NOT NULL DEFAULT (datetime('now')),

  -- Geração de qualificação
  qualificacao_historico_id INTEGER,       -- FK para qualificacoes_historico.id (se gerada)

  -- Quem matriculou
  matriculado_por INTEGER,                 -- funcionario_id do gestor/admin que matriculou

  -- Metadados
  observacoes TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,

  UNIQUE (curso_id, funcionario_id, empresa_id),

  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (curso_id) REFERENCES lms_cursos(id),
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);

-- Trigger updated_at
CREATE TRIGGER IF NOT EXISTS trg_lms_matriculas_updated_at
AFTER UPDATE ON lms_matriculas
FOR EACH ROW
BEGIN
  UPDATE lms_matriculas SET updated_at = datetime('now') WHERE id = NEW.id;
END;
