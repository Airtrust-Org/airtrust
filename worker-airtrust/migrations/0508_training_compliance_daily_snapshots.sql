-- 0508_training_compliance_daily_snapshots.sql
-- Persists deterministic daily compliance snapshots by company, sector, role and sector+role.
-- Zero-valued scope dimensions represent the aggregate level for that dimension.

CREATE TABLE IF NOT EXISTS training_compliance_daily_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  setor_id INTEGER NOT NULL DEFAULT 0,
  funcao_id INTEGER NOT NULL DEFAULT 0,
  snapshot_date TEXT NOT NULL,
  pessoas INTEGER NOT NULL DEFAULT 0,
  pessoas_com_pendencia INTEGER NOT NULL DEFAULT 0,
  requisitos_obrigatorios INTEGER NOT NULL DEFAULT 0,
  conformes INTEGER NOT NULL DEFAULT 0,
  vencendo INTEGER NOT NULL DEFAULT 0,
  vencidos INTEGER NOT NULL DEFAULT 0,
  nao_realizados INTEGER NOT NULL DEFAULT 0,
  em_andamento INTEGER NOT NULL DEFAULT 0,
  compliance_pct REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (setor_id >= 0),
  CHECK (funcao_id >= 0),
  CHECK (pessoas >= 0),
  CHECK (pessoas_com_pendencia >= 0),
  CHECK (requisitos_obrigatorios >= 0),
  CHECK (conformes >= 0),
  CHECK (vencendo >= 0),
  CHECK (vencidos >= 0),
  CHECK (nao_realizados >= 0),
  CHECK (em_andamento >= 0),
  CHECK (compliance_pct IS NULL OR (compliance_pct >= 0 AND compliance_pct <= 100)),
  UNIQUE (empresa_id, setor_id, funcao_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_training_compliance_snapshots_empresa_date
  ON training_compliance_daily_snapshots (empresa_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_training_compliance_snapshots_empresa_setor_date
  ON training_compliance_daily_snapshots (empresa_id, setor_id, funcao_id, snapshot_date DESC);
