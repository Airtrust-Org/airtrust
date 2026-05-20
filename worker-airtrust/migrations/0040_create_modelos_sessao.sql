-- Migration 0040: Criar tabela modelos_sessao
CREATE TABLE IF NOT EXISTS modelos_sessao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  tipo TEXT DEFAULT 'INICIAL' CHECK(tipo IN ('INICIAL', 'RECORRENTE', 'TRANSICAO', 'UPGRADE', 'REVALIDACAO')),
  descricao TEXT,
  ordem_no_treinamento INTEGER,
  duracao_estimada INTEGER DEFAULT 120,
  ativo INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_modelos_codigo ON modelos_sessao(codigo);
CREATE INDEX IF NOT EXISTS idx_modelos_deleted ON modelos_sessao(deleted_at);
