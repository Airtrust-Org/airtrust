-- Performance: add composite indexes for common query patterns
-- Missing indexes identified by audit of escalas-alocacoes.ts hot paths

-- Overlap check: escala_id + funcionario_id + deleted_at (checarSobreposicaoFuncionario)
CREATE INDEX IF NOT EXISTS idx_alocacoes_escala_funcionario_deleted
  ON escala_alocacoes (escala_id, funcionario_id, deleted_at);

-- Slot overlap check: aeronave_id + funcao + dates (checarSobreposicaoSlot)
CREATE INDEX IF NOT EXISTS idx_alocacoes_aeronave_funcao_datas
  ON escala_alocacoes (aeronave_id, funcao, data_inicio, data_fim)
  WHERE deleted_at IS NULL;

-- Alert lookups: escala_id + empresa_id + tipo (atualizarAlertasCoberturaBatch)
CREATE INDEX IF NOT EXISTS idx_alertas_escala_empresa_tipo
  ON escala_alertas (escala_id, empresa_id, tipo)
  WHERE deleted_at IS NULL;

-- Coverage query: escala_id + aeronave_id (recalcularCoberturaAeronave)
CREATE INDEX IF NOT EXISTS idx_cobertura_diaria_escala_aeronave
  ON escala_cobertura_diaria (escala_id, aeronave_id);

-- Eventos auto-gerados lookup (regenerarEventosAutomaticosFuncionarioEscala)
CREATE INDEX IF NOT EXISTS idx_eventos_escala_funcionario_auto
  ON escala_eventos (escala_id, funcionario_id, gerado_automaticamente)
  WHERE deleted_at IS NULL;
