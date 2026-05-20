-- ========================================
-- MIGRATION 0128: Trigger para Recálculo Automático de Histórico
-- Data: 29/11/2025
-- Objetivo: Recalcular data_vencimento quando validade de tipo mudar
-- ========================================

-- Trigger: Recalcular histórico ao alterar validade
CREATE TRIGGER IF NOT EXISTS trg_tipo_update_recalcular_historico
AFTER UPDATE ON qualificacoes_tipos
WHEN NEW.validade != OLD.validade 
  OR NEW.vencimento_fim_mes != OLD.vencimento_fim_mes
BEGIN
  -- Atualizar data_vencimento de todos os registros deste tipo
  UPDATE qualificacoes_historico
  SET 
    data_vencimento = CASE
      -- Se vencimento_fim_mes = TRUE, último dia do mês
      WHEN NEW.vencimento_fim_mes = 1 THEN 
        DATE(data_conclusao, '+' || NEW.validade || ' months', 'start of month', '+1 month', '-1 day')
      -- Se FALSE, data exata
      ELSE 
        DATE(data_conclusao, '+' || NEW.validade || ' months')
    END,
    updated_at = CURRENT_TIMESTAMP
  WHERE qualificacao_id = NEW.id
    AND deleted_at IS NULL
    AND renovada != 1;
END;

-- Trigger: Registrar na auditoria
CREATE TRIGGER IF NOT EXISTS trg_tipo_update_auditoria
AFTER UPDATE ON qualificacoes_tipos
WHEN NEW.validade != OLD.validade 
  OR NEW.vencimento_fim_mes != OLD.vencimento_fim_mes
BEGIN
  INSERT INTO auditoria_avancada_v2 (
    usuario_id,
    acao,
    tabela,
    registro_id,
    valores_anteriores,
    valores_novos,
    detalhes,
    created_at
  ) VALUES (
    1,
    'UPDATE_TIPO_RECALCULO',
    'qualificacoes_tipos',
    NEW.id,
    json_object(
      'validade', OLD.validade,
      'vencimento_fim_mes', OLD.vencimento_fim_mes
    ),
    json_object(
      'validade', NEW.validade,
      'vencimento_fim_mes', NEW.vencimento_fim_mes
    ),
    json_object(
      'codigo', NEW.codigo,
      'registros_afetados', (
        SELECT COUNT(*) 
        FROM qualificacoes_historico 
        WHERE qualificacao_id = NEW.id 
          AND deleted_at IS NULL
      )
    ),
    CURRENT_TIMESTAMP
  );
END;
