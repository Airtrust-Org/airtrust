-- ============================================================
-- 0285 — SGSO workflow tipado + MoC + lições aprendidas
-- ============================================================

ALTER TABLE sgso_relatos ADD COLUMN tipo_investigacao TEXT DEFAULT 'OBSERVACAO';
ALTER TABLE sgso_relatos ADD COLUMN resumo_fechamento TEXT;
ALTER TABLE sgso_relatos ADD COLUMN licoes_aprendidas_json TEXT;

UPDATE sgso_relatos
SET tipo_investigacao = CASE tipo
  WHEN 'ACIDENTE' THEN 'ACIDENTE'
  WHEN 'INCIDENTE' THEN 'INCIDENTE_GRAVE'
  ELSE 'OBSERVACAO'
END
WHERE tipo_investigacao IS NULL;

CREATE INDEX IF NOT EXISTS idx_sgso_relatos_tipo_investigacao
  ON sgso_relatos (empresa_id, tipo_investigacao, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS sgso_licoes_aprendidas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  relato_id TEXT NOT NULL,
  empresa_id INTEGER NOT NULL,
  titulo TEXT NOT NULL,
  resumo TEXT,
  licoes_json TEXT NOT NULL,
  investigation_type TEXT NOT NULL,
  status_publicacao TEXT NOT NULL DEFAULT 'PENDENTE',
  edapp_course_id TEXT,
  edapp_publicado_em TEXT,
  erro_publicacao TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(relato_id)
);

CREATE INDEX IF NOT EXISTS idx_sgso_licoes_empresa_status
  ON sgso_licoes_aprendidas (empresa_id, status_publicacao, updated_at);

CREATE TABLE IF NOT EXISTS sgso_moc_registros (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  titulo TEXT NOT NULL,
  descricao_mudanca TEXT NOT NULL,
  motivo TEXT NOT NULL,
  impacto_operacional TEXT NOT NULL,
  risco_nivel TEXT NOT NULL CHECK (risco_nivel IN ('BAIXO', 'MEDIO', 'ALTO', 'CRITICO')),
  status TEXT NOT NULL DEFAULT 'RASCUNHO' CHECK (status IN (
    'RASCUNHO',
    'EM_AVALIACAO',
    'APROVADO',
    'IMPLEMENTADO',
    'REJEITADO',
    'CANCELADO'
  )),
  data_planejada TEXT,
  owner_id INTEGER,
  aprovado_por INTEGER,
  aprovado_em TEXT,
  areas_afetadas_json TEXT,
  mitigacoes_planejadas_json TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sgso_moc_empresa_status
  ON sgso_moc_registros (empresa_id, status, updated_at)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS sgso_moc_aprovacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  moc_id TEXT NOT NULL,
  empresa_id INTEGER NOT NULL,
  status_novo TEXT NOT NULL,
  observacao TEXT,
  aprovador_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sgso_moc_aprovacoes_moc
  ON sgso_moc_aprovacoes (moc_id, created_at);
