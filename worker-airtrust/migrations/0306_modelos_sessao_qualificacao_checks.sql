-- Migration 0306: Vincular qualificações e checks FAP padrão ao modelo de sessão
-- Permite definir no modelo qual qualificação será gerada e quais checks FAP são padrão

-- 1. Adicionar coluna qualificacao_tipo_id em modelos_sessao (FK para qualificacoes_tipos)
ALTER TABLE modelos_sessao ADD COLUMN qualificacao_tipo_id INTEGER NULL REFERENCES qualificacoes_tipos(id);

-- 2. Criar tabela de ligação entre modelo e checks FAP padrão
CREATE TABLE IF NOT EXISTS modelos_sessao_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  modelo_id INTEGER NOT NULL REFERENCES modelos_sessao(id),
  qualificacao_tipo_id INTEGER NOT NULL REFERENCES qualificacoes_tipos(id),
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now')),
  deleted_at DATETIME NULL,
  UNIQUE(modelo_id, qualificacao_tipo_id)
);

CREATE INDEX IF NOT EXISTS idx_modelos_sessao_checks_modelo ON modelos_sessao_checks(modelo_id);
CREATE INDEX IF NOT EXISTS idx_modelos_sessao_checks_qtipo ON modelos_sessao_checks(qualificacao_tipo_id);
