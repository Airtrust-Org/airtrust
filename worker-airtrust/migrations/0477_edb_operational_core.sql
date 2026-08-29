-- 0477 — Flight Operations / eDB canonical operational semantics + persistence core
--
-- Additive, disabled foundation. Canonical regulatory semantics live directly
-- on the existing Controle de Voos stage/crew rows; no parallel stage/crew
-- companion table is created. Ambiguous legacy columns remain physically
-- present for compatibility but are not regulatory aliases.
--
-- The eDB_* objects below store immutable preflight technical awareness,
-- immutable signed postflight snapshots, lifecycle evidence, audit history
-- and future ANAC transmission state behind an application flag.

ALTER TABLE cv_voo_etapas ADD COLUMN tempo_voo_diurno_minutos INTEGER;
ALTER TABLE cv_voo_etapas ADD COLUMN tempo_voo_noturno_minutos INTEGER;
ALTER TABLE cv_voo_etapas ADD COLUMN tempo_voo_total_minutos INTEGER;
ALTER TABLE cv_voo_etapas ADD COLUMN tempo_ifr_real_minutos INTEGER;
ALTER TABLE cv_voo_etapas ADD COLUMN tempo_ifr_simulado_minutos INTEGER;
ALTER TABLE cv_voo_etapas ADD COLUMN tempo_ifr_nao_classificado_minutos INTEGER;
ALTER TABLE cv_voo_etapas ADD COLUMN pousos_total INTEGER;
ALTER TABLE cv_voo_etapas ADD COLUMN ciclos INTEGER;
ALTER TABLE cv_voo_etapas ADD COLUMN combustivel_antes_partida_motor REAL;
ALTER TABLE cv_voo_etapas ADD COLUMN pessoas_a_bordo_total INTEGER;
ALTER TABLE cv_voo_etapas ADD COLUMN carga_regulatoria_kg REAL;
ALTER TABLE cv_voo_etapas ADD COLUMN ocorrencias_json TEXT;
ALTER TABLE cv_voo_etapas ADD COLUMN semantica_regulatoria_origem TEXT;
ALTER TABLE cv_voo_etapas ADD COLUMN semantica_regulatoria_versao INTEGER NOT NULL DEFAULT 1;
ALTER TABLE cv_voo_etapas ADD COLUMN semantica_regulatoria_preenchido_por INTEGER;
ALTER TABLE cv_voo_etapas ADD COLUMN semantica_regulatoria_preenchido_em TEXT;

ALTER TABLE cv_voo_tripulantes ADD COLUMN codigo_funcao_anac TEXT;
ALTER TABLE cv_voo_tripulantes ADD COLUMN funcao_anac_origem TEXT;
ALTER TABLE cv_voo_tripulantes ADD COLUMN funcao_anac_validado_por INTEGER;
ALTER TABLE cv_voo_tripulantes ADD COLUMN funcao_anac_validado_em TEXT;

CREATE TABLE IF NOT EXISTS edb_diarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  aeronave_id INTEGER NOT NULL,
  contract_version TEXT NOT NULL DEFAULT 'edb.regulatory.v1',
  regulamento_operador TEXT NOT NULL
    CHECK (regulamento_operador IN ('RBAC121', 'RBAC135', 'OTHER')),
  status TEXT NOT NULL DEFAULT 'ATIVO'
    CHECK (status IN ('ATIVO', 'ENCERRADO')),
  created_by INTEGER,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_edb_diarios_ativo_aeronave
  ON edb_diarios (empresa_id, aeronave_id)
  WHERE status = 'ATIVO';

CREATE TABLE IF NOT EXISTS edb_volumes (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  diario_id INTEGER NOT NULL,
  numero_volume INTEGER NOT NULL CHECK (numero_volume >= 1),
  status TEXT NOT NULL DEFAULT 'ABERTO'
    CHECK (status IN ('ABERTO', 'ENCERRADO')),
  aberto_em TEXT NOT NULL,
  aberto_por INTEGER NOT NULL,
  ato_abertura_json TEXT NOT NULL,
  encerrado_em TEXT,
  encerrado_por INTEGER,
  ato_encerramento_json TEXT,
  retencao_minima_ate TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_edb_volume_numero
  ON edb_volumes (empresa_id, diario_id, numero_volume);

CREATE UNIQUE INDEX IF NOT EXISTS idx_edb_volume_aberto
  ON edb_volumes (empresa_id, diario_id)
  WHERE status = 'ABERTO';

-- Preflight technical situation. Each row is immutable. If the aircraft or
-- maintenance situation changes, a new snapshot is created and the old PIC
-- acknowledgement cannot authorize the changed situation.
CREATE TABLE IF NOT EXISTS edb_situacoes_tecnicas (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  voo_id INTEGER NOT NULL,
  aeronave_id INTEGER,
  aircraft_json TEXT NOT NULL,
  maintenance_json TEXT NOT NULL,
  technical_content_sha256 TEXT NOT NULL,
  canonical_snapshot_sha256 TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_edb_situacao_tecnica_voo
  ON edb_situacoes_tecnicas (empresa_id, voo_id, captured_at);

CREATE TABLE IF NOT EXISTS edb_ciencias_tecnicas_pic (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  situacao_tecnica_id TEXT NOT NULL,
  voo_id INTEGER NOT NULL,
  signer_funcionario_id INTEGER,
  signer_user_id INTEGER,
  signer_nome TEXT NOT NULL,
  signer_codigo_anac TEXT,
  signed_at TEXT NOT NULL,
  canonical_snapshot_sha256 TEXT NOT NULL,
  metodo TEXT NOT NULL
    CHECK (metodo IN ('ASYMMETRIC_DIGITAL_SIGNATURE', 'ELECTRONIC_SIGNATURE_WITH_CERTIFICATE')),
  proof_reference TEXT NOT NULL,
  auth_evidence_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_edb_ciencia_situacao
  ON edb_ciencias_tecnicas_pic (empresa_id, situacao_tecnica_id);

CREATE INDEX IF NOT EXISTS idx_edb_ciencia_voo
  ON edb_ciencias_tecnicas_pic (empresa_id, voo_id, signed_at);

CREATE TABLE IF NOT EXISTS edb_registro_revisoes (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  diario_id INTEGER NOT NULL,
  volume_id TEXT NOT NULL,
  logical_record_id TEXT NOT NULL,
  revisao INTEGER NOT NULL CHECK (revisao >= 1),
  supersedes_revision_id TEXT,
  motivo_correcao TEXT,
  contract_version TEXT NOT NULL DEFAULT 'edb.regulatory.v1',
  voo_id INTEGER NOT NULL,
  rdv_id INTEGER,
  rdv_versao INTEGER,
  etapa_id INTEGER NOT NULL,
  ciencia_tecnica_pic_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  canonical_payload_sha256 TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_edb_revisao_logical
  ON edb_registro_revisoes (empresa_id, logical_record_id, revisao);

CREATE UNIQUE INDEX IF NOT EXISTS idx_edb_revisao_source
  ON edb_registro_revisoes (empresa_id, voo_id, etapa_id, revisao);

CREATE INDEX IF NOT EXISTS idx_edb_revisao_volume
  ON edb_registro_revisoes (empresa_id, volume_id, created_at);

CREATE INDEX IF NOT EXISTS idx_edb_revisao_ciencia_tecnica
  ON edb_registro_revisoes (empresa_id, ciencia_tecnica_pic_id);

CREATE TABLE IF NOT EXISTS edb_registro_estado (
  revision_id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN (
      'DRAFT',
      'READY_FOR_PIC_SIGNATURE',
      'PIC_SIGNED',
      'OPERATOR_SIGNED',
      'ANAC_PENDING',
      'ANAC_SYNCED',
      'SUPERSEDED',
      'CANCELLED'
    )),
  versao INTEGER NOT NULL DEFAULT 1 CHECK (versao >= 1),
  updated_by INTEGER,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_edb_estado_status
  ON edb_registro_estado (empresa_id, status, updated_at);

-- Final-record signatures only. PIC technical awareness is preflight evidence
-- and lives in edb_ciencias_tecnicas_pic instead of this postflight table.
CREATE TABLE IF NOT EXISTS edb_assinaturas (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  revision_id TEXT NOT NULL,
  tipo TEXT NOT NULL
    CHECK (tipo IN ('PIC_FLIGHT_RECORD', 'OPERATOR_RECORD')),
  signer_funcionario_id INTEGER,
  signer_user_id INTEGER,
  signer_nome TEXT NOT NULL,
  signer_codigo_anac TEXT,
  signed_at TEXT NOT NULL,
  canonical_payload_sha256 TEXT NOT NULL,
  metodo TEXT NOT NULL
    CHECK (metodo IN ('ASYMMETRIC_DIGITAL_SIGNATURE', 'ELECTRONIC_SIGNATURE_WITH_CERTIFICATE')),
  proof_reference TEXT NOT NULL,
  auth_evidence_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_edb_assinatura_revision_tipo
  ON edb_assinaturas (empresa_id, revision_id, tipo);

CREATE TABLE IF NOT EXISTS edb_discrepancias_tecnicas (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  revision_id TEXT NOT NULL,
  descricao TEXT NOT NULL,
  detectado_por_funcionario_id INTEGER,
  detectado_por_nome TEXT NOT NULL,
  detectado_por_codigo_anac TEXT,
  detectado_em TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_edb_discrepancia_revision
  ON edb_discrepancias_tecnicas (empresa_id, revision_id, created_at);

CREATE TABLE IF NOT EXISTS edb_acoes_manutencao (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  discrepancia_id TEXT NOT NULL,
  tipo TEXT NOT NULL
    CHECK (tipo IN ('CORRECTIVE_ACTION', 'DEFERRED_ACTION_AUTHORIZATION', 'RTS_APPROVAL')),
  referencia_acao_id TEXT,
  descricao TEXT NOT NULL,
  executado_por_funcionario_id INTEGER,
  executado_por_nome TEXT NOT NULL,
  executado_em TEXT NOT NULL,
  evidencia_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_edb_acao_manutencao_discrepancia
  ON edb_acoes_manutencao (empresa_id, discrepancia_id, executado_em);

CREATE TABLE IF NOT EXISTS edb_auditoria_eventos (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  diario_id INTEGER,
  revision_id TEXT,
  event_type TEXT NOT NULL,
  actor_user_id INTEGER,
  actor_funcionario_id INTEGER,
  payload_json TEXT NOT NULL,
  previous_event_hash_sha256 TEXT,
  event_hash_sha256 TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_edb_auditoria_revision
  ON edb_auditoria_eventos (empresa_id, revision_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_edb_auditoria_diario
  ON edb_auditoria_eventos (empresa_id, diario_id, occurred_at);

CREATE TABLE IF NOT EXISTS edb_anac_outbox (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  revision_id TEXT NOT NULL,
  operation_kind TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  payload_json TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'DEAD_LETTER')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at TEXT,
  last_error_code TEXT,
  last_error_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_edb_anac_outbox_idempotency
  ON edb_anac_outbox (empresa_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_edb_anac_outbox_pending
  ON edb_anac_outbox (status, next_attempt_at, created_at);

CREATE TABLE IF NOT EXISTS edb_anac_recibos (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  outbox_id TEXT NOT NULL,
  external_receipt_id TEXT NOT NULL,
  http_status INTEGER,
  received_at TEXT NOT NULL,
  receipt_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_edb_anac_recibo_outbox
  ON edb_anac_recibos (empresa_id, outbox_id);

CREATE TABLE IF NOT EXISTS edb_incidentes_integridade (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  diario_id INTEGER NOT NULL,
  volume_id TEXT,
  tipo TEXT NOT NULL
    CHECK (tipo IN ('LOSS', 'MISPLACEMENT', 'CORRUPTION')),
  ocorrido_em TEXT NOT NULL,
  descricao TEXT NOT NULL,
  police_report_reference TEXT,
  anac_notification_reference TEXT,
  status TEXT NOT NULL
    CHECK (status IN ('OPEN', 'RECONSTITUTED', 'IMPOSSIBLE_TO_RECONSTITUTE', 'CLOSED')),
  reconstitution_evidence_json TEXT,
  created_by INTEGER,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_edb_incidente_diario
  ON edb_incidentes_integridade (empresa_id, diario_id, ocorrido_em);

-- Immutable evidence. Final-record state progression lives separately in
-- edb_registro_estado.
CREATE TRIGGER IF NOT EXISTS trg_edb_situacoes_tecnicas_no_update
BEFORE UPDATE ON edb_situacoes_tecnicas
BEGIN
  SELECT RAISE(ABORT, 'EDB_TECHNICAL_SITUATION_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_situacoes_tecnicas_no_delete
BEFORE DELETE ON edb_situacoes_tecnicas
BEGIN
  SELECT RAISE(ABORT, 'EDB_TECHNICAL_SITUATION_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_ciencias_tecnicas_no_update
BEFORE UPDATE ON edb_ciencias_tecnicas_pic
BEGIN
  SELECT RAISE(ABORT, 'EDB_TECHNICAL_ACK_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_ciencias_tecnicas_no_delete
BEFORE DELETE ON edb_ciencias_tecnicas_pic
BEGIN
  SELECT RAISE(ABORT, 'EDB_TECHNICAL_ACK_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_revisoes_no_update
BEFORE UPDATE ON edb_registro_revisoes
BEGIN
  SELECT RAISE(ABORT, 'EDB_REVISION_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_revisoes_no_delete
BEFORE DELETE ON edb_registro_revisoes
BEGIN
  SELECT RAISE(ABORT, 'EDB_REVISION_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_assinaturas_no_update
BEFORE UPDATE ON edb_assinaturas
BEGIN
  SELECT RAISE(ABORT, 'EDB_SIGNATURE_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_assinaturas_no_delete
BEFORE DELETE ON edb_assinaturas
BEGIN
  SELECT RAISE(ABORT, 'EDB_SIGNATURE_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_discrepancias_no_update
BEFORE UPDATE ON edb_discrepancias_tecnicas
BEGIN
  SELECT RAISE(ABORT, 'EDB_DISCREPANCY_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_discrepancias_no_delete
BEFORE DELETE ON edb_discrepancias_tecnicas
BEGIN
  SELECT RAISE(ABORT, 'EDB_DISCREPANCY_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_acoes_manutencao_no_update
BEFORE UPDATE ON edb_acoes_manutencao
BEGIN
  SELECT RAISE(ABORT, 'EDB_MAINTENANCE_ACTION_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_acoes_manutencao_no_delete
BEFORE DELETE ON edb_acoes_manutencao
BEGIN
  SELECT RAISE(ABORT, 'EDB_MAINTENANCE_ACTION_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_auditoria_no_update
BEFORE UPDATE ON edb_auditoria_eventos
BEGIN
  SELECT RAISE(ABORT, 'EDB_AUDIT_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_auditoria_no_delete
BEFORE DELETE ON edb_auditoria_eventos
BEGIN
  SELECT RAISE(ABORT, 'EDB_AUDIT_IMMUTABLE');
END;
