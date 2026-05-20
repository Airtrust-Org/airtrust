-- Migration 0201: Correção crítica de qualificacao_id e adição de coluna tipo
-- Data: 2026-02-05
-- Compliance: Garantir integridade referencial em qualificacoes_historico

-- 1. Adicionar coluna tipo (nome da qualificação) se não existir
ALTER TABLE qualificacoes_historico ADD COLUMN tipo TEXT;

-- 2. Popular coluna tipo com base nos tipos cadastrados
UPDATE qualificacoes_historico 
SET tipo = (
  SELECT qt.nome 
  FROM qualificacoes_tipos qt 
  WHERE qt.id = qualificacoes_historico.qualificacao_id
  LIMIT 1
)
WHERE qualificacao_id IS NOT NULL 
  AND tipo IS NULL;

-- 3. Corrigir registros órfãos (qualificacao_id NULL) buscando pelo código
UPDATE qualificacoes_historico 
SET qualificacao_id = (
  SELECT qt.id 
  FROM qualificacoes_tipos qt 
  WHERE qt.codigo = qualificacoes_historico.qualificacao_codigo 
    AND qt.deleted_at IS NULL
  LIMIT 1
),
tipo = (
  SELECT qt.nome 
  FROM qualificacoes_tipos qt 
  WHERE qt.codigo = qualificacoes_historico.qualificacao_codigo 
    AND qt.deleted_at IS NULL
  LIMIT 1
)
WHERE qualificacao_id IS NULL 
  AND qualificacao_codigo IS NOT NULL
  AND deleted_at IS NULL;

-- 4. Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_qualificacoes_historico_tipo 
ON qualificacoes_historico(tipo);

-- 5. Criar trigger para auto-preencher tipo em novos registros
DROP TRIGGER IF EXISTS trg_qualificacoes_historico_set_tipo;
CREATE TRIGGER trg_qualificacoes_historico_set_tipo
AFTER INSERT ON qualificacoes_historico
WHEN NEW.tipo IS NULL AND NEW.qualificacao_id IS NOT NULL
BEGIN
  UPDATE qualificacoes_historico
  SET tipo = (
    SELECT nome FROM qualificacoes_tipos 
    WHERE id = NEW.qualificacao_id 
    LIMIT 1
  )
  WHERE id = NEW.id;
END;

-- 6. Trigger para atualizar tipo quando qualificacao_id mudar
DROP TRIGGER IF EXISTS trg_qualificacoes_historico_update_tipo;
CREATE TRIGGER trg_qualificacoes_historico_update_tipo
AFTER UPDATE OF qualificacao_id ON qualificacoes_historico
WHEN NEW.qualificacao_id IS NOT NULL 
  AND (OLD.qualificacao_id IS NULL OR OLD.qualificacao_id != NEW.qualificacao_id)
BEGIN
  UPDATE qualificacoes_historico
  SET tipo = (
    SELECT nome FROM qualificacoes_tipos 
    WHERE id = NEW.qualificacao_id 
    LIMIT 1
  )
  WHERE id = NEW.id;
END;
