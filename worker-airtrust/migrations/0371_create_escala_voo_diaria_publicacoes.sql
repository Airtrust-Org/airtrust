-- Migration 0371: Publicações versionadas da Escala de Voo Diária (EVD)
-- Cria trilha auditável de publicação agregada por empresa/data com revisões.

CREATE TABLE IF NOT EXISTS escala_voo_diaria_publicacoes (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  data_ref TEXT NOT NULL,
  revisao INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'PUBLICADA',
  payload_json TEXT NOT NULL,
  checksum TEXT NOT NULL,
  observacoes TEXT,
  publicado_por TEXT,
  publicado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  UNIQUE (empresa_id, data_ref, revisao)
);

CREATE INDEX IF NOT EXISTS idx_evd_pub_empresa_data_revisao
  ON escala_voo_diaria_publicacoes (empresa_id, data_ref, revisao);

CREATE INDEX IF NOT EXISTS idx_evd_pub_empresa_data_deleted
  ON escala_voo_diaria_publicacoes (empresa_id, data_ref, deleted_at);

CREATE INDEX IF NOT EXISTS idx_evd_pub_checksum
  ON escala_voo_diaria_publicacoes (checksum);
