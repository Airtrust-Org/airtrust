-- Controle de Voos N1 B2 schema for local SIGVOOS integration preparation.

CREATE TABLE IF NOT EXISTS cv_voo_etapas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  voo_id INTEGER NOT NULL,
  numero_etapa INTEGER NOT NULL,
  sigvoos_leg_number INTEGER,
  origem_icao TEXT,
  destino_icao TEXT,
  horario_motor_ligado TEXT,
  horario_decolagem TEXT,
  horario_pouso TEXT,
  horario_motor_desligado TEXT,
  tempo_decolagem_pouso TEXT,
  tempo_total TEXT,
  tempo_navegacao TEXT,
  tempo_ifr TEXT,
  tempo_noturno TEXT,
  pousos_diurnos INTEGER,
  pousos_noturnos INTEGER,
  starts INTEGER,
  pax INTEGER,
  payload REAL,
  combustivel_inicio REAL,
  combustivel_fim REAL,
  unidade_combustivel TEXT,
  origem_dados TEXT NOT NULL DEFAULT 'MANUAL',
  sigvoos_importado_em TEXT,
  sigvoos_content_hash TEXT,
  metadata_sigvoos_json TEXT,
  created_by INTEGER,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (voo_id) REFERENCES cv_voos(id),
  CHECK (numero_etapa >= 1),
  CHECK (origem_dados IN ('MANUAL', 'SIGVOOS')),
  CHECK (pousos_diurnos IS NULL OR pousos_diurnos >= 0),
  CHECK (pousos_noturnos IS NULL OR pousos_noturnos >= 0),
  CHECK (starts IS NULL OR starts >= 0),
  CHECK (pax IS NULL OR pax >= 0),
  CHECK (payload IS NULL OR payload >= 0),
  CHECK (combustivel_inicio IS NULL OR combustivel_inicio >= 0),
  CHECK (combustivel_fim IS NULL OR combustivel_fim >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cv_voo_etapas_empresa_voo_leg
  ON cv_voo_etapas (empresa_id, voo_id, sigvoos_leg_number)
  WHERE sigvoos_leg_number IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_voo_etapas_empresa_voo_numero
  ON cv_voo_etapas (empresa_id, voo_id, numero_etapa)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_voo_etapas_empresa_importado
  ON cv_voo_etapas (empresa_id, sigvoos_importado_em)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_voo_etapas_empresa_deleted
  ON cv_voo_etapas (empresa_id, deleted_at);

ALTER TABLE cv_voos ADD COLUMN sigvoos_flight_report_id INTEGER;
ALTER TABLE cv_voos ADD COLUMN sigvoos_flight_report_id_confident INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cv_voos ADD COLUMN sigvoos_report_number TEXT;
ALTER TABLE cv_voos ADD COLUMN sigvoos_flight_number TEXT;
ALTER TABLE cv_voos ADD COLUMN sigvoos_client_name TEXT;
ALTER TABLE cv_voos ADD COLUMN sigvoos_contract_name TEXT;
ALTER TABLE cv_voos ADD COLUMN sigvoos_importado_em TEXT;
ALTER TABLE cv_voos ADD COLUMN sigvoos_content_hash TEXT;
ALTER TABLE cv_voos ADD COLUMN origem_importacao TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE cv_voos ADD COLUMN campos_editados_json TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cv_voos_empresa_sigvoos_fr_id
  ON cv_voos (empresa_id, sigvoos_flight_report_id)
  WHERE sigvoos_flight_report_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cv_voos_empresa_origem_importacao
  ON cv_voos (empresa_id, origem_importacao, data_programacao)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_voos_empresa_sigvoos_importado
  ON cv_voos (empresa_id, sigvoos_importado_em)
  WHERE deleted_at IS NULL;

ALTER TABLE cv_voo_tripulantes ADD COLUMN etapa_id INTEGER REFERENCES cv_voo_etapas(id);
ALTER TABLE cv_voo_tripulantes ADD COLUMN sigvoos_staff_id INTEGER;
ALTER TABLE cv_voo_tripulantes ADD COLUMN sigvoos_staff_inscription TEXT;
ALTER TABLE cv_voo_tripulantes ADD COLUMN funcao_origem TEXT;
ALTER TABLE cv_voo_tripulantes ADD COLUMN resolucao_funcionario_fonte TEXT;
ALTER TABLE cv_voo_tripulantes ADD COLUMN sigvoos_content_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cv_voo_tripulantes_empresa_etapa_staff
  ON cv_voo_tripulantes (empresa_id, etapa_id, sigvoos_staff_id)
  WHERE etapa_id IS NOT NULL AND sigvoos_staff_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_voo_tripulantes_empresa_etapa
  ON cv_voo_tripulantes (empresa_id, etapa_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_voo_tripulantes_empresa_sigvoos_staff
  ON cv_voo_tripulantes (empresa_id, sigvoos_staff_id)
  WHERE sigvoos_staff_id IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS cv_sigvoos_staging (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  sigvoos_flight_report_id INTEGER,
  sigvoos_leg_number INTEGER,
  sigvoos_staff_id INTEGER,
  data_operacional TEXT NOT NULL,
  source_window_start TEXT NOT NULL,
  source_window_end TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  payload_sanitizado_json TEXT,
  import_status TEXT NOT NULL DEFAULT 'PENDING',
  cv_voo_id INTEGER REFERENCES cv_voos(id),
  cv_etapa_id INTEGER REFERENCES cv_voo_etapas(id),
  cv_tripulante_id INTEGER REFERENCES cv_voo_tripulantes(id),
  tentativas INTEGER NOT NULL DEFAULT 0,
  erro_msg TEXT,
  processado_em TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  CHECK (import_status IN ('PENDING', 'PROCESSED', 'ERROR', 'IGNORED', 'CONFLICT')),
  CHECK (tentativas >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cv_sigvoos_staging_empresa_hash
  ON cv_sigvoos_staging (empresa_id, payload_hash)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_sigvoos_staging_empresa_status_data
  ON cv_sigvoos_staging (empresa_id, import_status, data_operacional)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_sigvoos_staging_empresa_fr_id
  ON cv_sigvoos_staging (empresa_id, sigvoos_flight_report_id)
  WHERE sigvoos_flight_report_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_sigvoos_staging_empresa_window
  ON cv_sigvoos_staging (empresa_id, source_window_start, source_window_end)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_sigvoos_staging_empresa_deleted
  ON cv_sigvoos_staging (empresa_id, deleted_at);

CREATE TABLE IF NOT EXISTS cv_conflitos_integracao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  entidade_tipo TEXT NOT NULL,
  entidade_id INTEGER NOT NULL,
  campo TEXT NOT NULL,
  valor_airtrust TEXT,
  valor_sigvoos TEXT,
  staging_id TEXT REFERENCES cv_sigvoos_staging(id),
  severidade TEXT NOT NULL DEFAULT 'MEDIA',
  status TEXT NOT NULL DEFAULT 'ABERTO',
  resolvido_por INTEGER,
  resolvido_em TEXT,
  decisao TEXT,
  justificativa TEXT,
  created_by INTEGER,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  CHECK (entidade_tipo IN ('voo', 'etapa', 'tripulante')),
  CHECK (severidade IN ('BAIXA', 'MEDIA', 'ALTA', 'CRITICA')),
  CHECK (status IN ('ABERTO', 'RESOLVIDO', 'IGNORADO')),
  CHECK (decisao IS NULL OR decisao IN ('MANTER_AIRTRUST', 'ACEITAR_SIGVOOS', 'IGNORAR'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cv_conflitos_empresa_entidade_campo_aberto
  ON cv_conflitos_integracao (empresa_id, entidade_tipo, entidade_id, campo)
  WHERE status = 'ABERTO' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_conflitos_empresa_status_severidade
  ON cv_conflitos_integracao (empresa_id, status, severidade, created_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_conflitos_empresa_entidade
  ON cv_conflitos_integracao (empresa_id, entidade_tipo, entidade_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_conflitos_empresa_deleted
  ON cv_conflitos_integracao (empresa_id, deleted_at);

CREATE INDEX IF NOT EXISTS idx_cv_conflitos_empresa_staging
  ON cv_conflitos_integracao (empresa_id, staging_id)
  WHERE staging_id IS NOT NULL AND deleted_at IS NULL;

CREATE TRIGGER IF NOT EXISTS trg_cv_voo_etapas_empresa_insert
BEFORE INSERT ON cv_voo_etapas
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM cv_voos v
  WHERE v.id = NEW.voo_id
    AND v.empresa_id = NEW.empresa_id
)
BEGIN
  SELECT RAISE(ABORT, 'cv_voo_etapas empresa_id mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_cv_voo_etapas_empresa_update
BEFORE UPDATE OF empresa_id, voo_id ON cv_voo_etapas
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM cv_voos v
  WHERE v.id = NEW.voo_id
    AND v.empresa_id = NEW.empresa_id
)
BEGIN
  SELECT RAISE(ABORT, 'cv_voo_etapas empresa_id mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_cv_voo_tripulantes_etapa_insert
BEFORE INSERT ON cv_voo_tripulantes
FOR EACH ROW
WHEN NEW.etapa_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1
   FROM cv_voo_etapas e
   WHERE e.id = NEW.etapa_id
     AND e.voo_id = NEW.voo_id
     AND e.empresa_id = NEW.empresa_id
 )
BEGIN
  SELECT RAISE(ABORT, 'cv_voo_tripulantes etapa_id mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_cv_voo_tripulantes_etapa_update
BEFORE UPDATE OF empresa_id, voo_id, etapa_id ON cv_voo_tripulantes
FOR EACH ROW
WHEN NEW.etapa_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1
   FROM cv_voo_etapas e
   WHERE e.id = NEW.etapa_id
     AND e.voo_id = NEW.voo_id
     AND e.empresa_id = NEW.empresa_id
 )
BEGIN
  SELECT RAISE(ABORT, 'cv_voo_tripulantes etapa_id mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_cv_sigvoos_staging_voo_insert
BEFORE INSERT ON cv_sigvoos_staging
FOR EACH ROW
WHEN NEW.cv_voo_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1
   FROM cv_voos v
   WHERE v.id = NEW.cv_voo_id
     AND v.empresa_id = NEW.empresa_id
 )
BEGIN
  SELECT RAISE(ABORT, 'cv_sigvoos_staging cv_voo_id mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_cv_sigvoos_staging_voo_update
BEFORE UPDATE OF empresa_id, cv_voo_id ON cv_sigvoos_staging
FOR EACH ROW
WHEN NEW.cv_voo_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1
   FROM cv_voos v
   WHERE v.id = NEW.cv_voo_id
     AND v.empresa_id = NEW.empresa_id
 )
BEGIN
  SELECT RAISE(ABORT, 'cv_sigvoos_staging cv_voo_id mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_cv_sigvoos_staging_etapa_insert
BEFORE INSERT ON cv_sigvoos_staging
FOR EACH ROW
WHEN NEW.cv_etapa_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1
   FROM cv_voo_etapas e
   WHERE e.id = NEW.cv_etapa_id
     AND e.empresa_id = NEW.empresa_id
 )
BEGIN
  SELECT RAISE(ABORT, 'cv_sigvoos_staging cv_etapa_id mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_cv_sigvoos_staging_etapa_update
BEFORE UPDATE OF empresa_id, cv_etapa_id ON cv_sigvoos_staging
FOR EACH ROW
WHEN NEW.cv_etapa_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1
   FROM cv_voo_etapas e
   WHERE e.id = NEW.cv_etapa_id
     AND e.empresa_id = NEW.empresa_id
 )
BEGIN
  SELECT RAISE(ABORT, 'cv_sigvoos_staging cv_etapa_id mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_cv_sigvoos_staging_tripulante_insert
BEFORE INSERT ON cv_sigvoos_staging
FOR EACH ROW
WHEN NEW.cv_tripulante_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1
   FROM cv_voo_tripulantes t
   WHERE t.id = NEW.cv_tripulante_id
     AND t.empresa_id = NEW.empresa_id
 )
BEGIN
  SELECT RAISE(ABORT, 'cv_sigvoos_staging cv_tripulante_id mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_cv_sigvoos_staging_tripulante_update
BEFORE UPDATE OF empresa_id, cv_tripulante_id ON cv_sigvoos_staging
FOR EACH ROW
WHEN NEW.cv_tripulante_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1
   FROM cv_voo_tripulantes t
   WHERE t.id = NEW.cv_tripulante_id
     AND t.empresa_id = NEW.empresa_id
 )
BEGIN
  SELECT RAISE(ABORT, 'cv_sigvoos_staging cv_tripulante_id mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_cv_conflitos_integracao_staging_insert
BEFORE INSERT ON cv_conflitos_integracao
FOR EACH ROW
WHEN NEW.staging_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1
   FROM cv_sigvoos_staging s
   WHERE s.id = NEW.staging_id
     AND s.empresa_id = NEW.empresa_id
 )
BEGIN
  SELECT RAISE(ABORT, 'cv_conflitos_integracao staging_id mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_cv_conflitos_integracao_staging_update
BEFORE UPDATE OF empresa_id, staging_id ON cv_conflitos_integracao
FOR EACH ROW
WHEN NEW.staging_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1
   FROM cv_sigvoos_staging s
   WHERE s.id = NEW.staging_id
     AND s.empresa_id = NEW.empresa_id
 )
BEGIN
  SELECT RAISE(ABORT, 'cv_conflitos_integracao staging_id mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_cv_conflitos_integracao_voo_insert
BEFORE INSERT ON cv_conflitos_integracao
FOR EACH ROW
WHEN NEW.entidade_tipo = 'voo'
 AND NOT EXISTS (
   SELECT 1
   FROM cv_voos v
   WHERE v.id = NEW.entidade_id
     AND v.empresa_id = NEW.empresa_id
 )
BEGIN
  SELECT RAISE(ABORT, 'cv_conflitos_integracao entidade_id mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_cv_conflitos_integracao_voo_update
BEFORE UPDATE OF empresa_id, entidade_tipo, entidade_id ON cv_conflitos_integracao
FOR EACH ROW
WHEN NEW.entidade_tipo = 'voo'
 AND NOT EXISTS (
   SELECT 1
   FROM cv_voos v
   WHERE v.id = NEW.entidade_id
     AND v.empresa_id = NEW.empresa_id
 )
BEGIN
  SELECT RAISE(ABORT, 'cv_conflitos_integracao entidade_id mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_cv_conflitos_integracao_etapa_insert
BEFORE INSERT ON cv_conflitos_integracao
FOR EACH ROW
WHEN NEW.entidade_tipo = 'etapa'
 AND NOT EXISTS (
   SELECT 1
   FROM cv_voo_etapas e
   WHERE e.id = NEW.entidade_id
     AND e.empresa_id = NEW.empresa_id
 )
BEGIN
  SELECT RAISE(ABORT, 'cv_conflitos_integracao entidade_id mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_cv_conflitos_integracao_etapa_update
BEFORE UPDATE OF empresa_id, entidade_tipo, entidade_id ON cv_conflitos_integracao
FOR EACH ROW
WHEN NEW.entidade_tipo = 'etapa'
 AND NOT EXISTS (
   SELECT 1
   FROM cv_voo_etapas e
   WHERE e.id = NEW.entidade_id
     AND e.empresa_id = NEW.empresa_id
 )
BEGIN
  SELECT RAISE(ABORT, 'cv_conflitos_integracao entidade_id mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_cv_conflitos_integracao_tripulante_insert
BEFORE INSERT ON cv_conflitos_integracao
FOR EACH ROW
WHEN NEW.entidade_tipo = 'tripulante'
 AND NOT EXISTS (
   SELECT 1
   FROM cv_voo_tripulantes t
   WHERE t.id = NEW.entidade_id
     AND t.empresa_id = NEW.empresa_id
 )
BEGIN
  SELECT RAISE(ABORT, 'cv_conflitos_integracao entidade_id mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_cv_conflitos_integracao_tripulante_update
BEFORE UPDATE OF empresa_id, entidade_tipo, entidade_id ON cv_conflitos_integracao
FOR EACH ROW
WHEN NEW.entidade_tipo = 'tripulante'
 AND NOT EXISTS (
   SELECT 1
   FROM cv_voo_tripulantes t
   WHERE t.id = NEW.entidade_id
     AND t.empresa_id = NEW.empresa_id
 )
BEGIN
  SELECT RAISE(ABORT, 'cv_conflitos_integracao entidade_id mismatch');
END;
