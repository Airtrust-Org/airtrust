-- ================================================================
-- MIGRAÇÃO: TABELAS SIMULADORES - CRUDs FALTANTES
-- Data: 2025-11-20
-- ================================================================

-- Tabela instrutores_simulador (se não existir)
CREATE TABLE IF NOT EXISTS instrutores_simulador (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  habilitacoes TEXT,
  observacoes TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
  deleted_at TEXT DEFAULT NULL,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);

CREATE INDEX IF NOT EXISTS idx_instrutores_funcionario ON instrutores_simulador(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_instrutores_deleted ON instrutores_simulador(deleted_at);

-- Garantir que tabela manobras_categorias tem coluna 'cor'
-- (SQLite não suporta ALTER COLUMN, então verificamos se existe)
-- Se não existir, criamos do zero com cor
CREATE TABLE IF NOT EXISTS manobras_categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT UNIQUE NOT NULL,
  cor TEXT DEFAULT '#3B82F6',
  created_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
  deleted_at TEXT DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_manobras_categorias_deleted ON manobras_categorias(deleted_at);

-- Garantir que tabela modelos_sessao existe com estrutura correta
CREATE TABLE IF NOT EXISTS modelos_sessao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
  deleted_at TEXT DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_modelos_deleted ON modelos_sessao(deleted_at);

-- Garantir que tabela tipos_sessao existe com estrutura correta
CREATE TABLE IF NOT EXISTS tipos_sessao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
  deleted_at TEXT DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_tipos_sessao_deleted ON tipos_sessao(deleted_at);

-- Garantir que certificados_templates tem estrutura correta
CREATE TABLE IF NOT EXISTS certificados_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  tipo TEXT DEFAULT 'FICHA' CHECK(tipo IN ('FICHA', 'CERTIFICADO', 'RELATORIO')),
  descricao TEXT,
  conteudo TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
  deleted_at TEXT DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_templates_tipo ON certificados_templates(tipo);
CREATE INDEX IF NOT EXISTS idx_templates_deleted ON certificados_templates(deleted_at);
