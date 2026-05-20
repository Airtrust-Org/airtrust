-- 0234_indices_escalas.sql
-- Índices de performance para módulo de escalas/notificações

CREATE INDEX IF NOT EXISTS idx_escala_tripulacoes_escala_id_v2
  ON escala_tripulacoes(escala_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_escala_tripulacoes_pic_id_v2
  ON escala_tripulacoes(pic_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_escala_tripulacoes_sic_id_v2
  ON escala_tripulacoes(sic_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_escala_eventos_escala_id_v2
  ON escala_eventos(escala_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_escalas_mensais_empresa_ano_v2
  ON escalas_mensais(empresa_id, ano)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notificacoes_funcionario_v2
  ON notificacoes(funcionario_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_escalas_tipos_evento_empresa_v2
  ON escalas_tipos_evento_config(empresa_id)
  WHERE deleted_at IS NULL;
