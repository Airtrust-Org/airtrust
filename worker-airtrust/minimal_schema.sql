-- Tabelas essenciais apenas

CREATE TABLE IF NOT EXISTS funcionarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS qualificacoes_tipos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  codigo TEXT NOT NULL UNIQUE,
  categoria TEXT NOT NULL,
  descricao TEXT,
  validade_meses INTEGER,
  obrigatoria INTEGER DEFAULT 1 CHECK (obrigatoria IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_qualificacoes_tipos_categoria ON qualificacoes_tipos(categoria) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_tipos_codigo ON qualificacoes_tipos(codigo) WHERE deleted_at IS NULL;
