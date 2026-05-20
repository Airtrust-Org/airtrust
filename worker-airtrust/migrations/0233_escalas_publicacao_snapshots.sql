-- 0233_escalas_publicacao_snapshots.sql
-- Persistência de snapshots reais no momento da publicação da escala

CREATE TABLE IF NOT EXISTS escala_publicacao_snapshots (
  id TEXT PRIMARY KEY,
  escala_id TEXT NOT NULL,
  empresa_id TEXT,
  publicado_por TEXT,
  publicado_em TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  deleted_at TEXT,
  FOREIGN KEY (escala_id) REFERENCES escalas_mensais(id)
);

CREATE INDEX IF NOT EXISTS idx_escala_publicacao_snapshots_escala
  ON escala_publicacao_snapshots(escala_id, publicado_em DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_escala_publicacao_snapshots_empresa
  ON escala_publicacao_snapshots(empresa_id, escala_id, publicado_em DESC)
  WHERE deleted_at IS NULL;
