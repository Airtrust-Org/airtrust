-- ============================================================
-- Migration 0219: FRMS notificacoes hardening
-- - Adiciona deleted_at para soft delete consistente
-- - Garante FK funcionario_id -> funcionarios(id)
-- - Recria índices com filtro deleted_at
-- ============================================================

PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS frms_notificacao_destinatario_new (
  id TEXT PRIMARY KEY,
  alerta_id TEXT NOT NULL,
  funcionario_id INTEGER NOT NULL,
  cargo TEXT NOT NULL,
  lido INTEGER DEFAULT 0,
  lido_em TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (alerta_id) REFERENCES frms_alerta(id),
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);

INSERT INTO frms_notificacao_destinatario_new (
  id,
  alerta_id,
  funcionario_id,
  cargo,
  lido,
  lido_em,
  created_at,
  deleted_at
)
SELECT
  id,
  alerta_id,
  funcionario_id,
  cargo,
  COALESCE(lido, 0),
  lido_em,
  COALESCE(created_at, datetime('now')),
  NULL
FROM frms_notificacao_destinatario;

DROP TABLE frms_notificacao_destinatario;
ALTER TABLE frms_notificacao_destinatario_new RENAME TO frms_notificacao_destinatario;

CREATE INDEX IF NOT EXISTS idx_frms_notif_dest_funcionario
  ON frms_notificacao_destinatario(funcionario_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_frms_notif_dest_alerta
  ON frms_notificacao_destinatario(alerta_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_frms_notif_dest_lido
  ON frms_notificacao_destinatario(lido)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_frms_notif_dest_deleted
  ON frms_notificacao_destinatario(deleted_at);

PRAGMA foreign_keys = ON;
