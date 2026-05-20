-- Migration 2011: Criar Tabelas Base (Funcionarios, Qualificacoes, Tipos)
-- Data: 3 de novembro de 2025
-- Objetivo: Criar schema base do AirTrust

PRAGMA foreign_keys = OFF;

-- ============================================================
-- 1. TABELA: funcionarios
-- ============================================================
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
  funcao TEXT,
  endereco TEXT,
  escala TEXT,
  status TEXT DEFAULT 'ATIVO',
  is_instrutor BOOLEAN DEFAULT 0,
  is_checador BOOLEAN DEFAULT 0,
  codigo_anac TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_funcionarios_matricula ON funcionarios(matricula);
CREATE INDEX IF NOT EXISTS idx_funcionarios_nome ON funcionarios(nome);
CREATE INDEX IF NOT EXISTS idx_funcionarios_status ON funcionarios(status);
CREATE INDEX IF NOT EXISTS idx_funcionarios_deleted ON funcionarios(deleted_at);

-- ============================================================
-- 2. TABELA: tipos_qualificacoes (MASTER - Dados Fixos)
-- ============================================================
CREATE TABLE IF NOT EXISTS tipos_qualificacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_tipo_qual_nome ON tipos_qualificacoes(nome);
CREATE INDEX IF NOT EXISTS idx_tipo_qual_deleted ON tipos_qualificacoes(deleted_at);

-- ============================================================
-- 3. TABELA: qualificacoes (Instâncias por Funcionário)
-- ============================================================
CREATE TABLE IF NOT EXISTS qualificacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  tipo TEXT NOT NULL,
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL,
  data_conclusao TEXT,
  data_vencimento TEXT,
  resultado TEXT DEFAULT 'PENDENTE',
  nota REAL,
  instrutor TEXT,
  observacoes TEXT,
  arquivo_url TEXT,
  status TEXT DEFAULT 'ATIVO',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_qual_funcionario ON qualificacoes(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_qual_tipo ON qualificacoes(tipo);
CREATE INDEX IF NOT EXISTS idx_qual_codigo ON qualificacoes(codigo);
CREATE INDEX IF NOT EXISTS idx_qual_vencimento ON qualificacoes(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_qual_deleted ON qualificacoes(deleted_at);

PRAGMA foreign_keys = ON;

SELECT 'Migration 2011 - Base schema criado com sucesso' as status;
