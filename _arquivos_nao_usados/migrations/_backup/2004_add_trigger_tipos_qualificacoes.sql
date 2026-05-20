-- ============================================
-- TRIGGER: Recalcular qualificações ao alterar tipo
-- Objetivo: Integridade entre tipos_qualificacoes (mestre) e qualificacoes (instâncias)
-- ============================================

-- Recalcular vencimento e ajustar nome denormalizado quando tipo for alterado
CREATE TRIGGER IF NOT EXISTS atualizar_qualificacoes_apos_tipo
AFTER UPDATE ON tipos_qualificacoes
FOR EACH ROW
WHEN (OLD.validade_meses IS NOT NEW.validade_meses)
  OR (OLD.vencimento_tipo IS NOT NEW.vencimento_tipo)
  OR (OLD.nome IS NOT NEW.nome)
BEGIN
  UPDATE qualificacoes
  SET 
    data_validade = CASE 
      WHEN NEW.vencimento_tipo = 'FIM_DO_MES' THEN
        date(COALESCE(data_realizacao, data_conclusao), '+' || NEW.validade_meses || ' months', 'start of month', '+1 month', '-1 day')
      ELSE
        date(COALESCE(data_realizacao, data_conclusao), '+' || NEW.validade_meses || ' months')
    END,
    -- Atualiza nome se era igual ao antigo ou nulo (denormalização controlada)
    nome = CASE WHEN nome IS NULL OR nome = OLD.nome THEN NEW.nome ELSE nome END,
    updated_at = datetime('now')
  WHERE codigo = NEW.codigo
    AND tipo = NEW.tipo
    AND deleted_at IS NULL
    AND COALESCE(data_realizacao, data_conclusao) IS NOT NULL;
END;
