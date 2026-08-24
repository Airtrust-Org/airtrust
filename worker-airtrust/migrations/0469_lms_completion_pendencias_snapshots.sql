-- 0469 — Snapshot do diagnóstico granular AIRTRUST_COMPLETION_DIAGNOSTICS_V1
--
-- Guarda o ÚLTIMO snapshot informativo emitido pelo pacote SCORM para cada
-- (empresa, matrícula, curso, tentativa). O conteúdo é meramente explicativo:
-- nunca altera lesson_status, score, status de matrícula, qualificação ou
-- certificado. A autoridade canônica de conclusão permanece em
-- worker-airtrust/src/services/lms-progress-guardrails.ts.
--
-- Serve para que o painel "Pendências para concluir" sobreviva a um reload.

CREATE TABLE IF NOT EXISTS lms_completion_diagnostics_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  matricula_id INTEGER NOT NULL,
  curso_id INTEGER NOT NULL,
  tentativa INTEGER NOT NULL DEFAULT 1,
  -- Payload V1 já sanitizado, serializado como JSON.
  diagnostics_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Um snapshot corrente por matrícula/tentativa, sempre escopado por empresa.
CREATE UNIQUE INDEX IF NOT EXISTS idx_lms_completion_diag_unique
  ON lms_completion_diagnostics_snapshots (empresa_id, matricula_id, curso_id, tentativa);

CREATE INDEX IF NOT EXISTS idx_lms_completion_diag_matricula
  ON lms_completion_diagnostics_snapshots (empresa_id, matricula_id);
