-- ==========================================
-- MIGRATION 0000: PRODUCTION-COMPATIBLE SCHEMA
-- Data: 2025-11-19
-- Objetivo: Create complete schema matching production database
-- ==========================================

-- Habilitacoes table
CREATE TABLE IF NOT EXISTS habilitacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT,
  ativo INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- Simuladores table (production schema)
CREATE TABLE IF NOT EXISTS simuladores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  modelo TEXT NOT NULL,
  tipo TEXT NOT NULL,
  fabricante TEXT,
  localizacao TEXT,
  capacidade INTEGER DEFAULT 1,
  status TEXT DEFAULT 'ATIVO',
  observacoes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- Funcionarios table (production schema)
CREATE TABLE IF NOT EXISTS funcionarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT UNIQUE,
  matricula TEXT UNIQUE,
  cargo TEXT,
  departamento TEXT,
  status TEXT DEFAULT 'ATIVO',
  observacoes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- Habilitacoes_funcionarios join table
CREATE TABLE IF NOT EXISTS habilitacoes_funcionarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  habilitacao_id INTEGER NOT NULL,
  data_obtencao TEXT,
  vencimento TEXT,
  ativo INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY(funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY(habilitacao_id) REFERENCES habilitacoes(id),
  UNIQUE(funcionario_id, habilitacao_id)
);

-- Sessoes_simulador table
CREATE TABLE IF NOT EXISTS sessoes_simulador (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  simulador_id INTEGER NOT NULL,
  data TEXT NOT NULL,
  duracao_minutos INTEGER DEFAULT 60,
  instrutor_id INTEGER,
  observacoes TEXT,
  status TEXT DEFAULT 'AGENDADA',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY(simulador_id) REFERENCES simuladores(id),
  FOREIGN KEY(instrutor_id) REFERENCES funcionarios(id)
);

-- Sessoes_participantes join table
CREATE TABLE IF NOT EXISTS sessoes_participantes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sessao_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  presente INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY(sessao_id) REFERENCES sessoes_simulador(id),
  FOREIGN KEY(funcionario_id) REFERENCES funcionarios(id),
  UNIQUE(sessao_id, funcionario_id)
);

-- Fichas_sessao table
CREATE TABLE IF NOT EXISTS fichas_sessao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sessao_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  simulador_id INTEGER NOT NULL,
  status TEXT DEFAULT 'ABERTA',
  data_abertura TEXT DEFAULT (datetime('now')),
  assinada_em TEXT,
  assinada_por TEXT,
  observacoes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY(sessao_id) REFERENCES sessoes_simulador(id),
  FOREIGN KEY(funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY(simulador_id) REFERENCES simuladores(id)
);

-- Manobras table
CREATE TABLE IF NOT EXISTS manobras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ficha_sessao_id INTEGER NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  resultado TEXT DEFAULT 'NAO_REALIZADA',
  observacoes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY(ficha_sessao_id) REFERENCES fichas_sessao(id)
);

-- Qualificacoes_tipos table
CREATE TABLE IF NOT EXISTS qualificacoes_tipos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT,
  nivel TEXT,
  criada_em TEXT DEFAULT (datetime('now')),
  atualizada_em TEXT DEFAULT (datetime('now')),
  deletada_em TEXT
);

-- Qualificacoes table
CREATE TABLE IF NOT EXISTS qualificacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ficha_sessao_id INTEGER NOT NULL,
  qualificacao_tipo_id INTEGER NOT NULL,
  data_obtencao TEXT,
  validade_ate TEXT,
  status TEXT DEFAULT 'OBTIDA',
  observacoes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY(ficha_sessao_id) REFERENCES fichas_sessao(id),
  FOREIGN KEY(qualificacao_tipo_id) REFERENCES qualificacoes_tipos(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_simuladores_status ON simuladores(status);
CREATE INDEX IF NOT EXISTS idx_funcionarios_status ON funcionarios(status);
-- Note: sessoes_simulador is a VIEW, cannot create index
CREATE INDEX IF NOT EXISTS idx_fichas_sessao_status ON fichas_sessao(status);
-- Note: Cannot create index on fichas_sessao.sessao_id or funcionario_id as they don't exist in base table

