-- 0529_hfa_integration_bridge.sql
-- Tenant-scoped, explicit bridge between AirTrust SGSO and HFA.
-- No RELPREV is exported automatically and no HFA analysis is triggered here.

CREATE TABLE IF NOT EXISTS integracoes_hfa_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL UNIQUE REFERENCES empresas(id),
  base_url TEXT NOT NULL,
  token_encrypted TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  last_tested_at TEXT,
  last_sync_at TEXT,
  created_by INTEGER,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS integracoes_hfa_eventos (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  relato_id TEXT NOT NULL REFERENCES sgso_relatos(id),
  hfa_event_id TEXT,
  sync_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (sync_status IN ('PENDING','SYNCED','ERROR')),
  hfa_analysis_status TEXT,
  hfa_review_status TEXT,
  last_error TEXT,
  last_sync_at TEXT,
  last_checked_at TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (empresa_id, relato_id)
);

CREATE INDEX IF NOT EXISTS idx_integracoes_hfa_eventos_empresa_status
  ON integracoes_hfa_eventos (empresa_id, sync_status, updated_at);
CREATE INDEX IF NOT EXISTS idx_integracoes_hfa_eventos_relato
  ON integracoes_hfa_eventos (empresa_id, relato_id);
CREATE INDEX IF NOT EXISTS idx_integracoes_hfa_eventos_hfa_event
  ON integracoes_hfa_eventos (hfa_event_id) WHERE hfa_event_id IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS trg_integracoes_hfa_eventos_tenant_insert
BEFORE INSERT ON integracoes_hfa_eventos
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM sgso_relatos r
    WHERE r.id = NEW.relato_id
      AND r.empresa_id = NEW.empresa_id
      AND r.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'integracoes_hfa_eventos: relato fora do tenant') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_integracoes_hfa_eventos_tenant_update
BEFORE UPDATE OF empresa_id, relato_id ON integracoes_hfa_eventos
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM sgso_relatos r
    WHERE r.id = NEW.relato_id
      AND r.empresa_id = NEW.empresa_id
      AND r.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'integracoes_hfa_eventos: relato fora do tenant') END;
END;
