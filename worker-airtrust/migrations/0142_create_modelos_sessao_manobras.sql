-- Migration 0142: Criar tabela modelos_sessao_manobras (N:N com ordenação)
-- Relaciona modelos de sessão com manobras específicas e define ordem de execução

CREATE TABLE IF NOT EXISTS modelos_sessao_manobras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  modelo_id INTEGER NOT NULL,
  manobra_id INTEGER NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  obrigatoria BOOLEAN DEFAULT 1,
  observacoes TEXT,
  
  -- Auditoria
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now')),
  deleted_at DATETIME NULL,
  created_by TEXT,
  updated_by TEXT,
  
  -- Foreign Keys
  FOREIGN KEY (modelo_id) REFERENCES modelos_sessao(id) ON DELETE CASCADE,
  FOREIGN KEY (manobra_id) REFERENCES cadastro_manobras(id),
  
  -- Constraint: não permitir manobra duplicada no mesmo modelo
  UNIQUE(modelo_id, manobra_id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_modelos_sessao_manobras_modelo 
  ON modelos_sessao_manobras(modelo_id) 
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_modelos_sessao_manobras_manobra 
  ON modelos_sessao_manobras(manobra_id) 
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_modelos_sessao_manobras_ordem 
  ON modelos_sessao_manobras(modelo_id, ordem) 
  WHERE deleted_at IS NULL;

-- Trigger para atualizar updated_at
CREATE TRIGGER IF NOT EXISTS trigger_modelos_sessao_manobras_updated_at
AFTER UPDATE ON modelos_sessao_manobras
FOR EACH ROW
BEGIN
  UPDATE modelos_sessao_manobras 
  SET updated_at = datetime('now')
  WHERE id = NEW.id;
END;
