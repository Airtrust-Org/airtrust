-- FRMS D3-B/D4: dedicated storage for read/ack events.
-- This migration creates the new tables only. It does not migrate or delete
-- legacy rows from frms_fadiga_evento and does not create triggers/backfill.

CREATE TABLE IF NOT EXISTS frms_read_ack_events (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  data_operacional TEXT NOT NULL,
  funcionario_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'OPERATIONAL_SNAPSHOT',
  lifecycle_status TEXT NOT NULL DEFAULT 'PENDING',
  snapshot_status TEXT,
  snapshot_alertas_json TEXT,
  data_sources_json TEXT,
  limitations_json TEXT,
  snapshot_payload_json TEXT,
  event_hash TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER,
  acknowledged_at TEXT,
  acknowledged_by INTEGER,
  ack_note TEXT,
  archived_at TEXT,
  archived_by INTEGER,
  archive_reason TEXT,
  schema_version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_frms_read_ack_events_empresa_data
  ON frms_read_ack_events (empresa_id, data_operacional);

CREATE INDEX IF NOT EXISTS idx_frms_read_ack_events_empresa_lifecycle
  ON frms_read_ack_events (empresa_id, lifecycle_status);

CREATE INDEX IF NOT EXISTS idx_frms_read_ack_events_empresa_funcionario_data
  ON frms_read_ack_events (empresa_id, funcionario_id, data_operacional);

CREATE INDEX IF NOT EXISTS idx_frms_read_ack_events_empresa_type_severity
  ON frms_read_ack_events (empresa_id, event_type, severity);

CREATE UNIQUE INDEX IF NOT EXISTS idx_frms_read_ack_events_dedup
  ON frms_read_ack_events (empresa_id, data_operacional, funcionario_id, event_type);

CREATE INDEX IF NOT EXISTS idx_frms_read_ack_events_empresa_hash
  ON frms_read_ack_events (empresa_id, event_hash);

CREATE TABLE IF NOT EXISTS frms_read_ack_event_audit (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  event_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_user_id INTEGER,
  action_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  note TEXT,
  payload_before_json TEXT,
  payload_after_json TEXT,
  schema_version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_frms_read_ack_event_audit_event
  ON frms_read_ack_event_audit (empresa_id, event_id, action_at);

CREATE INDEX IF NOT EXISTS idx_frms_read_ack_event_audit_action
  ON frms_read_ack_event_audit (empresa_id, action, action_at);
