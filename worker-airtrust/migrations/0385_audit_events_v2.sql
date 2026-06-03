-- Audit Trail v2: additive canonical schema for future dual-write rollout.
-- This migration does not alter legacy audit tables, create triggers, or backfill data.

CREATE TABLE IF NOT EXISTS audit_events_v2 (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  empresa_id INTEGER,
  target_empresa_id INTEGER,

  actor_user_id INTEGER,
  actor_empresa_id INTEGER,
  actor_role TEXT,
  actor_type TEXT NOT NULL DEFAULT 'user',

  support_mode INTEGER NOT NULL DEFAULT 0,
  support_reason TEXT,

  request_id TEXT,
  correlation_id TEXT,

  ip_hash TEXT,
  user_agent_hash TEXT,

  event_category TEXT NOT NULL,
  event_action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,

  risk_level TEXT NOT NULL DEFAULT 'low',
  success INTEGER NOT NULL DEFAULT 1,
  failure_reason_code TEXT,

  metadata_sanitized_json TEXT,
  retention_class TEXT NOT NULL DEFAULT 'standard'
);

CREATE INDEX IF NOT EXISTS idx_audit_events_v2_empresa_created
  ON audit_events_v2 (empresa_id, created_at);

CREATE INDEX IF NOT EXISTS idx_audit_events_v2_target_empresa_created
  ON audit_events_v2 (target_empresa_id, created_at);

CREATE INDEX IF NOT EXISTS idx_audit_events_v2_actor_created
  ON audit_events_v2 (actor_user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_audit_events_v2_request
  ON audit_events_v2 (request_id);

CREATE INDEX IF NOT EXISTS idx_audit_events_v2_category_created
  ON audit_events_v2 (event_category, created_at);
