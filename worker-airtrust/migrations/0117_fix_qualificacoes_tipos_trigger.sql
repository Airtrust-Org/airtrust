-- Migration 0117: Fix qualificacoes_tipos UPDATE trigger
-- Date: 29 November 2025
-- Problem: Trigger referencing non-existent columns (origem, valores_anteriores, validade_meses)
-- Solution: Recreate trigger with correct column names

DROP TRIGGER IF EXISTS trg_qualificacoes_tipos_update;

CREATE TRIGGER trg_qualificacoes_tipos_update
AFTER UPDATE ON qualificacoes_tipos
FOR EACH ROW
WHEN OLD.deleted_at IS NULL  -- Apenas updates em registros ativos
BEGIN
  INSERT INTO auditoria_avancada_v2 (
    tabela, 
    registro_id, 
    acao, 
    dados_anteriores, 
    dados_novos
  )
  VALUES (
    'qualificacoes_tipos', 
    NEW.id, 
    'UPDATE',
    json_object(
      'codigo', OLD.codigo, 
      'nome', OLD.nome, 
      'validade', OLD.validade,
      'vencimento_fim_mes', OLD.vencimento_fim_mes,
      'categoria', OLD.categoria,
      'ativo', OLD.ativo
    ),
    json_object(
      'codigo', NEW.codigo, 
      'nome', NEW.nome, 
      'validade', NEW.validade,
      'vencimento_fim_mes', NEW.vencimento_fim_mes,
      'categoria', NEW.categoria,
      'ativo', NEW.ativo
    )
  );
END;

-- Verificação
SELECT 'Migration 0117 complete - trigger fixed' as status;
