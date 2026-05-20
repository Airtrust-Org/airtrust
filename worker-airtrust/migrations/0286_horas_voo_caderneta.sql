CREATE TABLE IF NOT EXISTS horas_voo_saldo_inicial (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  empresa_id INTEGER NOT NULL,
  horas_total_min INTEGER DEFAULT 0,
  horas_pic_min INTEGER DEFAULT 0,
  horas_sic_min INTEGER DEFAULT 0,
  horas_noturna_min INTEGER DEFAULT 0,
  horas_instrumento_min INTEGER DEFAULT 0,
  horas_simulador_min INTEGER DEFAULT 0,
  horas_instrucao_min INTEGER DEFAULT 0,
  horas_aw139_min INTEGER DEFAULT 0,
  horas_sk76_min INTEGER DEFAULT 0,
  horas_outros_modelos_min INTEGER DEFAULT 0,
  data_referencia TEXT NOT NULL,
  observacoes TEXT,
  criado_por INTEGER,
  atualizado_por INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  UNIQUE(funcionario_id, empresa_id)
);

CREATE TABLE IF NOT EXISTS horas_voo_lancamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  empresa_id INTEGER NOT NULL,
  data_voo TEXT NOT NULL,
  aeronave_id INTEGER,
  modelo_aeronave TEXT,
  prefixo_aeronave TEXT,
  origem TEXT,
  destino TEXT,
  duracao_total_min INTEGER NOT NULL DEFAULT 0,
  duracao_pic_min INTEGER DEFAULT 0,
  duracao_sic_min INTEGER DEFAULT 0,
  duracao_noturna_min INTEGER DEFAULT 0,
  duracao_instrumento_min INTEGER DEFAULT 0,
  duracao_instrucao_min INTEGER DEFAULT 0,
  pousos_dia INTEGER DEFAULT 0,
  pousos_noite INTEGER DEFAULT 0,
  hoist_cycles INTEGER DEFAULT 0,
  funcao TEXT NOT NULL,
  tipo_operacao TEXT,
  is_simulador INTEGER DEFAULT 0,
  origem_registro TEXT NOT NULL,
  frms_jornada_id INTEGER,
  sessao_simulador_id INTEGER,
  fira_importacao_id INTEGER,
  observacoes TEXT,
  numero_voo TEXT,
  criado_por INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_hvl_funcionario_data
  ON horas_voo_lancamentos(funcionario_id, data_voo)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hvl_empresa_funcionario
  ON horas_voo_lancamentos(empresa_id, funcionario_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hvl_origem
  ON horas_voo_lancamentos(origem_registro, frms_jornada_id)
  WHERE deleted_at IS NULL;
