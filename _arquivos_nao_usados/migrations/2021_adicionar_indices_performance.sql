-- Migration: Adicionar índices para otimização de queries frequentes
-- Data: 2025-11-05
-- Objetivo: Melhorar performance de filtros em N+1 queries e consultas com JOIN

-- Índices para agendamentos_simulador (operação mais frequente)
CREATE INDEX IF NOT EXISTS idx_agendamentos_simulador_deleted_at 
  ON agendamentos_simulador(deleted_at) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_agendamentos_simulador_status 
  ON agendamentos_simulador(status, deleted_at);

CREATE INDEX IF NOT EXISTS idx_agendamentos_simulador_funcionario 
  ON agendamentos_simulador(funcionario_id, deleted_at);

CREATE INDEX IF NOT EXISTS idx_agendamentos_simulador_instrutor 
  ON agendamentos_simulador(instrutor_id, deleted_at);

-- Índices para fichas_sessao (frequently joined)
CREATE INDEX IF NOT EXISTS idx_fichas_sessao_deleted_at 
  ON fichas_sessao(deleted_at) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fichas_sessao_colaborador 
  ON fichas_sessao(colaborador_id_aluno, deleted_at);

CREATE INDEX IF NOT EXISTS idx_fichas_sessao_instrutor 
  ON fichas_sessao(instrutor_id, deleted_at);

CREATE INDEX IF NOT EXISTS idx_fichas_sessao_template 
  ON fichas_sessao(template_id, deleted_at);

-- Índices para qualificacoes (muitas queries de filtro)
CREATE INDEX IF NOT EXISTS idx_qualificacoes_deleted_at 
  ON qualificacoes(deleted_at) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_qualificacoes_funcionario 
  ON qualificacoes(funcionario_id, deleted_at);

CREATE INDEX IF NOT EXISTS idx_qualificacoes_tipo 
  ON qualificacoes(tipo, deleted_at);

CREATE INDEX IF NOT EXISTS idx_qualificacoes_status_renovada 
  ON qualificacoes(is_renovada, deleted_at);

CREATE INDEX IF NOT EXISTS idx_qualificacoes_vencimento 
  ON qualificacoes(data_vencimento, deleted_at);

-- Índices para funcionarios (base de muitas queries)
CREATE INDEX IF NOT EXISTS idx_funcionarios_deleted_at 
  ON funcionarios(deleted_at) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_funcionarios_status 
  ON funcionarios(status, deleted_at);

CREATE INDEX IF NOT EXISTS idx_funcionarios_matricula 
  ON funcionarios(matricula, deleted_at);

-- Índices para simuladores
CREATE INDEX IF NOT EXISTS idx_simuladores_deleted_at 
  ON simuladores(deleted_at) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_simuladores_status 
  ON simuladores(status, deleted_at);

-- Índices para manobras (lookup frequente)
CREATE INDEX IF NOT EXISTS idx_manobras_deleted_at 
  ON manobras(deleted_at) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_manobras_categoria 
  ON manobras(categoria, deleted_at);

-- Índices para relações (FK lookups)
CREATE INDEX IF NOT EXISTS idx_fichas_manobras_ficha 
  ON ficha_manobras_avaliacao(ficha_id);

CREATE INDEX IF NOT EXISTS idx_fichas_manobras_manobra 
  ON ficha_manobras_avaliacao(manobra_id);

-- Índices compostos para queries complexas
CREATE INDEX IF NOT EXISTS idx_agendamentos_periodo 
  ON agendamentos_simulador(simulador_id, data_inicio, deleted_at) 
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_qualificacoes_funcionario_vencimento 
  ON qualificacoes(funcionario_id, data_vencimento, deleted_at) 
  WHERE deleted_at IS NULL;

-- Índices para campos de busca text
CREATE INDEX IF NOT EXISTS idx_funcionarios_nome 
  ON funcionarios(nome, deleted_at);

CREATE INDEX IF NOT EXISTS idx_qualificacoes_codigo 
  ON qualificacoes(codigo, deleted_at);

-- PRAGMA para otimização
PRAGMA optimize;

-- Análise de integridade
-- PRAGMA integrity_check;
