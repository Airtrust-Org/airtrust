-- FRMS: preferencia de fonte de calculo por tripulante/competencia (SIGVOOS x FIRA)

CREATE TABLE IF NOT EXISTS frms_fonte_calculo_competencia (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER,
  tripulante_id INTEGER NOT NULL,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  fonte_escolhida TEXT NOT NULL CHECK (fonte_escolhida IN ('SIGVOOS', 'FIRA')),
  escolhido_por TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_frms_fonte_calculo_competencia_uq
  ON frms_fonte_calculo_competencia(empresa_id, tripulante_id, ano, mes)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_frms_fonte_calculo_competencia_lookup
  ON frms_fonte_calculo_competencia(tripulante_id, ano, mes, deleted_at);
