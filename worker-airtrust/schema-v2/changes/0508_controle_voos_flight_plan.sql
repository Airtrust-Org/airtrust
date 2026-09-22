-- source_reference: DECEA ICA 100-11 (Plano de Voo), MCA 100-11 (Preenchimento dos Formularios de Plano de Voo) and AIC N 87/2024 / AIC N 29/24 (Centralizador de Plano de Voo no Brasil), reviewed 2026-09-21.
-- operational_decision: add a tenant-scoped, versioned AirTrust flight-plan aggregate and append-only integration event ledger; keep DECEA provider credentials outside D1 and do not assume FPL-BR UI automation or an undocumented third-party API.
-- dry_run_required: validate additive tables, closed status/provider/message domains, one active plan per flight, tenant triggers, append-only event ledger and zero mutation of existing flight rows.
-- rollback_plan_required: additive schema; on failed governed apply use captured D1 Time Travel recovery point; on application rollback leave unused tables in place until a separately reviewed compensating change.

CREATE TABLE IF NOT EXISTS cv_planos_voo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  voo_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'rascunho',
  versao INTEGER NOT NULL DEFAULT 1,
  payload_schema_version INTEGER NOT NULL DEFAULT 1,
  payload_json TEXT NOT NULL DEFAULT '{}',
  fonte TEXT NOT NULL DEFAULT 'AIRTRUST',
  provider TEXT NOT NULL DEFAULT 'MANUAL',
  identificacao_aeronave TEXT,
  origem_icao TEXT,
  destino_icao TEXT,
  data_operacional TEXT,
  eobt_utc TEXT,
  protocolo_decea TEXT,
  external_id TEXT,
  ultima_mensagem_tipo TEXT,
  ultimo_status_provider TEXT,
  submetido_em TEXT,
  respondido_em TEXT,
  created_by INTEGER,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (voo_id) REFERENCES cv_voos(id),
  CHECK (status IN ('rascunho','pronto','submetido','aceito','rejeitado','cancelado')),
  CHECK (versao >= 1),
  CHECK (payload_schema_version >= 1),
  CHECK (fonte IN ('AIRTRUST','IMPORTADO_DECEA')),
  CHECK (provider IN ('MANUAL','SIGMA_WEBSERVICE')),
  CHECK (ultima_mensagem_tipo IS NULL OR ultima_mensagem_tipo IN ('FPL','CHG','DLA','CNL'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cv_planos_voo_empresa_voo_active
  ON cv_planos_voo (empresa_id, voo_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_planos_voo_empresa_status_data
  ON cv_planos_voo (empresa_id, status, data_operacional)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_planos_voo_empresa_provider_status
  ON cv_planos_voo (empresa_id, provider, status)
  WHERE deleted_at IS NULL;

CREATE TRIGGER IF NOT EXISTS trg_cv_planos_voo_tenant_insert_0508
BEFORE INSERT ON cv_planos_voo
BEGIN
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1
      FROM cv_voos v
     WHERE v.id = NEW.voo_id
       AND v.empresa_id = NEW.empresa_id
       AND v.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'flight plan flight tenant mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_cv_planos_voo_link_immutable_0508
BEFORE UPDATE OF empresa_id, voo_id ON cv_planos_voo
BEGIN
  SELECT RAISE(ABORT, 'flight plan tenant/flight link is immutable');
END;

CREATE TABLE IF NOT EXISTS cv_plano_voo_eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  plano_voo_id INTEGER NOT NULL,
  evento_tipo TEXT NOT NULL,
  mensagem_tipo TEXT,
  direcao TEXT,
  provider TEXT NOT NULL DEFAULT 'MANUAL',
  status_provider TEXT,
  external_id TEXT,
  request_id TEXT,
  payload_json TEXT,
  resposta_codigo TEXT,
  resposta_mensagem TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (plano_voo_id) REFERENCES cv_planos_voo(id),
  CHECK (evento_tipo IN ('MENSAGEM_ATS','STATUS_PROVIDER','RESPOSTA_PROVIDER')),
  CHECK (mensagem_tipo IS NULL OR mensagem_tipo IN ('FPL','CHG','DLA','CNL')),
  CHECK (direcao IS NULL OR direcao IN ('OUTBOUND','INBOUND')),
  CHECK (provider IN ('MANUAL','SIGMA_WEBSERVICE'))
);

CREATE INDEX IF NOT EXISTS idx_cv_plano_voo_eventos_empresa_plano_created
  ON cv_plano_voo_eventos (empresa_id, plano_voo_id, created_at, id);

CREATE INDEX IF NOT EXISTS idx_cv_plano_voo_eventos_empresa_external
  ON cv_plano_voo_eventos (empresa_id, external_id)
  WHERE external_id IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS trg_cv_plano_voo_eventos_tenant_insert_0508
BEFORE INSERT ON cv_plano_voo_eventos
BEGIN
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1
      FROM cv_planos_voo p
     WHERE p.id = NEW.plano_voo_id
       AND p.empresa_id = NEW.empresa_id
       AND p.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'flight plan event tenant mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_cv_plano_voo_eventos_no_update_0508
BEFORE UPDATE ON cv_plano_voo_eventos
BEGIN
  SELECT RAISE(ABORT, 'flight plan events are append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_cv_plano_voo_eventos_no_delete_0508
BEFORE DELETE ON cv_plano_voo_eventos
BEGIN
  SELECT RAISE(ABORT, 'flight plan events are append-only');
END;
