-- Migration 0253: índices para detecção de sobreposição e vínculo alocação-evento
-- Otimiza queries de conflito de período no módulo de escalas.
-- ROLLBACK EMERGENCIAL:
--   DROP INDEX IF EXISTS idx_eventos_funcionario_datas;
--   DROP INDEX IF EXISTS idx_eventos_alocacao_id;
--   ALTER TABLE escala_eventos DROP COLUMN alocacao_id;  -- executar apenas se suportado no ambiente

-- Índice composto para verificação de sobreposição de eventos por funcionário
CREATE INDEX IF NOT EXISTS idx_eventos_funcionario_datas
  ON escala_eventos(funcionario_id, data_inicio, data_fim)
  WHERE deleted_at IS NULL AND status != 'cancelado';

-- Coluna para vincular evento à alocação que o gerou (nullable para retrocompatibilidade)
ALTER TABLE escala_eventos ADD COLUMN alocacao_id TEXT REFERENCES escala_alocacoes(id);

-- Índice para remover eventos auto-gerados ao fazer soft-delete de uma alocação
CREATE INDEX IF NOT EXISTS idx_eventos_alocacao_id
  ON escala_eventos(alocacao_id)
  WHERE deleted_at IS NULL AND gerado_automaticamente = 1;
