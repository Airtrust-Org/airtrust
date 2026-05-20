-- Migration: 0360_matriz_treinamento_funcao
-- Matriz de Treinamentos por Função: define quais qualificações são obrigatórias/recomendadas por função

CREATE TABLE IF NOT EXISTS matriz_treinamento_funcao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  funcao_id INTEGER NOT NULL,
  qualificacao_tipo_id INTEGER NOT NULL,
  obrigatoriedade TEXT NOT NULL DEFAULT 'OBRIGATORIA' CHECK (obrigatoriedade IN ('OBRIGATORIA', 'RECOMENDADA', 'NAO_APLICA')),
  nivel_requerido INTEGER DEFAULT NULL,
  critico_operacional INTEGER NOT NULL DEFAULT 0,
  origem TEXT NOT NULL DEFAULT 'REGULATORIO' CHECK (origem IN ('REGULATORIO', 'SGSO', 'RH', 'CLIENTE', 'OUTRO')),
  observacoes TEXT DEFAULT NULL,
  ativo INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  updated_at DATETIME NOT NULL DEFAULT (datetime('now')),
  deleted_at DATETIME DEFAULT NULL,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (funcao_id) REFERENCES funcoes(id),
  FOREIGN KEY (qualificacao_tipo_id) REFERENCES qualificacoes_tipos(id)
);

CREATE INDEX IF NOT EXISTS idx_matriz_treinamento_empresa_funcao
  ON matriz_treinamento_funcao (empresa_id, funcao_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_matriz_treinamento_empresa_tipo
  ON matriz_treinamento_funcao (empresa_id, qualificacao_tipo_id)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_matriz_treinamento_unique_ativo
  ON matriz_treinamento_funcao (empresa_id, funcao_id, qualificacao_tipo_id)
  WHERE ativo = 1 AND deleted_at IS NULL;
