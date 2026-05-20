-- =====================================================
-- Migration 0098: Índices de Performance (Simplificado)
-- Data: 2026-01-14
-- Descrição: Adiciona índices para otimizar queries mais frequentes
-- =====================================================

-- Índice para soft delete (usado em TODAS as queries)
CREATE INDEX IF NOT EXISTS idx_agendamentos_deleted 
  ON simulador_agendamentos(deleted_at);

-- Índice para filtros de data
CREATE INDEX IF NOT EXISTS idx_agendamentos_data 
  ON simulador_agendamentos(data) WHERE deleted_at IS NULL;

-- Índice composto para busca por período
CREATE INDEX IF NOT EXISTS idx_agendamentos_data_deleted 
  ON simulador_agendamentos(data, deleted_at);

-- Índice para fichas por sessão (N+1 queries)
CREATE INDEX IF NOT EXISTS idx_fichas_sessao_deleted 
  ON fichas_sessao(agendamento_slot_id, deleted_at);

-- Índice para participantes por sessão (N+1 queries)
CREATE INDEX IF NOT EXISTS idx_participantes_sessao_deleted 
  ON sessoes_participantes(sessao_id, deleted_at);

-- Índice para busca de funcionários
CREATE INDEX IF NOT EXISTS idx_funcionarios_deleted 
  ON funcionarios(deleted_at);

-- Índice para busca de simuladores
CREATE INDEX IF NOT EXISTS idx_simuladores_deleted 
  ON simuladores(deleted_at);
