-- Migration 0155: Fix UNIQUE constraint em tipos_sessao
-- Problem: UNIQUE(codigo) impede reutilizar código em registros deletados
-- Solution: Usar UNIQUE(codigo, deleted_at) para permitir soft delete

-- Criar tabela temporária com novo schema
CREATE TABLE IF NOT EXISTS tipos_sessao_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  ativo INTEGER DEFAULT 1,
  ordem INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now')),
  deleted_at DATETIME,
  UNIQUE(codigo, deleted_at)
);

-- Copiar dados da tabela antiga
INSERT INTO tipos_sessao_new 
SELECT id, codigo, nome, descricao, ativo, ordem, created_at, updated_at, deleted_at 
FROM tipos_sessao;

-- Remover tabela antiga
DROP TABLE tipos_sessao;

-- Renomear nova tabela
ALTER TABLE tipos_sessao_new RENAME TO tipos_sessao;

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_tipos_sessao_codigo ON tipos_sessao(codigo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tipos_sessao_deleted_at ON tipos_sessao(deleted_at);
