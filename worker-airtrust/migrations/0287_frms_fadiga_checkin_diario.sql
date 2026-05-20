CREATE TABLE IF NOT EXISTS frms_fadiga_config_empresa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL UNIQUE,
  ativo INTEGER NOT NULL DEFAULT 1,
  janela_inicio TEXT NOT NULL DEFAULT '04:00',
  janela_fim TEXT NOT NULL DEFAULT '11:00',
  threshold_amarelo INTEGER NOT NULL DEFAULT 40,
  threshold_vermelho INTEGER NOT NULL DEFAULT 60,
  peso_kss REAL NOT NULL DEFAULT 0.35,
  peso_sono_duracao REAL NOT NULL DEFAULT 0.25,
  peso_sono_qualidade REAL NOT NULL DEFAULT 0.2,
  peso_sintomas REAL NOT NULL DEFAULT 0.2,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS frms_fadiga_checkin (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  data_checkin TEXT NOT NULL,
  hora_checkin TEXT NOT NULL,
  kss_score INTEGER NOT NULL,
  horas_sono REAL NOT NULL,
  qualidade_sono INTEGER NOT NULL,
  sintomas_json TEXT,
  observacoes TEXT,
  score_fadiga INTEGER NOT NULL,
  nivel_fadiga TEXT NOT NULL,
  status_operacional TEXT NOT NULL,
  recomendacao TEXT,
  apto INTEGER NOT NULL DEFAULT 1,
  requires_frat_review INTEGER NOT NULL DEFAULT 0,
  frat_sugerido_nivel TEXT,
  associado_frat_avaliacao_id TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fadiga_checkin_unique_day
  ON frms_fadiga_checkin (empresa_id, funcionario_id, data_checkin)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fadiga_checkin_empresa_data
  ON frms_fadiga_checkin (empresa_id, data_checkin)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fadiga_checkin_funcionario_data
  ON frms_fadiga_checkin (funcionario_id, data_checkin)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fadiga_checkin_nivel
  ON frms_fadiga_checkin (empresa_id, nivel_fadiga, status_operacional)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS frms_fadiga_evento (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  checkin_id TEXT,
  tipo TEXT NOT NULL,
  payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fadiga_evento_empresa_tipo_data
  ON frms_fadiga_evento (empresa_id, tipo, created_at);
