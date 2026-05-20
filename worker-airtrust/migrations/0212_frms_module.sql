-- ============================================================
-- Migration 0212: FRMS Module (Flight and Rest Management System)
-- Tabelas para gestão de jornada, fadiga e limites regulatórios
-- ============================================================

-- Configuração de limites regulatórios (não hardcoded)
CREATE TABLE IF NOT EXISTS frms_configuracao_limites (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  valor_numerico REAL NOT NULL,
  unidade TEXT NOT NULL,
  descricao TEXT,
  ativo INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_frms_config_nome ON frms_configuracao_limites(nome);
CREATE INDEX IF NOT EXISTS idx_frms_config_deleted ON frms_configuracao_limites(deleted_at);

-- Jornada diária por tripulante
CREATE TABLE IF NOT EXISTS frms_jornada (
  id TEXT PRIMARY KEY,
  tripulante_id INTEGER NOT NULL REFERENCES funcionarios(id),
  data TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('ES','FR','FE','STANDBY_BASE','STANDBY_CASA','TRAINING','POSITIONING')),
  hora_apresentacao TEXT,
  hora_termino TEXT,
  duracao_jornada_minutos INTEGER,
  horas_voo_minutos INTEGER,
  hora_primeiro_acionamento TEXT,
  hora_primeira_decolagem TEXT,
  hora_ultimo_pouso TEXT,
  hora_corte_motor TEXT,
  repouso_plataforma_inicio TEXT,
  repouso_plataforma_fim TEXT,
  repouso_plataforma_valido INTEGER DEFAULT 0,
  observacao TEXT,
  registrado_por TEXT NOT NULL,
  origem TEXT DEFAULT 'MANUAL' CHECK(origem IN ('MANUAL','APUS','SIMULADOR')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_frms_jornada_tripulante ON frms_jornada(tripulante_id);
CREATE INDEX IF NOT EXISTS idx_frms_jornada_data ON frms_jornada(data);
CREATE INDEX IF NOT EXISTS idx_frms_jornada_trip_data ON frms_jornada(tripulante_id, data);
CREATE INDEX IF NOT EXISTS idx_frms_jornada_deleted ON frms_jornada(deleted_at);
CREATE INDEX IF NOT EXISTS idx_frms_jornada_status ON frms_jornada(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_frms_jornada_trip_data_uq ON frms_jornada(tripulante_id, data) WHERE deleted_at IS NULL;

-- Fatorização de jornada (fatores de fadiga por dia)
CREATE TABLE IF NOT EXISTS frms_fatorizacao_jornada (
  id TEXT PRIMARY KEY,
  jornada_id TEXT NOT NULL REFERENCES frms_jornada(id),
  fator_basica_pct REAL DEFAULT 0,
  fator_apresentacao_pct REAL DEFAULT 0,
  fator_duracao_pct REAL DEFAULT 0,
  fator_repouso_pct REAL DEFAULT 0,
  fator_noturno_dep_pct REAL DEFAULT 0,
  fator_noturno_arr_pct REAL DEFAULT 0,
  total_fatorizado_jornada REAL DEFAULT 0,
  fator_hv_basica_pct REAL DEFAULT 0,
  fator_hv_quantidade_pct REAL DEFAULT 0,
  fator_hv_noturno_dep_pct REAL DEFAULT 0,
  fator_hv_noturno_arr_pct REAL DEFAULT 0,
  total_fatorizado_hv REAL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_frms_fator_jornada ON frms_fatorizacao_jornada(jornada_id);
CREATE INDEX IF NOT EXISTS idx_frms_fator_deleted ON frms_fatorizacao_jornada(deleted_at);

-- Acúmulo mensal consolidado por tripulante
CREATE TABLE IF NOT EXISTS frms_acumulo_mensal (
  id TEXT PRIMARY KEY,
  tripulante_id INTEGER NOT NULL REFERENCES funcionarios(id),
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK(mes >= 1 AND mes <= 12),
  jornada_realizada_min INTEGER DEFAULT 0,
  hv_realizada_min INTEGER DEFAULT 0,
  jornada_fatorizada_pct REAL DEFAULT 0,
  hv_fatorizada_pct REAL DEFAULT 0,
  dias_embarcado INTEGER DEFAULT 0,
  dias_folga INTEGER DEFAULT 0,
  dias_ferias INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_frms_acumulo_mensal_trip ON frms_acumulo_mensal(tripulante_id);
CREATE INDEX IF NOT EXISTS idx_frms_acumulo_mensal_periodo ON frms_acumulo_mensal(ano, mes);
CREATE INDEX IF NOT EXISTS idx_frms_acumulo_mensal_deleted ON frms_acumulo_mensal(deleted_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_frms_acumulo_mensal_uq ON frms_acumulo_mensal(tripulante_id, ano, mes) WHERE deleted_at IS NULL;

-- Acúmulo rolling (janela deslizante) calculado diariamente
CREATE TABLE IF NOT EXISTS frms_acumulo_rolling (
  id TEXT PRIMARY KEY,
  tripulante_id INTEGER NOT NULL REFERENCES funcionarios(id),
  data_referencia TEXT NOT NULL,
  hv_7_dias_min INTEGER DEFAULT 0,
  hv_28_dias_min INTEGER DEFAULT 0,
  hv_365_dias_min INTEGER DEFAULT 0,
  hv_mes_calendario_min INTEGER DEFAULT 0,
  hv_dia_min INTEGER DEFAULT 0,
  pct_limite_7d REAL DEFAULT 0,
  pct_limite_28d REAL DEFAULT 0,
  pct_limite_365d REAL DEFAULT 0,
  pct_limite_dia REAL DEFAULT 0,
  repouso_anterior_min INTEGER DEFAULT 0,
  repouso_suficiente INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_frms_rolling_trip ON frms_acumulo_rolling(tripulante_id);
CREATE INDEX IF NOT EXISTS idx_frms_rolling_data ON frms_acumulo_rolling(data_referencia);
CREATE INDEX IF NOT EXISTS idx_frms_rolling_trip_data ON frms_acumulo_rolling(tripulante_id, data_referencia);
CREATE INDEX IF NOT EXISTS idx_frms_rolling_deleted ON frms_acumulo_rolling(deleted_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_frms_rolling_uq ON frms_acumulo_rolling(tripulante_id, data_referencia) WHERE deleted_at IS NULL;

-- Alertas gerados pelo sistema
CREATE TABLE IF NOT EXISTS frms_alerta (
  id TEXT PRIMARY KEY,
  tripulante_id INTEGER NOT NULL REFERENCES funcionarios(id),
  jornada_id TEXT REFERENCES frms_jornada(id),
  tipo_limite TEXT NOT NULL CHECK(tipo_limite IN ('FDP_DIARIO','HV_DIARIA','HV_7D','HV_MES','HV_365D','REPOUSO')),
  nivel TEXT NOT NULL CHECK(nivel IN ('AVISO','ATENCAO','CRITICO','VIOLACAO')),
  percentual_atingido REAL NOT NULL,
  valor_atual_min INTEGER NOT NULL,
  valor_limite_min INTEGER NOT NULL,
  mensagem TEXT NOT NULL,
  visualizado INTEGER DEFAULT 0,
  visualizado_em TEXT,
  visualizado_por TEXT,
  resolvido INTEGER DEFAULT 0,
  resolvido_em TEXT,
  resolvido_por TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_frms_alerta_trip ON frms_alerta(tripulante_id);
CREATE INDEX IF NOT EXISTS idx_frms_alerta_jornada ON frms_alerta(jornada_id);
CREATE INDEX IF NOT EXISTS idx_frms_alerta_nivel ON frms_alerta(nivel);
CREATE INDEX IF NOT EXISTS idx_frms_alerta_tipo ON frms_alerta(tipo_limite);
CREATE INDEX IF NOT EXISTS idx_frms_alerta_deleted ON frms_alerta(deleted_at);
CREATE INDEX IF NOT EXISTS idx_frms_alerta_visualizado ON frms_alerta(visualizado) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_frms_alerta_resolvido ON frms_alerta(resolvido) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_frms_alerta_created ON frms_alerta(created_at);

-- Escala quinzenal por tripulante
CREATE TABLE IF NOT EXISTS frms_escala_quinzenal (
  id TEXT PRIMARY KEY,
  tripulante_id INTEGER NOT NULL REFERENCES funcionarios(id),
  ano INTEGER NOT NULL,
  ciclo INTEGER NOT NULL,
  data_inicio_embarque TEXT NOT NULL,
  data_fim_embarque TEXT NOT NULL,
  data_inicio_folga TEXT NOT NULL,
  data_fim_folga TEXT NOT NULL,
  dias_embarcado INTEGER NOT NULL,
  dias_folga INTEGER NOT NULL,
  status_ciclo TEXT DEFAULT 'ATIVO' CHECK(status_ciclo IN ('ATIVO','ENCERRADO','CANCELADO')),
  observacao TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_frms_escala_trip ON frms_escala_quinzenal(tripulante_id);
CREATE INDEX IF NOT EXISTS idx_frms_escala_periodo ON frms_escala_quinzenal(data_inicio_embarque, data_fim_folga);
CREATE INDEX IF NOT EXISTS idx_frms_escala_deleted ON frms_escala_quinzenal(deleted_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_frms_escala_uq ON frms_escala_quinzenal(tripulante_id, ano, ciclo) WHERE deleted_at IS NULL;
