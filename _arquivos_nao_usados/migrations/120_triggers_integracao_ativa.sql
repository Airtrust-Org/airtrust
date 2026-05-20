-- ================================================================
-- MIGRATION 120: TRIGGERS PARA INTEGRAÇÃO ATIVA
-- ================================================================
-- 
-- Quando qualificacoes_tipos é atualizado (validade ou vencimento_fim_mes),
-- recalcula automaticamente data_vencimento em qualificacoes_historico
--
-- Isso garante que os dados estão sempre sincronizados
-- ================================================================

-- Trigger para recalcular vencimentos quando tipo de qualificação é atualizado
CREATE TRIGGER IF NOT EXISTS recalcular_vencimentos_on_tipo_update
AFTER UPDATE OF validade, vencimento_fim_mes ON qualificacoes_tipos
FOR EACH ROW
WHEN NEW.validade IS NOT NULL AND OLD.validade != NEW.validade OR OLD.vencimento_fim_mes != NEW.vencimento_fim_mes
BEGIN
  -- Recalcular vencimentos para todos os históricos deste tipo
  UPDATE qualificacoes_historico
  SET 
    data_vencimento = CASE
      -- Se não tem validade, mantém NULL (vitalícia)
      WHEN NEW.validade IS NULL THEN NULL
      -- Se vencimento_fim_mes = 1, vai para último dia do mês
      WHEN NEW.vencimento_fim_mes = 1 THEN 
        date(data_conclusao, '+' || NEW.validade || ' months', 'start of month', '+1 month', '-1 day')
      -- Se vencimento_fim_mes = 0, dia exato
      ELSE 
        date(data_conclusao, '+' || NEW.validade || ' months')
    END,
    updated_at = CURRENT_TIMESTAMP
  WHERE UPPER(qualificacao_codigo) = UPPER(NEW.codigo)
    AND deleted_at IS NULL;
END;

-- Trigger para atualizar timestamp em qualificacoes_historico
CREATE TRIGGER IF NOT EXISTS update_historico_timestamp
AFTER UPDATE ON qualificacoes_historico
FOR EACH ROW
BEGIN
  UPDATE qualificacoes_historico 
  SET updated_at = CURRENT_TIMESTAMP 
  WHERE id = NEW.id;
END;
