-- 0337_lms_progresso_scorm.sql
-- Módulo LMS nativo: estado SCORM runtime por matrícula
-- Atualizado a cada commit do player (LMSCommit / Commit)

CREATE TABLE IF NOT EXISTS lms_progresso_scorm (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  matricula_id INTEGER NOT NULL,
  empresa_id INTEGER NOT NULL,             -- desnormalizado para eficiência de queries

  -- Campos SCORM 1.2 / 2004 essenciais
  lesson_status TEXT,                      -- SCORM 1.2: 'passed'|'failed'|'completed'|'incomplete'|'not attempted'|'browsed'
  completion_status TEXT,                  -- SCORM 2004: 'completed'|'incomplete'|'not attempted'|'unknown'
  success_status TEXT,                     -- SCORM 2004: 'passed'|'failed'|'unknown'
  score_raw INTEGER,
  score_max INTEGER,
  score_min INTEGER,
  score_scaled REAL,                       -- SCORM 2004: -1.0 a 1.0

  -- Tempo e sessão
  session_time TEXT,                       -- CMITimespan (PT1H2M3S ou HH:MM:SS)
  total_time TEXT,                         -- acumulado de session_time
  session_count INTEGER NOT NULL DEFAULT 1,

  -- Suspend data (bookmark / estado do conteúdo)
  suspend_data TEXT,                       -- até 4096 chars (SCORM 1.2) / 64000 (2004)
  launch_data TEXT,                        -- lido apenas

  -- Dados completos (JSON do CMI inteiro para reconstrução)
  cmi_json TEXT,                           -- JSON com todo o objeto CMI

  -- Controle
  last_commit_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE (matricula_id),

  FOREIGN KEY (matricula_id) REFERENCES lms_matriculas(id),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

-- Trigger updated_at
CREATE TRIGGER IF NOT EXISTS trg_lms_progresso_scorm_updated_at
AFTER UPDATE ON lms_progresso_scorm
FOR EACH ROW
BEGIN
  UPDATE lms_progresso_scorm SET updated_at = datetime('now') WHERE id = NEW.id;
END;
