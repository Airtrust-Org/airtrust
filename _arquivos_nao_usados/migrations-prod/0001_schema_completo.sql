-- Schema Completo AirTrust para Produção
-- Data: 21/10/2025

-- ============================================
-- TABELA: usuarios
-- ============================================
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nome TEXT NOT NULL,
  perfil TEXT DEFAULT 'USUARIO' CHECK(perfil IN ('ADMIN', 'COMPLIANCE', 'GESTOR', 'USUARIO')),
  funcionario_id INTEGER,
  ativo INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);

CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);
CREATE INDEX IF NOT EXISTS idx_usuarios_perfil ON usuarios(perfil);

-- ============================================
-- TABELA: funcionarios
-- ============================================
CREATE TABLE IF NOT EXISTS funcionarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  matricula TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  cpf TEXT UNIQUE,
  email TEXT,
  telefone TEXT,
  data_nascimento TEXT,
  data_admissao TEXT,
  cargo TEXT,
  setor TEXT,
  status TEXT DEFAULT 'ATIVO',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_funcionarios_matricula ON funcionarios(matricula);
CREATE INDEX IF NOT EXISTS idx_funcionarios_nome ON funcionarios(nome);
CREATE INDEX IF NOT EXISTS idx_funcionarios_status ON funcionarios(status);
CREATE INDEX IF NOT EXISTS idx_funcionarios_deleted ON funcionarios(deleted_at);

-- ============================================
-- TABELA: qualificacoes (UNIFICADA)
-- ============================================
CREATE TABLE IF NOT EXISTS qualificacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  tipo TEXT NOT NULL CHECK(tipo IN ('TREINAMENTO', 'EXAME', 'CHECK')),
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL,
  data_realizacao TEXT,
  data_validade TEXT,
  resultado TEXT,
  nota REAL,
  instrutor TEXT,
  local TEXT,
  observacoes TEXT,
  certificado_url TEXT,
  status TEXT DEFAULT 'ATIVO',
  superseded_by INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id) ON DELETE CASCADE,
  FOREIGN KEY (superseded_by) REFERENCES qualificacoes(id)
);

CREATE INDEX IF NOT EXISTS idx_qualificacoes_funcionario ON qualificacoes(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_qualificacoes_tipo ON qualificacoes(tipo);
CREATE INDEX IF NOT EXISTS idx_qualificacoes_codigo ON qualificacoes(codigo);
CREATE INDEX IF NOT EXISTS idx_qualificacoes_validade ON qualificacoes(data_validade);
CREATE INDEX IF NOT EXISTS idx_qualificacoes_deleted ON qualificacoes(deleted_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_qualificacoes_unique ON qualificacoes(funcionario_id, tipo, codigo, data_realizacao) WHERE deleted_at IS NULL;

-- ============================================
-- TABELA: certificados
-- ============================================
CREATE TABLE IF NOT EXISTS certificados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  qualificacao_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  arquivo_nome TEXT NOT NULL,
  arquivo_nome_original TEXT NOT NULL,
  arquivo_tamanho INTEGER NOT NULL,
  arquivo_tamanho_original INTEGER DEFAULT 0,
  arquivo_tamanho_comprimido INTEGER DEFAULT 0,
  compressao_percentual REAL DEFAULT 0,
  arquivo_hash TEXT NOT NULL,
  arquivo_r2_key TEXT NOT NULL UNIQUE,
  arquivo_url TEXT NOT NULL,
  tipo TEXT DEFAULT 'CERTIFICADO',
  data_documento TEXT,
  uploaded_by INTEGER,
  uploaded_at TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (qualificacao_id) REFERENCES qualificacoes(id) ON DELETE CASCADE,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_certificados_qualificacao ON certificados(qualificacao_id);
CREATE INDEX IF NOT EXISTS idx_certificados_funcionario ON certificados(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_certificados_hash ON certificados(arquivo_hash);
CREATE INDEX IF NOT EXISTS idx_certificados_deleted ON certificados(deleted_at);

-- ============================================
-- TABELA: certificados_auditoria
-- ============================================
CREATE TABLE IF NOT EXISTS certificados_auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  certificado_id INTEGER NOT NULL,
  acao TEXT NOT NULL,
  usuario_id INTEGER,
  detalhes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (certificado_id) REFERENCES certificados(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_certificados_auditoria_certificado ON certificados_auditoria(certificado_id);
CREATE INDEX IF NOT EXISTS idx_certificados_auditoria_acao ON certificados_auditoria(acao);

-- ============================================
-- TABELA: importacoes_log
-- ============================================
CREATE TABLE IF NOT EXISTS importacoes_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL,
  arquivo_nome TEXT,
  total_registros INTEGER DEFAULT 0,
  sucesso INTEGER DEFAULT 0,
  erros INTEGER DEFAULT 0,
  detalhes TEXT,
  usuario_id INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_importacoes_tipo ON importacoes_log(tipo);
CREATE INDEX IF NOT EXISTS idx_importacoes_created ON importacoes_log(created_at);
