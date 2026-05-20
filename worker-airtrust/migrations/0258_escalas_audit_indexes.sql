-- ================================================================
-- Migration 0258: Índices de performance adicionais para módulo de escalas
-- Data: 2026-03-09
-- Objetivo: Criar índices compostos faltantes identificados em auditoria
-- ================================================================

-- 1. Índice composto aeronave+funcao (acelera lookup de slot ocupado)
CREATE INDEX IF NOT EXISTS idx_alocacoes_aeronave_funcao
  ON escala_alocacoes(aeronave_id, funcao)
  WHERE deleted_at IS NULL;

-- 2. Índice composto funcionario+data_inicio (acelera checks de conflito)
CREATE INDEX IF NOT EXISTS idx_escala_eventos_funcionario_data
  ON escala_eventos(funcionario_id, data_inicio)
  WHERE deleted_at IS NULL;

-- 3. Índice composto empresa+mes+ano para quinzenas (lookup mais frequente)
CREATE INDEX IF NOT EXISTS idx_escalas_quinzenas_empresa_mes_ano
  ON escalas_quinzenas(empresa_id, mes, ano)
  WHERE deleted_at IS NULL;

-- 4. Índice composto escala+funcionario para alocacoes (conflito por escala)
CREATE INDEX IF NOT EXISTS idx_alocacoes_escala_funcionario
  ON escala_alocacoes(escala_id, funcionario_id)
  WHERE deleted_at IS NULL;

-- 5. Índice tipo_evento para eventos (filtragem por tipo)
CREATE INDEX IF NOT EXISTS idx_escala_eventos_tipo
  ON escala_eventos(escala_id, tipo_evento)
  WHERE deleted_at IS NULL;

-- 6. Índice status para escalas_mensais (listagem por status)
CREATE INDEX IF NOT EXISTS idx_escalas_mensais_status
  ON escalas_mensais(empresa_id, status)
  WHERE deleted_at IS NULL;
