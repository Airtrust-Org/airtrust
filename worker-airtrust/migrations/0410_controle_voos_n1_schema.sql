-- Controle de Voos N1 B1 schema.

CREATE TABLE IF NOT EXISTS cv_aeroportos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  codigo TEXT NOT NULL,
  codigo_icao TEXT,
  codigo_iata TEXT,
  nome TEXT NOT NULL,
  cidade TEXT,
  uf TEXT,
  tipo TEXT NOT NULL DEFAULT 'aeroporto',
  descricao TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  CHECK (tipo IN ('aeroporto', 'plataforma', 'heliponto')),
  CHECK (ativo IN (0, 1))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cv_aeroportos_empresa_codigo
  ON cv_aeroportos (empresa_id, codigo)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_aeroportos_empresa_tipo_ativo
  ON cv_aeroportos (empresa_id, tipo, ativo)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_aeroportos_empresa_deleted
  ON cv_aeroportos (empresa_id, deleted_at);

CREATE TABLE IF NOT EXISTS cv_tipos_voo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  CHECK (ativo IN (0, 1))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cv_tipos_voo_empresa_codigo
  ON cv_tipos_voo (empresa_id, codigo)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_tipos_voo_empresa_ativo
  ON cv_tipos_voo (empresa_id, ativo)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_tipos_voo_empresa_deleted
  ON cv_tipos_voo (empresa_id, deleted_at);

CREATE TABLE IF NOT EXISTS cv_naturezas_voo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  CHECK (ativo IN (0, 1))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cv_naturezas_voo_empresa_codigo
  ON cv_naturezas_voo (empresa_id, codigo)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_naturezas_voo_empresa_ativo
  ON cv_naturezas_voo (empresa_id, ativo)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_naturezas_voo_empresa_deleted
  ON cv_naturezas_voo (empresa_id, deleted_at);

CREATE TABLE IF NOT EXISTS cv_motivos_operacionais (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'geral',
  descricao TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  CHECK (tipo IN ('atraso', 'cancelamento', 'alternado_divergido', 'indisponibilidade', 'geral')),
  CHECK (ativo IN (0, 1))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cv_motivos_operacionais_empresa_codigo
  ON cv_motivos_operacionais (empresa_id, codigo)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_motivos_operacionais_empresa_tipo_ativo
  ON cv_motivos_operacionais (empresa_id, tipo, ativo)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_motivos_operacionais_empresa_deleted
  ON cv_motivos_operacionais (empresa_id, deleted_at);

CREATE TABLE IF NOT EXISTS cv_voos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  prefixo TEXT NOT NULL,
  data_programacao TEXT NOT NULL,
  origem_id INTEGER NOT NULL,
  destino_id INTEGER NOT NULL,
  tipo_voo_id INTEGER NOT NULL,
  natureza_voo_id INTEGER NOT NULL,
  aeronave_id INTEGER,
  horario_previsto_partida TEXT NOT NULL,
  horario_previsto_chegada TEXT NOT NULL,
  horario_real_partida TEXT,
  horario_real_chegada TEXT,
  status TEXT NOT NULL DEFAULT 'planejado',
  observacoes TEXT,
  cancelado_motivo_id INTEGER,
  alternado_destino_id INTEGER,
  created_by INTEGER,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  CHECK (status IN (
    'planejado',
    'liberado_operacionalmente',
    'em_andamento',
    'pousado',
    'concluido_operacionalmente',
    'cancelado',
    'alternado_divergido'
  )),
  CHECK (horario_previsto_chegada >= horario_previsto_partida),
  CHECK (horario_real_chegada IS NULL OR horario_real_partida IS NULL OR horario_real_chegada >= horario_real_partida),
  FOREIGN KEY (origem_id) REFERENCES cv_aeroportos(id),
  FOREIGN KEY (destino_id) REFERENCES cv_aeroportos(id),
  FOREIGN KEY (alternado_destino_id) REFERENCES cv_aeroportos(id),
  FOREIGN KEY (tipo_voo_id) REFERENCES cv_tipos_voo(id),
  FOREIGN KEY (natureza_voo_id) REFERENCES cv_naturezas_voo(id),
  FOREIGN KEY (cancelado_motivo_id) REFERENCES cv_motivos_operacionais(id)
);

CREATE INDEX IF NOT EXISTS idx_cv_voos_empresa_data_status
  ON cv_voos (empresa_id, data_programacao, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_voos_empresa_aeronave_data
  ON cv_voos (empresa_id, aeronave_id, data_programacao)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_voos_empresa_prefixo_data
  ON cv_voos (empresa_id, prefixo, data_programacao)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_voos_empresa_deleted
  ON cv_voos (empresa_id, deleted_at);

CREATE TABLE IF NOT EXISTS cv_rdv_operacional (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  voo_id INTEGER NOT NULL,
  numero TEXT NOT NULL,
  data_voo TEXT NOT NULL,
  horario_decolagem_real TEXT,
  horario_pouso_real TEXT,
  horas_voadas REAL,
  numero_pousos INTEGER,
  ciclos INTEGER,
  combustivel_decolagem REAL,
  combustivel_pouso REAL,
  combustivel_consumo REAL,
  pob INTEGER,
  carga_kg REAL,
  ocorrencias TEXT,
  divergencias TEXT,
  status TEXT NOT NULL DEFAULT 'rascunho',
  responsavel_preenchimento_id INTEGER,
  preenchido_em TEXT,
  finalizado_operacionalmente_por INTEGER,
  finalizado_operacionalmente_em TEXT,
  created_by INTEGER,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  CHECK (status IN ('rascunho', 'preenchimento_finalizado', 'cancelado')),
  CHECK (horario_pouso_real IS NULL OR horario_decolagem_real IS NULL OR horario_pouso_real >= horario_decolagem_real),
  CHECK (horas_voadas IS NULL OR horas_voadas >= 0),
  CHECK (numero_pousos IS NULL OR numero_pousos >= 0),
  CHECK (ciclos IS NULL OR ciclos >= 0),
  CHECK (combustivel_decolagem IS NULL OR combustivel_decolagem >= 0),
  CHECK (combustivel_pouso IS NULL OR combustivel_pouso >= 0),
  CHECK (combustivel_consumo IS NULL OR combustivel_consumo >= 0),
  CHECK (pob IS NULL OR pob >= 0),
  CHECK (carga_kg IS NULL OR carga_kg >= 0),
  FOREIGN KEY (voo_id) REFERENCES cv_voos(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cv_rdv_operacional_empresa_voo_ativo
  ON cv_rdv_operacional (empresa_id, voo_id)
  WHERE deleted_at IS NULL AND status <> 'cancelado';

CREATE UNIQUE INDEX IF NOT EXISTS idx_cv_rdv_operacional_empresa_numero
  ON cv_rdv_operacional (empresa_id, numero)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_rdv_operacional_empresa_data_status
  ON cv_rdv_operacional (empresa_id, data_voo, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_rdv_operacional_empresa_responsavel_data
  ON cv_rdv_operacional (empresa_id, responsavel_preenchimento_id, data_voo)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_rdv_operacional_empresa_deleted
  ON cv_rdv_operacional (empresa_id, deleted_at);

CREATE TABLE IF NOT EXISTS cv_voo_tripulantes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  voo_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  funcao TEXT NOT NULL,
  horario_apresentacao TEXT,
  horario_dispensa TEXT,
  observacoes TEXT,
  created_by INTEGER,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  CHECK (funcao IN ('PIC', 'SIC', 'COM', 'MEC', 'OUTRO')),
  CHECK (horario_dispensa IS NULL OR horario_apresentacao IS NULL OR horario_dispensa >= horario_apresentacao),
  FOREIGN KEY (voo_id) REFERENCES cv_voos(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cv_voo_tripulantes_empresa_voo_funcionario_funcao
  ON cv_voo_tripulantes (empresa_id, voo_id, funcionario_id, funcao)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_voo_tripulantes_empresa_voo
  ON cv_voo_tripulantes (empresa_id, voo_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_voo_tripulantes_empresa_funcionario_apresentacao
  ON cv_voo_tripulantes (empresa_id, funcionario_id, horario_apresentacao)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_voo_tripulantes_empresa_deleted
  ON cv_voo_tripulantes (empresa_id, deleted_at);

CREATE TABLE IF NOT EXISTS cv_voo_eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  voo_id INTEGER NOT NULL,
  tipo_evento TEXT NOT NULL,
  status_anterior TEXT,
  status_novo TEXT,
  descricao TEXT,
  motivo_id INTEGER,
  metadata_json TEXT,
  usuario_id INTEGER,
  created_by INTEGER,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  CHECK (tipo_evento IN ('status', 'horario', 'tripulacao', 'rdv', 'ocorrencia', 'observacao', 'sistema')),
  CHECK (status_anterior IS NULL OR status_anterior IN (
    'planejado',
    'liberado_operacionalmente',
    'em_andamento',
    'pousado',
    'concluido_operacionalmente',
    'cancelado',
    'alternado_divergido'
  )),
  CHECK (status_novo IS NULL OR status_novo IN (
    'planejado',
    'liberado_operacionalmente',
    'em_andamento',
    'pousado',
    'concluido_operacionalmente',
    'cancelado',
    'alternado_divergido'
  )),
  FOREIGN KEY (voo_id) REFERENCES cv_voos(id),
  FOREIGN KEY (motivo_id) REFERENCES cv_motivos_operacionais(id)
);

CREATE INDEX IF NOT EXISTS idx_cv_voo_eventos_empresa_voo_created
  ON cv_voo_eventos (empresa_id, voo_id, created_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_voo_eventos_empresa_tipo_created
  ON cv_voo_eventos (empresa_id, tipo_evento, created_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_voo_eventos_empresa_usuario_created
  ON cv_voo_eventos (empresa_id, usuario_id, created_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_voo_eventos_empresa_deleted
  ON cv_voo_eventos (empresa_id, deleted_at);
