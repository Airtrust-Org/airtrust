-- ===== SCHEMA D1 - AirTrust Database =====
-- Este é um schema básico de referência
-- Ajuste conforme necessário para seu caso de uso

-- ===== FUNCIONARIOS =====
CREATE TABLE IF NOT EXISTS funcionarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  matricula TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  cpf TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  telefone TEXT,
  cargo TEXT,
  setor TEXT,
  funcao TEXT,
  codigo_anac TEXT,
  ativo INTEGER DEFAULT 1 CHECK (ativo IN (0, 1)),
  is_instrutor INTEGER DEFAULT 0 CHECK (is_instrutor IN (0, 1)),
  is_checador INTEGER DEFAULT 0 CHECK (is_checador IN (0, 1)),
  data_admissao TEXT, -- ISO date string
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT -- Soft delete
);

CREATE INDEX IF NOT EXISTS idx_funcionarios_matricula ON funcionarios(matricula) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_funcionarios_cpf ON funcionarios(cpf) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_funcionarios_email ON funcionarios(email) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_funcionarios_ativo ON funcionarios(ativo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_funcionarios_deleted_at ON funcionarios(deleted_at);

-- ===== QUALIFICACOES TIPOS =====
CREATE TABLE IF NOT EXISTS qualificacoes_tipos (
  id TEXT PRIMARY KEY,
  tipo TEXT,
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  descricao TEXT,
  categoria TEXT NOT NULL,
  carga_horaria REAL,
  validade INTEGER,
  observacoes TEXT,
  ativo INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_qualificacoes_tipos_categoria ON qualificacoes_tipos(categoria) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_tipos_codigo ON qualificacoes_tipos(codigo) WHERE deleted_at IS NULL;

-- ===== QUALIFICACOES HISTORICO =====
CREATE TABLE IF NOT EXISTS qualificacoes_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL REFERENCES funcionarios(id),
  qualificacao_id INTEGER NOT NULL REFERENCES qualificacoes_tipos(id),
  data_obtencao TEXT NOT NULL, -- ISO date
  data_validade TEXT NOT NULL, -- ISO date
  status TEXT NOT NULL DEFAULT 'VALIDA' CHECK (status IN ('VALIDA', 'VENCIDA', 'PROXIMA_VENCIMENTO')),
  certificado_url TEXT, -- R2 URL
  observacoes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_qualificacoes_historico_funcionario ON qualificacoes_historico(funcionario_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_historico_qualificacao ON qualificacoes_historico(qualificacao_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_historico_status ON qualificacoes_historico(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_historico_data_validade ON qualificacoes_historico(data_validade) WHERE deleted_at IS NULL;

-- ===== SIMULADORES =====
CREATE TABLE IF NOT EXISTS simuladores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  modelo TEXT NOT NULL,
  fabricante TEXT,
  tipo TEXT,
  codigo TEXT UNIQUE,
  ativo INTEGER DEFAULT 1 CHECK (ativo IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_simuladores_modelo ON simuladores(modelo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_simuladores_ativo ON simuladores(ativo) WHERE deleted_at IS NULL;

-- ===== SESSOES SIMULADOR =====
CREATE TABLE IF NOT EXISTS sessoes_simulador (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  simulador_id INTEGER NOT NULL REFERENCES simuladores(id),
  instrutor_id INTEGER NOT NULL REFERENCES funcionarios(id),
  checador_id INTEGER REFERENCES funcionarios(id),
  data_sessao TEXT NOT NULL, -- ISO datetime
  duracao_minutos INTEGER NOT NULL,
  tipo_sessao TEXT NOT NULL CHECK (tipo_sessao IN ('TREINAMENTO', 'AVALIACAO', 'RECORRENTE')),
  status TEXT NOT NULL DEFAULT 'AGENDADA' CHECK (status IN ('AGENDADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA')),
  observacoes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessoes_simulador_simulador ON sessoes_simulador(simulador_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sessoes_simulador_instrutor ON sessoes_simulador(instrutor_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sessoes_simulador_data ON sessoes_simulador(data_sessao) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sessoes_simulador_status ON sessoes_simulador(status) WHERE deleted_at IS NULL;

-- ===== PARTICIPANTES SESSAO =====
CREATE TABLE IF NOT EXISTS participantes_sessao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sessao_id INTEGER NOT NULL REFERENCES sessoes_simulador(id) ON DELETE CASCADE,
  funcionario_id INTEGER NOT NULL REFERENCES funcionarios(id),
  funcao TEXT NOT NULL CHECK (funcao IN ('PILOTO', 'COPILOTO', 'OBSERVADOR')),
  aprovado INTEGER CHECK (aprovado IN (0, 1)),
  nota REAL CHECK (nota >= 0 AND nota <= 10),
  observacoes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_participantes_sessao_sessao ON participantes_sessao(sessao_id);
CREATE INDEX IF NOT EXISTS idx_participantes_sessao_funcionario ON participantes_sessao(funcionario_id);

-- ===== AUDIT LOGS =====
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES funcionarios(id),
  action TEXT NOT NULL, -- CREATE, UPDATE, DELETE, LOGIN, etc
  entity_type TEXT NOT NULL, -- funcionarios, qualificacoes, sessoes, etc
  entity_id INTEGER,
  old_values TEXT, -- JSON
  new_values TEXT, -- JSON
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- ===== DADOS EXEMPLO (OPCIONAL) =====

-- Inserir qualificações tipos exemplo
INSERT OR IGNORE INTO qualificacoes_tipos (nome, codigo, categoria, validade_meses) VALUES
  ('CMA Classe 1', 'CMA1', 'CMA', 12),
  ('CMA Classe 2', 'CMA2', 'CMA', 12),
  ('ICAO Nível 4', 'ICAO4', 'ICAO', 36),
  ('ICAO Nível 5', 'ICAO5', 'ICAO', 60),
  ('ASO Anual', 'ASO', 'ASO', 12),
  ('CHECK PC', 'CHECK_PC', 'CHECK', 6);

-- Inserir simuladores exemplo
INSERT OR IGNORE INTO simuladores (modelo, fabricante, tipo, codigo) VALUES
  ('A320', 'Airbus', 'FFN', 'SIM-A320-001'),
  ('B737', 'Boeing', 'FFN', 'SIM-B737-001'),
  ('E190', 'Embraer', 'FFN', 'SIM-E190-001');

-- NOTA: Execute este schema com:
-- wrangler d1 execute airtrust-db --file=./schema.sql
