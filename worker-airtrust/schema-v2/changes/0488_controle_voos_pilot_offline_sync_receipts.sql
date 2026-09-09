-- 0488_controle_voos_pilot_offline_sync_receipts.sql
-- Durable idempotency receipts for Pilot App offline synchronization.
-- Additive only. No operational payload body is persisted here; only a
-- SHA-256 payload hash plus the canonical result metadata required to replay
-- duplicate client_operation_id requests safely.
--
-- Tenant isolation is explicit through empresa_id and the unique key
-- (empresa_id, client_operation_id). Runtime authorization remains enforced
-- in the Controle de Voos worker before any receipt lookup/write.

CREATE TABLE IF NOT EXISTS cv_offline_sync_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  client_operation_id TEXT NOT NULL,
  voo_id INTEGER NOT NULL,
  usuario_id INTEGER NOT NULL,
  funcionario_id INTEGER,
  device_id TEXT NOT NULL,
  command_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  canonical_entity_id TEXT,
  payload_hash TEXT NOT NULL,
  base_server_version INTEGER,
  server_entity_version INTEGER,
  result_status TEXT NOT NULL
    CHECK (result_status IN ('accepted', 'conflict', 'rejected_retriable', 'rejected_permanent')),
  result_code TEXT,
  result_json TEXT,
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cv_offline_sync_receipts_empresa_operation
  ON cv_offline_sync_receipts (empresa_id, client_operation_id);

CREATE INDEX IF NOT EXISTS idx_cv_offline_sync_receipts_voo_received
  ON cv_offline_sync_receipts (empresa_id, voo_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_cv_offline_sync_receipts_actor_device
  ON cv_offline_sync_receipts (empresa_id, usuario_id, device_id, received_at DESC);
