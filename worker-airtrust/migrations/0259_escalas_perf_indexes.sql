-- Performance indexes para escalas-calendario
-- Melhora JOINs em escala_eventos(tripulacao_id) e compound lookup

CREATE INDEX IF NOT EXISTS idx_escala_eventos_tripulacao_id
  ON escala_eventos(tripulacao_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_escala_alocacoes_aeronave_funcao_data
  ON escala_alocacoes(escala_id, aeronave_id, funcao, data_inicio)
  WHERE deleted_at IS NULL;
