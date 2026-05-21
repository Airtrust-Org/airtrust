-- Migration 0370: Justificativas operacionais estruturadas para Escala de Voo Diária (EVD)
-- Não substituir observacoes; trilha auditável mínima por item de escala diária.

CREATE TABLE IF NOT EXISTS escala_voo_diaria_justificativas (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  empresa_id INTEGER NOT NULL,
  escala_voo_diaria_id TEXT NOT NULL,
  funcionario_id INTEGER,
  papel TEXT,
  origem_alerta TEXT NOT NULL,     -- FRMS | REPOUSO | DUPLICIDADE | OPERACIONAL | OUTRO
  tipo_alerta TEXT,
  nivel_alerta TEXT,
  decisao TEXT NOT NULL,           -- MANTER_ESCALA | SUBSTITUIR | ACIONAR_STANDBY | ADICIONAR_OBSERVACAO | OUTRO
  justificativa TEXT NOT NULL,
  alerta_ref_id TEXT,
  criado_por TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_evd_just_empresa_escala
  ON escala_voo_diaria_justificativas (empresa_id, escala_voo_diaria_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_evd_just_empresa_funcionario
  ON escala_voo_diaria_justificativas (empresa_id, funcionario_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_evd_just_empresa_created
  ON escala_voo_diaria_justificativas (empresa_id, created_at)
  WHERE deleted_at IS NULL;
