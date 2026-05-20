-- Migration: Create missing tables in production
-- Creates all tables that exist in local but not in production

-- Table: simuladores
CREATE TABLE IF NOT EXISTS simuladores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  modelo TEXT NOT NULL,
  tipo TEXT NOT NULL,
  fabricante TEXT,
  localizacao TEXT,
  capacidade INTEGER DEFAULT 1,
  status TEXT CHECK(status IN ('ATIVO', 'MANUTENCAO', 'INATIVO')) DEFAULT 'ATIVO',
  observacoes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_simuladores_status ON simuladores(status);
CREATE INDEX IF NOT EXISTS idx_simuladores_deleted ON simuladores(deleted_at);

-- Table: agendamentos_simulador
CREATE TABLE IF NOT EXISTS agendamentos_simulador (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  simulador_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  data_inicio TEXT NOT NULL,
  data_fim TEXT NOT NULL,
  tipo_sessao TEXT NOT NULL,
  status TEXT CHECK(status IN ('AGENDADO', 'CONFIRMADO', 'REALIZADO', 'CANCELADO')) DEFAULT 'AGENDADO',
  observacoes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (simulador_id) REFERENCES simuladores(id),
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);

CREATE INDEX IF NOT EXISTS idx_agendamentos_simulador ON agendamentos_simulador(simulador_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_funcionario ON agendamentos_simulador(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_data ON agendamentos_simulador(data_inicio);

-- Table: treinamentos
CREATE TABLE IF NOT EXISTS treinamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  categoria TEXT NOT NULL,
  descricao TEXT,
  periodicidade INTEGER,
  carga_horaria INTEGER,
  instrutor TEXT,
  ativo INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_treinamentos_codigo ON treinamentos(codigo);
CREATE INDEX IF NOT EXISTS idx_treinamentos_ativo ON treinamentos(ativo);
CREATE INDEX IF NOT EXISTS idx_treinamentos_deleted ON treinamentos(deleted_at);

-- Table: sessoes_treinamento
CREATE TABLE IF NOT EXISTS sessoes_treinamento (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  treinamento_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  data_inicio TEXT NOT NULL,
  data_conclusao TEXT,
  status TEXT CHECK(status IN ('AGENDADO', 'EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO')) DEFAULT 'AGENDADO',
  nota_final REAL,
  aprovado INTEGER,
  observacoes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (treinamento_id) REFERENCES treinamentos(id),
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);

CREATE INDEX IF NOT EXISTS idx_sessoes_treinamento ON sessoes_treinamento(treinamento_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_funcionario ON sessoes_treinamento(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_status ON sessoes_treinamento(status);

-- Table: funcionarios_aeronaves
CREATE TABLE IF NOT EXISTS funcionarios_aeronaves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  aeronave_id INTEGER NOT NULL,
  data_inicio TEXT NOT NULL,
  data_fim TEXT,
  ativo INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (aeronave_id) REFERENCES aeronaves(id),
  UNIQUE(funcionario_id, aeronave_id, data_inicio)
);

CREATE INDEX IF NOT EXISTS idx_func_aeronaves_funcionario ON funcionarios_aeronaves(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_func_aeronaves_aeronave ON funcionarios_aeronaves(aeronave_id);
CREATE INDEX IF NOT EXISTS idx_func_aeronaves_ativo ON funcionarios_aeronaves(ativo);

-- Table: auditoria
CREATE TABLE IF NOT EXISTS auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id TEXT,
  usuario_nome TEXT,
  acao TEXT NOT NULL,
  tabela_afetada TEXT NOT NULL,
  registro_id TEXT,
  dados_antes TEXT,
  dados_depois TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON auditoria(usuario_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_tabela ON auditoria(tabela_afetada);
CREATE INDEX IF NOT EXISTS idx_auditoria_created ON auditoria(created_at);

-- Table: certificado_anexos
CREATE TABLE IF NOT EXISTS certificado_anexos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  certificado_id INTEGER NOT NULL,
  nome_arquivo TEXT NOT NULL,
  tipo_arquivo TEXT,
  tamanho INTEGER,
  url TEXT NOT NULL,
  uploaded_at TEXT DEFAULT (datetime('now')),
  uploaded_by TEXT,
  FOREIGN KEY (certificado_id) REFERENCES certificados(id)
);

CREATE INDEX IF NOT EXISTS idx_certificado_anexos_cert ON certificado_anexos(certificado_id);

-- Table: compliance_status
CREATE TABLE IF NOT EXISTS compliance_status (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  data_avaliacao TEXT NOT NULL,
  status TEXT CHECK(status IN ('COMPLIANT', 'NON_COMPLIANT', 'PENDING')) NOT NULL,
  detalhes TEXT,
  avaliado_por TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);

CREATE INDEX IF NOT EXISTS idx_compliance_funcionario ON compliance_status(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_compliance_status ON compliance_status(status);
CREATE INDEX IF NOT EXISTS idx_compliance_data ON compliance_status(data_avaliacao);

-- Table: pasta_virtual_sync
CREATE TABLE IF NOT EXISTS pasta_virtual_sync (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  arquivo_id INTEGER NOT NULL,
  sync_status TEXT CHECK(sync_status IN ('PENDING', 'SYNCED', 'ERROR')) DEFAULT 'PENDING',
  last_sync TEXT,
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);

CREATE INDEX IF NOT EXISTS idx_pasta_sync_funcionario ON pasta_virtual_sync(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_pasta_sync_status ON pasta_virtual_sync(sync_status);

-- Table: user_permissions
CREATE TABLE IF NOT EXISTS user_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id TEXT NOT NULL,
  permissao TEXT NOT NULL,
  recurso TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  UNIQUE(usuario_id, permissao, recurso)
);

CREATE INDEX IF NOT EXISTS idx_user_permissions_usuario ON user_permissions(usuario_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_permissao ON user_permissions(permissao);

-- Table: user_profiles
CREATE TABLE IF NOT EXISTS user_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id TEXT UNIQUE NOT NULL,
  avatar_url TEXT,
  telefone TEXT,
  departamento TEXT,
  cargo TEXT,
  preferencias TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_usuario ON user_profiles(usuario_id);

SELECT 'Migration 2001 completed - All missing tables created' as message;
