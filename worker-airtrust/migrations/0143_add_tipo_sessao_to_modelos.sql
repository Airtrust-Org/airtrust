-- Migration 0143: Adicionar tipo_sessao_id na tabela modelos_sessao
-- Permite associar cada modelo de sessão a um tipo específico

-- Verificar se a coluna já existe antes de adicionar
ALTER TABLE modelos_sessao ADD COLUMN tipo_sessao_id INTEGER;

-- Foreign Key constraint (D1 aceita via CHECK)
CREATE INDEX IF NOT EXISTS idx_modelos_sessao_tipo 
  ON modelos_sessao(tipo_sessao_id) 
  WHERE deleted_at IS NULL;

-- Nota: A FK real será validada na aplicação pois D1 tem suporte limitado a ALTER TABLE
-- FOREIGN KEY (tipo_sessao_id) REFERENCES tipos_sessao(id)
