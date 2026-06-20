-- BLOQUEADO / NAO EXECUTAR
-- Draft documental da futura migration 0412.
-- Este arquivo NAO esta em worker-airtrust/migrations e NAO deve ser aplicado por wrangler.
-- PR-1 usa temporariamente frms_read_ack_events.ack_note com JSON estruturado.

-- Objetivo futuro:
-- Materializar overrides de decisao operacional FRMS em tabela propria append-only,
-- com chave de tenant obrigatoria e referencia ao evento read/ack origem.

CREATE TABLE IF NOT EXISTS frms_decisao_override (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  event_id TEXT NOT NULL,
  responsavel_user_id INTEGER NOT NULL,
  justificativa TEXT NOT NULL,
  evidencia_ref TEXT,
  decisao_original TEXT,
  decisao_final TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  schema_version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_frms_decisao_override_empresa_event
  ON frms_decisao_override (empresa_id, event_id);

CREATE INDEX IF NOT EXISTS idx_frms_decisao_override_empresa_created
  ON frms_decisao_override (empresa_id, created_at);

-- NAO EXECUTAR neste PR:
-- wrangler d1 migrations apply
-- wrangler d1 execute
-- SQL remoto
