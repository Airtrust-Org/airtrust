-- Migration: Criar trigger para preencher validade automaticamente
-- Data: 2025-10-22
-- Descrição: Trigger que preenche automaticamente campos de qualificações baseado no catálogo

-- Trigger para INSERT
CREATE TRIGGER IF NOT EXISTS preencher_qualificacao_insert
AFTER INSERT ON qualificacoes
FOR EACH ROW
WHEN NEW.codigo IS NOT NULL
BEGIN
  -- Preencher dados do catálogo
  UPDATE qualificacoes
  SET 
    nome = COALESCE(NULLIF(nome, ''), (
      SELECT nome FROM catalogo_treinamentos 
      WHERE codigo = NEW.codigo AND deleted_at IS NULL LIMIT 1
    )),
    periodicidade_meses = COALESCE(NULLIF(periodicidade_meses, 0), (
      SELECT validade_meses FROM catalogo_treinamentos 
      WHERE codigo = NEW.codigo AND deleted_at IS NULL LIMIT 1
    )),
    carga_horaria = COALESCE(NULLIF(carga_horaria, 0), (
      SELECT carga_horaria FROM catalogo_treinamentos 
      WHERE codigo = NEW.codigo AND deleted_at IS NULL LIMIT 1
    )),
    categoria = COALESCE(NULLIF(categoria, ''), (
      SELECT categoria FROM catalogo_treinamentos 
      WHERE codigo = NEW.codigo AND deleted_at IS NULL LIMIT 1
    )),
    -- Calcular data_vencimento se tiver data_realizacao
    data_vencimento = CASE 
      WHEN NEW.data_realizacao IS NOT NULL AND NEW.data_realizacao != '' 
      THEN date(NEW.data_realizacao, '+' || COALESCE((
        SELECT validade_meses FROM catalogo_treinamentos 
        WHERE codigo = NEW.codigo AND deleted_at IS NULL LIMIT 1
      ), 12) || ' months')
      ELSE data_vencimento
    END,
    -- Sincronizar data_validade com data_vencimento
    data_validade = CASE 
      WHEN NEW.data_realizacao IS NOT NULL AND NEW.data_realizacao != '' 
      THEN date(NEW.data_realizacao, '+' || COALESCE((
        SELECT validade_meses FROM catalogo_treinamentos 
        WHERE codigo = NEW.codigo AND deleted_at IS NULL LIMIT 1
      ), 12) || ' months')
      ELSE data_validade
    END
  WHERE id = NEW.id;
END;

-- Trigger para UPDATE
CREATE TRIGGER IF NOT EXISTS preencher_qualificacao_update
AFTER UPDATE OF codigo, data_realizacao ON qualificacoes
FOR EACH ROW
WHEN NEW.codigo IS NOT NULL
BEGIN
  -- Recalcular data_vencimento se data_realizacao mudou
  UPDATE qualificacoes
  SET 
    data_vencimento = CASE 
      WHEN NEW.data_realizacao IS NOT NULL AND NEW.data_realizacao != '' 
      THEN date(NEW.data_realizacao, '+' || COALESCE((
        SELECT validade_meses FROM catalogo_treinamentos 
        WHERE codigo = NEW.codigo AND deleted_at IS NULL LIMIT 1
      ), 12) || ' months')
      ELSE data_vencimento
    END,
    data_validade = CASE 
      WHEN NEW.data_realizacao IS NOT NULL AND NEW.data_realizacao != '' 
      THEN date(NEW.data_realizacao, '+' || COALESCE((
        SELECT validade_meses FROM catalogo_treinamentos 
        WHERE codigo = NEW.codigo AND deleted_at IS NULL LIMIT 1
      ), 12) || ' months')
      ELSE data_validade
    END
  WHERE id = NEW.id;
END;
