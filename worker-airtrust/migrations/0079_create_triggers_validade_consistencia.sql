-- 0079_create_triggers_validade_consistencia.sql
-- Garante consistência entre validade_meses e data_vencimento em qualificacoes_historico
-- Recalcula data_vencimento se validade_meses for alterado e data_conclusao existir

DROP TRIGGER IF EXISTS trg_qh_set_data_vencimento_insert;
DROP TRIGGER IF EXISTS trg_qh_set_data_vencimento_update;

CREATE TRIGGER trg_qh_set_data_vencimento_insert
AFTER INSERT ON qualificacoes_historico
FOR EACH ROW
WHEN NEW.validade_meses IS NOT NULL AND NEW.validade_meses > 0 AND NEW.data_conclusao IS NOT NULL
BEGIN
  UPDATE qualificacoes_historico
    SET data_vencimento = date(NEW.data_conclusao, '+' || NEW.validade_meses || ' months')
    WHERE id = NEW.id;
END;

CREATE TRIGGER trg_qh_set_data_vencimento_update
AFTER UPDATE OF validade_meses, data_conclusao ON qualificacoes_historico
FOR EACH ROW
WHEN NEW.validade_meses IS NOT NULL AND NEW.validade_meses > 0 AND NEW.data_conclusao IS NOT NULL
BEGIN
  UPDATE qualificacoes_historico
    SET data_vencimento = date(NEW.data_conclusao, '+' || NEW.validade_meses || ' months')
    WHERE id = NEW.id;
END;
